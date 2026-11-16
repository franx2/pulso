import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rangoDias } from "@/lib/periodo";
import { finDiaAR, inicioDiaAR } from "@/lib/fechaAR";
import { totalesDeVenta } from "@/lib/ventas/calculos";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Todas las ventas del local en el período, de la más nueva a la más vieja. */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "list_sales");
  if (prohibido) return prohibido;
  const params = new URL(request.url).searchParams;
  const localId = params.get("localId") ?? "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();
  const { desde, hasta } = rangoDias(params);

  const ventas = await db.venta.findMany({
    where: { localId, abiertaEn: { gte: inicioDiaAR(desde), lte: finDiaAR(hasta) } },
    orderBy: { abiertaEn: "desc" },
    take: 2000,
    select: {
      id: true,
      numero: true,
      tipo: true,
      estado: true,
      abiertaEn: true,
      cerradaEn: true,
      cliente: true,
      comensales: true,
      descuentoPct: true,
      descuentoMonto: true,
      descuentoMotivo: true,
      motivoAnulacion: true,
      total: true,
      mesa: { select: { numero: true, salon: { select: { nombre: true } } } },
      mozo: { select: { nombre: true } },
      abiertaPor: { select: { nombre: true } },
      items: { select: { precio: true, cantidad: true, anulado: true, descuentoPct: true, descuentoMonto: true } },
      pagos: { where: { anulado: false }, select: { monto: true, medioPago: { select: { nombre: true } } } },
      comprobantes: { where: { cae: { not: null } }, select: { tipo: true, puntoVenta: true, numero: true } },
    },
  });

  return NextResponse.json({
    desde,
    hasta,
    ventas: ventas.map((v) => {
      const t = totalesDeVenta(v.items, { pct: v.descuentoPct, monto: v.descuentoMonto });
      return {
        id: v.id,
        numero: v.numero,
        tipo: v.tipo,
        estado: v.estado,
        abiertaEn: v.abiertaEn.toISOString(),
        cerradaEn: v.cerradaEn?.toISOString() ?? null,
        donde: v.mesa ? `Mesa ${v.mesa.numero} · ${v.mesa.salon.nombre}` : v.cliente ? `Mostrador · ${v.cliente}` : "Mostrador",
        mozo: v.mozo?.nombre ?? v.abiertaPor.nombre,
        productos: v.items.filter((i) => !i.anulado).reduce((s, i) => s + i.cantidad, 0),
        bruto: t.bruto,
        descuento: t.descuentoItems + t.descuento,
        descuentoMotivo: v.descuentoMotivo,
        total: v.estado === "CERRADA" && v.total != null ? v.total : t.total,
        medios: [...new Set(v.pagos.map((p) => p.medioPago.nombre))],
        motivoAnulacion: v.motivoAnulacion,
        factura: v.comprobantes[0] ?? null,
      };
    }),
  });
}
