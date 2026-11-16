import { db } from "@/lib/db";
import { saldoDeVenta, totalesDeVenta } from "./calculos";

/** La venta con todo lo que necesita la pantalla de pedido y el ticket. */
export async function ventaCompleta(id: string) {
  const v = await db.venta.findUnique({
    where: { id },
    include: {
      local: {
        select: { id: true, nombre: true, razonSocialCompras: true, cuitCompras: true, arcaPuntoVenta: true, arcaCertificado: true, arcaDatosTicket: true },
      },
      comprobantes: { orderBy: { creadoEn: "asc" } },
      mesa: { select: { id: true, numero: true, salon: { select: { nombre: true } } } },
      mozo: { select: { id: true, nombre: true } },
      abiertaPor: { select: { nombre: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: { cocina: { select: { id: true, nombre: true } }, creadoPor: { select: { nombre: true } } },
      },
      pagos: { orderBy: { createdAt: "asc" }, include: { medioPago: { select: { nombre: true, tipo: true } } } },
    },
  });
  if (!v) return null;
  const totales = totalesDeVenta(v.items, { pct: v.descuentoPct, monto: v.descuentoMonto });
  const total = v.estado === "CERRADA" && v.total != null ? v.total : totales.total;
  return {
    id: v.id,
    numero: v.numero,
    tipo: v.tipo,
    estado: v.estado,
    local: { id: v.local.id, nombre: v.local.nombre },
    factura: {
      habilitada: Boolean(v.local.arcaPuntoVenta && v.local.arcaCertificado),
      emisor: { razonSocial: v.local.razonSocialCompras, cuit: v.local.cuitCompras, datos: v.local.arcaDatosTicket },
      comprobantes: v.comprobantes.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        puntoVenta: c.puntoVenta,
        numero: c.numero,
        produccion: c.produccion,
        docTipo: c.docTipo,
        docNro: c.docNro,
        condicionIvaReceptor: c.condicionIvaReceptor,
        neto: c.neto,
        iva: c.iva,
        total: c.total,
        cae: c.cae,
        caeVence: c.caeVence?.toISOString().slice(0, 10) ?? null,
        emitidoEn: c.emitidoEn?.toISOString() ?? null,
        error: c.error,
      })),
    },
    mesa: v.mesa ? { id: v.mesa.id, numero: v.mesa.numero, salon: v.mesa.salon.nombre } : null,
    mozo: v.mozo,
    abiertaPor: v.abiertaPor.nombre,
    abiertaEn: v.abiertaEn.toISOString(),
    cerradaEn: v.cerradaEn?.toISOString() ?? null,
    comensales: v.comensales,
    cliente: v.cliente,
    comentario: v.comentario,
    descuentoPct: v.descuentoPct,
    descuentoMonto: v.descuentoMonto,
    descuentoMotivo: v.descuentoMotivo,
    motivoAnulacion: v.motivoAnulacion,
    items: v.items.map((i) => ({
      id: i.id,
      productoId: i.productoId,
      nombre: i.nombre,
      precio: i.precio,
      cantidad: i.cantidad,
      comentario: i.comentario,
      cocina: i.cocina,
      creadoPor: i.creadoPor.nombre,
      createdAt: i.createdAt.toISOString(),
      enviadoEn: i.enviadoEn?.toISOString() ?? null,
      anulado: i.anulado,
      motivoAnulacion: i.motivoAnulacion,
      comentarioAnulacion: i.comentarioAnulacion,
    })),
    pagos: v.pagos.map((p) => ({
      id: p.id,
      medio: p.medioPago.nombre,
      tipo: p.medioPago.tipo,
      monto: p.monto,
      propina: p.propina,
      anulado: p.anulado,
      createdAt: p.createdAt.toISOString(),
    })),
    ...totales,
    total,
    ...saldoDeVenta(total, v.pagos),
  };
}

export type VentaCompleta = NonNullable<Awaited<ReturnType<typeof ventaCompleta>>>;

/** La caja abierta del local (la más reciente si hubiera varias). */
export function cajaAbierta(localId: string) {
  return db.caja.findFirst({ where: { localId, cerradaEn: null }, orderBy: { abiertaEn: "desc" } });
}
