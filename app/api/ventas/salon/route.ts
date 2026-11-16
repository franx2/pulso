import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { totalesDeVenta } from "@/lib/ventas/calculos";
import { cajaAbierta } from "@/lib/ventas/consultas";
import { contextoVentas, noAutenticado } from "@/lib/ventas/sesion";

/**
 * El plano: salones con sus mesas y la venta en curso de cada una, las ventas
 * de mostrador abiertas y si hay caja. Es lo que mira el mozo todo el turno,
 * así que trae sólo lo necesario para pintar el plano.
 */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();

  const locales = await db.local.findMany({
    where: { salones: { some: {} } },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  const pedido = new URL(request.url).searchParams.get("localId");
  // Sin elegir, el local del empleado si vende; si no, el primero que vende.
  const localId =
    locales.find((l) => l.id === pedido)?.id ?? locales.find((l) => l.id === ctx.session.localId)?.id ?? locales[0]?.id ?? null;
  if (!localId) return NextResponse.json({ locales, localId: null, salones: [], mostrador: [], caja: null, permisos: ctx.permisos });

  const [salones, enCurso, caja] = await Promise.all([
    db.salon.findMany({
      where: { localId },
      orderBy: { orden: "asc" },
      select: {
        id: true,
        nombre: true,
        mesas: {
          where: { activa: true },
          orderBy: { numero: "asc" },
          select: { id: true, numero: true, fila: true, columna: true, forma: true, tamano: true },
        },
      },
    }),
    db.venta.findMany({
      where: { localId, estado: "EN_CURSO" },
      orderBy: { abiertaEn: "asc" },
      select: {
        id: true,
        numero: true,
        tipo: true,
        mesaId: true,
        abiertaEn: true,
        comensales: true,
        cliente: true,
        descuentoPct: true,
        descuentoMonto: true,
        mozo: { select: { nombre: true } },
        items: { select: { precio: true, cantidad: true, anulado: true, enviadoEn: true } },
        pagos: { where: { anulado: false }, select: { monto: true } },
      },
    }),
    cajaAbierta(localId),
  ]);

  const resumen = (v: (typeof enCurso)[number]) => ({
    id: v.id,
    numero: v.numero,
    abiertaEn: v.abiertaEn.toISOString(),
    comensales: v.comensales,
    cliente: v.cliente,
    mozo: v.mozo?.nombre ?? null,
    total: totalesDeVenta(v.items, { pct: v.descuentoPct, monto: v.descuentoMonto }).total,
    sinEnviar: v.items.filter((i) => !i.anulado && !i.enviadoEn).length,
    cobrado: v.pagos.reduce((s, p) => s + p.monto, 0),
  });
  const porMesa = new Map(enCurso.filter((v) => v.mesaId).map((v) => [v.mesaId!, resumen(v)]));

  return NextResponse.json({
    locales,
    localId,
    salones: salones.map((s) => ({ ...s, mesas: s.mesas.map((m) => ({ ...m, venta: porMesa.get(m.id) ?? null })) })),
    mostrador: enCurso.filter((v) => v.tipo !== "MESA").map(resumen),
    caja: caja && { id: caja.id, nombre: caja.nombre, abiertaEn: caja.abiertaEn.toISOString() },
    permisos: ctx.permisos,
  });
}
