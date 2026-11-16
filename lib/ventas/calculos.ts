/**
 * Las cuentas de una venta y de una caja, puras: lo mismo calcula la pantalla
 * mientras el mozo carga y el servidor cuando cierra, así no pueden discrepar.
 */

export type ItemCalculo = { precio: number; cantidad: number; anulado: boolean };
export type PagoCalculo = { monto: number; propina: number; anulado: boolean };

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Subtotal de lo no anulado, el descuento y el total.
 * El porcentaje gana sobre el monto fijo si vienen los dos; el descuento nunca
 * deja el total por debajo de cero.
 */
export function totalesDeVenta(items: ItemCalculo[], descuento: { pct?: number | null; monto?: number | null } = {}) {
  const subtotal = redondear(items.filter((i) => !i.anulado).reduce((s, i) => s + i.precio * i.cantidad, 0));
  const pct = descuento.pct && descuento.pct > 0 ? Math.min(descuento.pct, 100) : 0;
  const bruto = pct > 0 ? (subtotal * pct) / 100 : Math.max(0, descuento.monto ?? 0);
  const montoDescuento = redondear(Math.min(subtotal, bruto));
  return { subtotal, descuento: montoDescuento, total: redondear(subtotal - montoDescuento) };
}

/** Lo cobrado (sin propinas) y cuánto falta. */
export function saldoDeVenta(total: number, pagos: PagoCalculo[]) {
  const validos = pagos.filter((p) => !p.anulado);
  const pagado = redondear(validos.reduce((s, p) => s + p.monto, 0));
  const propinas = redondear(validos.reduce((s, p) => s + p.propina, 0));
  return { pagado, propinas, falta: redondear(Math.max(0, total - pagado)), vuelto: redondear(Math.max(0, pagado - total)) };
}

export type PagoDeCaja = { monto: number; propina: number; anulado: boolean; efectivo: boolean; medio: string };
export type MovimientoDeCaja = { tipo: "INGRESO" | "EGRESO"; monto: number };

/**
 * El resumen de una caja: cuánto entró por cada medio y cuánta plata tiene
 * que haber en el cajón. La propina en efectivo también está en el cajón
 * (se reparte después), así que suma al esperado.
 */
export function resumenDeCaja(fondoInicial: number, pagos: PagoDeCaja[], movimientos: MovimientoDeCaja[]) {
  const validos = pagos.filter((p) => !p.anulado);
  const porMedio = new Map<string, number>();
  for (const p of validos) porMedio.set(p.medio, redondear((porMedio.get(p.medio) ?? 0) + p.monto));
  const efectivo = redondear(validos.filter((p) => p.efectivo).reduce((s, p) => s + p.monto + p.propina, 0));
  const ingresos = redondear(movimientos.filter((m) => m.tipo === "INGRESO").reduce((s, m) => s + m.monto, 0));
  const egresos = redondear(movimientos.filter((m) => m.tipo === "EGRESO").reduce((s, m) => s + m.monto, 0));
  return {
    vendido: redondear(validos.reduce((s, p) => s + p.monto, 0)),
    propinas: redondear(validos.reduce((s, p) => s + p.propina, 0)),
    porMedio: [...porMedio].map(([medio, monto]) => ({ medio, monto })).sort((a, b) => b.monto - a.monto),
    ingresos,
    egresos,
    efectivoEsperado: redondear(fondoInicial + efectivo + ingresos - egresos),
  };
}
