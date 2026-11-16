import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rangoDias } from "@/lib/periodo";
import { diasEntre, finDiaAR, inicioDiaAR, sumarDias } from "@/lib/fechaAR";
import { armarReporte, type VentaReporte } from "@/lib/ventas/reportes";
import { ordenarMedios } from "@/lib/ventas/importarFudo";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

export const maxDuration = 60;

async function ventasCerradas(localId: string, desde: string, hasta: string): Promise<VentaReporte[]> {
  const ventas = await db.venta.findMany({
    where: { localId, estado: "CERRADA", abiertaEn: { gte: inicioDiaAR(desde), lte: finDiaAR(hasta) } },
    select: {
      tipo: true,
      abiertaEn: true,
      descuentoPct: true,
      descuentoMonto: true,
      mozo: { select: { nombre: true } },
      abiertaPor: { select: { nombre: true } },
      items: {
        select: {
          nombre: true,
          precio: true,
          cantidad: true,
          anulado: true,
          descuentoPct: true,
          descuentoMonto: true,
          motivoAnulacion: true,
          anuladoPor: { select: { nombre: true } },
        },
      },
      pagos: { select: { monto: true, propina: true, anulado: true, medioPago: { select: { nombre: true } } } },
    },
  });
  return ventas.map((v) => ({
    tipo: v.tipo,
    abiertaEn: v.abiertaEn,
    descuentoPct: v.descuentoPct,
    descuentoMonto: v.descuentoMonto,
    mozo: v.mozo?.nombre ?? null,
    abiertaPor: v.abiertaPor.nombre,
    items: v.items.map((i) => ({ ...i, anuladoPor: i.anuladoPor?.nombre ?? null })),
    pagos: v.pagos.map((p) => ({ medio: p.medioPago.nombre, monto: p.monto, propina: p.propina, anulado: p.anulado })),
  }));
}

/** El reporte del local en el período, contra el período anterior del mismo largo. */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "list_sales");
  if (prohibido) return prohibido;
  const params = new URL(request.url).searchParams;
  const localId = params.get("localId") ?? "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();

  const { desde, hasta } = rangoDias(params);
  const largo = diasEntre(desde, hasta);
  const antesHasta = sumarDias(desde, -1);
  const antesDesde = sumarDias(desde, -largo);
  const [actuales, anteriores, medios] = await Promise.all([
    ventasCerradas(localId, desde, hasta),
    ventasCerradas(localId, antesDesde, antesHasta),
    db.medioPago.findMany({ where: { localId }, select: { nombre: true, tipo: true }, orderBy: { orden: "asc" } }),
  ]);
  const dias = Array.from({ length: largo }, (_, k) => sumarDias(desde, k));

  return NextResponse.json({
    desde,
    hasta,
    anterior: { desde: antesDesde, hasta: antesHasta },
    // El orden fijo de los medios del local: el color de cada uno sale de acá.
    ordenMedios: ordenarMedios(medios).map((m) => m.nombre),
    ...armarReporte(actuales, anteriores, dias),
  });
}
