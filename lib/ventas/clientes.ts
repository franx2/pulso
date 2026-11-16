import { db } from "@/lib/db";

/**
 * Cuánto debe cada cliente: lo cobrado "a cuenta corriente" en sus ventas
 * cerradas, menos lo que fue pagando. Positivo = nos debe.
 */
export async function saldosDeClientes(ids: string[]): Promise<Map<string, number>> {
  const saldos = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return saldos;
  const [fiado, pagado] = await Promise.all([
    db.pagoVenta.findMany({
      where: { anulado: false, medioPago: { tipo: "CUENTA_CORRIENTE" }, venta: { clienteId: { in: ids }, estado: "CERRADA" } },
      select: { monto: true, venta: { select: { clienteId: true } } },
    }),
    db.pagoCliente.groupBy({ by: ["clienteId"], where: { clienteId: { in: ids } }, _sum: { monto: true } }),
  ]);
  for (const p of fiado) saldos.set(p.venta.clienteId!, (saldos.get(p.venta.clienteId!) ?? 0) + p.monto);
  for (const p of pagado) saldos.set(p.clienteId, (saldos.get(p.clienteId) ?? 0) - (p._sum.monto ?? 0));
  return saldos;
}

/** Los campos editables de un cliente, limpios. Error si falta el nombre o el descuento no tiene sentido. */
export function datosDeCliente(body: Record<string, unknown> | null, parcial = false) {
  const texto = (k: string, max: number) => {
    const v = body?.[k];
    if (v === undefined) return undefined;
    return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  };
  const nombre = texto("nombre", 80);
  if (!parcial && !nombre) return { error: "Escribí el nombre del cliente" };
  if (parcial && nombre === null) return { error: "El nombre no puede quedar vacío" };
  let descuentoPct: number | null | undefined;
  if (body?.descuentoPct !== undefined) {
    const n = body.descuentoPct === null || body.descuentoPct === "" ? null : Number(body.descuentoPct);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) return { error: "El descuento va de 0 a 100%" };
    descuentoPct = n && n > 0 ? n : null;
  }
  return {
    ok: {
      nombre: nombre ?? undefined,
      telefono: texto("telefono", 40),
      email: texto("email", 120),
      documento: texto("documento", 20),
      direccion: texto("direccion", 160),
      notas: texto("notas", 500),
      descuentoPct,
    },
  };
}
