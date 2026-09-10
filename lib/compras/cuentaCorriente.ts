/**
 * Cuenta corriente con la fábrica (Bianconero), por local.
 *
 * No se guarda un saldo en ningún lado: se recalcula siempre a partir de tres
 * fuentes que ya existen o se cargan a mano —el saldo inicial del local, los
 * remitos que llegan solos por mail, los pagos que carga el usuario— porque
 * un saldo guardado se desincroniza en cuanto alguien corrige un remito viejo
 * y nadie se acuerda de tocar el número.
 *
 * El royalty ("USO DE MARCA") entra como un remito más: lo manda la misma
 * empresa por el mismo mail, así que es la misma deuda. El control de
 * Compras → Royalty sigue existiendo aparte para comparar contra la venta;
 * esto sólo dice cuánto se debe.
 */

export type RemitoMovimiento = {
  id: string;
  fecha: string;
  numero: string;
  total: number;
  tipo: "MERCADERIA" | "SERVICIO";
};

export type PagoMovimiento = {
  id: string;
  fecha: string;
  monto: number;
  medio: string | null;
  nota: string | null;
};

export type MovimientoCuenta = {
  fecha: string;
  tipo: "SALDO_INICIAL" | "REMITO" | "PAGO";
  /** Sólo en remitos: para filtrar mercadería y royalty por separado sin
   * depender de parsear la descripción, que es texto para mostrar. */
  subtipo?: "MERCADERIA" | "SERVICIO";
  descripcion: string;
  /** Lo que aumenta la deuda: el saldo inicial y cada remito. */
  debe: number;
  /** Lo que la reduce: cada pago. */
  haber: number;
  /** Acumulado después de este movimiento. */
  saldo: number;
  pagoId?: string;
};

export type CuentaCorriente = {
  saldoInicial: number;
  fechaInicial: string | null;
  movimientos: MovimientoCuenta[];
  totalRemitos: number;
  totalPagos: number;
  saldo: number;
};

export function calcularCuentaCorriente(params: {
  saldoInicial: number;
  fechaInicial: string | null;
  remitos: RemitoMovimiento[];
  pagos: PagoMovimiento[];
}): CuentaCorriente {
  const { saldoInicial, fechaInicial, remitos, pagos } = params;

  // Sólo lo posterior al corte: lo anterior ya está adentro del número que
  // cargó el usuario. Sin fecha de corte no hay nada que filtrar todavía.
  const remitosPosteriores = fechaInicial
    ? remitos.filter((r) => r.fecha > fechaInicial)
    : remitos;

  const filas: MovimientoCuenta[] = [];

  if (fechaInicial || saldoInicial !== 0) {
    filas.push({
      fecha: fechaInicial ?? "0000-01-01",
      tipo: "SALDO_INICIAL",
      descripcion: "Saldo inicial",
      debe: saldoInicial,
      haber: 0,
      saldo: 0, // se completa abajo
    });
  }

  for (const r of remitosPosteriores) {
    filas.push({
      fecha: r.fecha,
      tipo: "REMITO",
      subtipo: r.tipo,
      descripcion: r.tipo === "SERVICIO" ? `Royalty ${r.numero}` : `Remito ${r.numero}`,
      debe: r.total,
      haber: 0,
      saldo: 0,
    });
  }

  for (const p of pagos) {
    filas.push({
      fecha: p.fecha,
      tipo: "PAGO",
      descripcion: p.medio ? `Pago (${p.medio})` : "Pago",
      debe: 0,
      haber: p.monto,
      saldo: 0,
      pagoId: p.id,
    });
  }

  // A igual fecha, el saldo inicial va primero y el resto respeta el orden
  // en que se armó la lista (remitos, después pagos) para que el orden sea
  // estable y no dependa de cómo ordene `sort` los empates.
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha));

  let saldo = 0;
  for (const fila of filas) {
    saldo += fila.debe - fila.haber;
    fila.saldo = saldo;
  }

  const totalRemitos = remitosPosteriores.reduce((s, r) => s + r.total, 0);
  const totalPagos = pagos.reduce((s, p) => s + p.monto, 0);

  return {
    saldoInicial,
    fechaInicial,
    movimientos: filas,
    totalRemitos,
    totalPagos,
    saldo,
  };
}
