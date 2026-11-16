import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { importarDeFudo } from "@/lib/ventas/importarFudo";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Más de mil productos: en la primera importación tarda. */
export const maxDuration = 300;

/** Qué locales se pueden importar de Fudo y qué tiene ya cada uno. */
export async function GET() {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const locales = await db.local.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      fudoApiKey: true,
      _count: { select: { salones: true, productosVenta: true, mediosPago: true } },
    },
  });
  return NextResponse.json({
    locales: locales.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      conFudo: Boolean(l.fudoApiKey),
      salones: l._count.salones,
      productos: l._count.productosVenta,
      medios: l._count.mediosPago,
    })),
    permisos: ctx.permisos,
  });
}

export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "update_products") ?? sinPermiso(ctx, "admin_rooms");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ localId?: string }>(request);
  try {
    const resultado = await importarDeFudo(body?.localId ?? "");
    return NextResponse.json({ resultado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo importar de Fudo" }, { status: 502 });
  }
}
