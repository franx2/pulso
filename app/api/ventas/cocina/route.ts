import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

const ESTADOS = ["PENDIENTE", "PREPARANDO", "LISTO", "ENTREGADO"] as const;
type EstadoCocina = (typeof ESTADOS)[number];
/** Lo enviado hace más de esto ya no es de este turno: no se muestra. */
const HORAS_VISIBLE = 12;

/** El monitor de cocina: lo enviado y todavía no entregado, de ventas no anuladas. */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const localId = new URL(request.url).searchParams.get("localId") ?? "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();

  const [items, cocinas] = await Promise.all([
    db.itemVenta.findMany({
      where: {
        anulado: false,
        estadoCocina: { not: "ENTREGADO" },
        enviadoEn: { gte: new Date(Date.now() - HORAS_VISIBLE * 3_600_000) },
        venta: { localId, estado: { not: "ANULADA" } },
      },
      orderBy: { enviadoEn: "asc" },
      select: {
        id: true,
        nombre: true,
        cantidad: true,
        comentario: true,
        cocinaId: true,
        estadoCocina: true,
        enviadoEn: true,
        listoEn: true,
        venta: { select: { id: true, numero: true, tipo: true, cliente: true, mesa: { select: { numero: true } }, mozo: { select: { nombre: true } } } },
      },
    }),
    db.cocina.findMany({ where: { localId }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  return NextResponse.json({ items, cocinas });
}

/** Mover renglones de estado: "en preparación", "listo", "entregado", o volver atrás. */
export async function PATCH(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_additions");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ ids?: string[]; estado?: string }>(request);
  const ids = (body?.ids ?? []).filter((x) => typeof x === "string").slice(0, 200);
  const estado = ESTADOS.find((e) => e === body?.estado) as EstadoCocina | undefined;
  if (!ids.length || !estado) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const locales = await db.itemVenta.findMany({ where: { id: { in: ids } }, select: { venta: { select: { localId: true } } } });
  if (locales.length !== ids.length) return NextResponse.json({ error: "Algún producto ya no existe" }, { status: 404 });
  if (locales.some((i) => !enLocal(ctx, i.venta.localId))) return fueraDeLocal();

  await db.itemVenta.updateMany({
    where: { id: { in: ids }, enviadoEn: { not: null } },
    data: { estadoCocina: estado, listoEn: estado === "LISTO" ? new Date() : estado === "ENTREGADO" ? undefined : null },
  });
  return NextResponse.json({ ok: true });
}
