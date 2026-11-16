import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { resumenDeCaja } from "@/lib/ventas/calculos";
import { cajaAbierta } from "@/lib/ventas/consultas";
import { ordenarMedios } from "@/lib/ventas/importarFudo";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso, type ContextoVentas } from "@/lib/ventas/sesion";

async function detalle(ctx: ContextoVentas, caja: { id: string; fondoInicial: number }) {
  const [pagos, movimientos, ventas] = await Promise.all([
    db.pagoVenta.findMany({
      where: { cajaId: caja.id },
      select: { monto: true, propina: true, anulado: true, medioPago: { select: { nombre: true, tipo: true } } },
    }),
    db.movimientoCaja.findMany({
      where: { cajaId: caja.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, tipo: true, monto: true, motivo: true, createdAt: true, empleado: { select: { nombre: true } } },
    }),
    db.venta.findMany({
      where: { cajaId: caja.id, estado: "CERRADA" },
      orderBy: { cerradaEn: "desc" },
      select: { id: true, numero: true, total: true, cerradaEn: true, tipo: true, mesa: { select: { numero: true } } },
    }),
  ]);
  const resumen = resumenDeCaja(
    caja.fondoInicial,
    pagos.map((p) => ({ ...p, efectivo: p.medioPago.tipo === "EFECTIVO", medio: p.medioPago.nombre })),
    movimientos
  );
  return {
    ...resumen,
    // Ver lo esperado es un permiso aparte: quien cuenta la caja no debería
    // saber de antemano cuánto "tiene que dar".
    efectivoEsperado: ctx.permisos.show_estimated_on_open_cash_counts ? resumen.efectivoEsperado : null,
    movimientos: movimientos.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), empleado: m.empleado.nombre })),
    ventas: ventas.map((v) => ({ ...v, cerradaEn: v.cerradaEn?.toISOString() ?? null, mesa: v.mesa?.numero ?? null })),
  };
}

/** La caja abierta del local con su resumen, y las últimas cerradas. */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const localId = new URL(request.url).searchParams.get("localId") ?? "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();

  const [abierta, cerradas, enCurso] = await Promise.all([
    cajaAbierta(localId),
    db.caja.findMany({
      where: { localId, cerradaEn: { not: null } },
      orderBy: { cerradaEn: "desc" },
      take: 10,
      include: { abiertaPor: { select: { nombre: true } }, cerradaPor: { select: { nombre: true } } },
    }),
    db.venta.count({ where: { localId, estado: "EN_CURSO" } }),
  ]);

  return NextResponse.json({
    abierta: abierta && {
      id: abierta.id,
      nombre: abierta.nombre,
      abiertaEn: abierta.abiertaEn.toISOString(),
      fondoInicial: abierta.fondoInicial,
      ventasEnCurso: enCurso,
      ...(await detalle(ctx, abierta)),
    },
    cerradas: cerradas.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      abiertaEn: c.abiertaEn.toISOString(),
      cerradaEn: c.cerradaEn!.toISOString(),
      abiertaPor: c.abiertaPor.nombre,
      cerradaPor: c.cerradaPor?.nombre ?? null,
      fondoInicial: c.fondoInicial,
      efectivoContado: c.efectivoContado,
    })),
    permisos: ctx.permisos,
    // El orden fijo de los medios del local: el color de cada uno sale de acá.
    ordenMedios: ordenarMedios(await db.medioPago.findMany({ where: { localId }, select: { nombre: true, tipo: true }, orderBy: { orden: "asc" } })).map(
      (m) => m.nombre
    ),
  });
}

/** Abrir la caja con su fondo inicial. Una sola abierta por local. */
export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_cash_counts");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ localId?: string; fondoInicial?: number; nombre?: string }>(request);
  const local = await db.local.findUnique({ where: { id: body?.localId ?? "" }, select: { id: true } });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 400 });
  if (!enLocal(ctx, local.id)) return fueraDeLocal();
  const fondo = Number(body?.fondoInicial ?? 0);
  if (!(fondo >= 0)) return NextResponse.json({ error: "El fondo inicial no puede ser negativo" }, { status: 400 });
  if (await cajaAbierta(local.id)) return NextResponse.json({ error: "Ya hay una caja abierta en este local" }, { status: 409 });

  const caja = await db.caja.create({
    data: { localId: local.id, fondoInicial: fondo, abiertaPorId: ctx.empleadoId, nombre: body?.nombre?.trim() || undefined },
    select: { id: true },
  });
  return NextResponse.json({ id: caja.id });
}
