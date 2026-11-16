import type { ComprobanteFiscal } from "@prisma/client";
import { db } from "@/lib/db";
import { cuitValido, desglosarIva, emitirComprobante, TIPO_CBTE } from "@/lib/arca";
import { facturadorDelLocal } from "@/lib/arcaLocal";

/**
 * Facturación de ventas con ARCA. Un local factura sólo si tiene cargados
 * certificado y punto de venta; si no, la venta sigue con ticket no fiscal.
 *
 * El comprobante se guarda ANTES de pedir el CAE. Si ARCA falla queda
 * pendiente (sin CAE) y se reintenta en el próximo cobro del local: la venta
 * se cierra igual.
 */

// ponytail: IVA 21% para toda la carta (servicio de restaurante). Alícuota por producto cuando alguno lleve 10,5%.
const ALICUOTA = 0.21;
const ID_IVA_21 = 5;

/** Datos del cliente para Factura A. Sin esto sale Factura B a consumidor final. */
export type ReceptorFacturaA = { cuit: string; condicion: 1 | 6 };

export function validarReceptor(r: unknown): ReceptorFacturaA | string | null {
  if (r == null) return null;
  const { cuit, condicion } = r as { cuit?: string; condicion?: number };
  if (!cuit || !cuitValido(cuit)) return "El CUIT para la Factura A no es válido";
  if (condicion !== 1 && condicion !== 6) return "Elegí si el cliente es responsable inscripto o monotributista";
  return { cuit: cuit.replace(/\D/g, ""), condicion };
}

async function localFactura(localId: string) {
  const l = await db.local.findUnique({ where: { id: localId }, select: { arcaPuntoVenta: true, arcaProduccion: true, arcaCertificado: true } });
  return l?.arcaPuntoVenta && l.arcaCertificado ? { puntoVenta: l.arcaPuntoVenta, produccion: l.arcaProduccion } : null;
}

/** Crea la factura de una venta cerrada y pide el CAE. No tira: un error queda guardado en el comprobante. */
export async function facturarVenta(ventaId: string, receptor: ReceptorFacturaA | null) {
  const venta = await db.venta.findUniqueOrThrow({
    where: { id: ventaId },
    select: { localId: true, total: true, comprobantes: { select: { tipo: true } } },
  });
  const local = await localFactura(venta.localId);
  if (!local || !venta.total || venta.total <= 0) return null;
  if (venta.comprobantes.some((c) => c.tipo === TIPO_CBTE.FACTURA_A || c.tipo === TIPO_CBTE.FACTURA_B)) return null;

  const { neto, iva } = desglosarIva(venta.total, ALICUOTA);
  const comprobante = await db.comprobanteFiscal.create({
    data: {
      ventaId,
      tipo: receptor ? TIPO_CBTE.FACTURA_A : TIPO_CBTE.FACTURA_B,
      puntoVenta: local.puntoVenta,
      produccion: local.produccion,
      docTipo: receptor ? 80 : 99,
      docNro: receptor?.cuit ?? "0",
      condicionIvaReceptor: receptor?.condicion ?? 5,
      neto,
      iva,
      total: venta.total,
    },
  });
  return pedirCae(comprobante.id);
}

/** Nota de crédito por la factura de una venta anulada. Si la factura nunca llegó a tener CAE, se descarta y listo. */
export async function anularFacturaDeVenta(ventaId: string) {
  const facturas = await db.comprobanteFiscal.findMany({
    where: { ventaId, tipo: { in: [TIPO_CBTE.FACTURA_A, TIPO_CBTE.FACTURA_B] } },
    include: { notasDeCredito: { select: { id: true } } },
  });
  for (const f of facturas) {
    if (!f.cae) {
      // ponytail: si ARCA dio el CAE pero se cortó antes de guardarlo, esta factura existe en ARCA sin registro acá. Se ve en "Mis Comprobantes".
      await db.comprobanteFiscal.delete({ where: { id: f.id } });
      continue;
    }
    if (f.notasDeCredito.length) continue;
    const nota = await db.comprobanteFiscal.create({
      data: {
        ventaId,
        tipo: f.tipo === TIPO_CBTE.FACTURA_A ? TIPO_CBTE.NOTA_CREDITO_A : TIPO_CBTE.NOTA_CREDITO_B,
        puntoVenta: f.puntoVenta,
        produccion: f.produccion,
        docTipo: f.docTipo,
        docNro: f.docNro,
        condicionIvaReceptor: f.condicionIvaReceptor,
        neto: f.neto,
        iva: f.iva,
        total: f.total,
        anulaId: f.id,
      },
    });
    await pedirCae(nota.id);
  }
}

/** Reintenta lo que quedó sin CAE en el local, del más viejo al más nuevo. */
export async function reintentarPendientes(localId: string) {
  const pendientes = await db.comprobanteFiscal.findMany({
    where: { cae: null, venta: { localId } },
    orderBy: { creadoEn: "asc" },
    select: { id: true },
    take: 20,
  });
  for (const p of pendientes) await pedirCae(p.id);
}

const TOMADO_MS = 2 * 60_000;

async function pedirCae(id: string): Promise<ComprobanteFiscal | null> {
  // Lo toma uno solo: dos cobros reintentando a la vez no piden dos CAE para lo mismo.
  const tomado = await db.comprobanteFiscal.updateMany({
    where: { id, cae: null, OR: [{ intentandoEn: null }, { intentandoEn: { lt: new Date(Date.now() - TOMADO_MS) } }] },
    data: { intentandoEn: new Date() },
  });
  if (tomado.count === 0) return null;

  const c = await db.comprobanteFiscal.findUniqueOrThrow({
    where: { id },
    include: { venta: { select: { localId: true } }, anula: true },
  });
  try {
    if (c.anula && !c.anula.cae) throw new Error("La factura que anula todavía no tiene CAE");
    const { credenciales, ticket } = await facturadorDelLocal(c.venta.localId);
    if (credenciales.produccion !== c.produccion) throw new Error("El local cambió entre pruebas y producción: este comprobante no se emite");
    const fecha = new Date();
    const r = await emitirComprobante(credenciales, ticket, {
      ptoVta: c.puntoVenta,
      tipo: c.tipo,
      docTipo: c.docTipo,
      docNro: c.docNro,
      condicionIvaReceptor: c.condicionIvaReceptor,
      fecha,
      ivas: [{ id: ID_IVA_21, base: c.neto, importe: c.iva }],
      asociado: c.anula?.numero && c.anula.emitidoEn
        ? { tipo: c.anula.tipo, ptoVta: c.anula.puntoVenta, numero: c.anula.numero, fecha: c.anula.emitidoEn }
        : undefined,
    });
    const venceCae = r.vence.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
    return await db.comprobanteFiscal.update({
      where: { id },
      data: { numero: r.numero, cae: r.cae, caeVence: new Date(`${venceCae}T00:00:00Z`), emitidoEn: fecha, error: null, intentandoEn: null },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[arca] comprobante ${id}:`, error);
    return await db.comprobanteFiscal.update({ where: { id }, data: { error: error.slice(0, 500), intentandoEn: null } });
  }
}
