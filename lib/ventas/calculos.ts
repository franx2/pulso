/**
 * Las cuentas de una venta y de una caja, puras: lo mismo calcula la pantalla
 * mientras el mozo carga y el servidor cuando cierra, así no pueden discrepar.
 */

export type ItemCalculo = {
  precio: number;
  cantidad: number;
  anulado: boolean;
  descuentoPct?: number | null;
  descuentoMonto?: number | null;
};
export type PagoCalculo = { monto: number; propina: number; anulado: boolean };

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Un descuento, igual para un renglón o para la venta entera: con porcentaje,
 * el monto es el tope (si es mayor a cero); sin porcentaje, es un monto fijo.
 * Nunca descuenta más que la base.
 */
export function montoDescuento(base: number, d: { pct?: number | null; monto?: number | null }) {
  const pct = d.pct && d.pct > 0 ? Math.min(d.pct, 100) : 0;
  const monto = Math.max(0, d.monto ?? 0);
  const bruto = pct > 0 ? Math.min((base * pct) / 100, monto > 0 ? monto : Infinity) : monto;
  return redondear(Math.min(Math.max(0, base), bruto));
}

/** Lo que cuesta un renglón con su descuento. */
export function totalDeLinea(i: ItemCalculo) {
  const bruto = i.precio * i.cantidad;
  return redondear(bruto - montoDescuento(bruto, { pct: i.descuentoPct, monto: i.descuentoMonto }));
}

/**
 * Bruto de lo no anulado, descuentos por producto, descuento de la venta y
 * total. El descuento de la venta se aplica sobre lo que quedó después de los
 * descuentos por producto.
 */
export function totalesDeVenta(items: ItemCalculo[], descuento: { pct?: number | null; monto?: number | null } = {}) {
  const validos = items.filter((i) => !i.anulado);
  const bruto = redondear(validos.reduce((s, i) => s + i.precio * i.cantidad, 0));
  const subtotal = redondear(validos.reduce((s, i) => s + totalDeLinea(i), 0));
  const montoVenta = montoDescuento(subtotal, descuento);
  return { bruto, descuentoItems: redondear(bruto - subtotal), subtotal, descuento: montoVenta, total: redondear(subtotal - montoVenta) };
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
