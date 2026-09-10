/**
 * Conciliación bancaria: lo que Fudo dice que se cobró por tarjeta y
 * transferencia, contra lo que de verdad entró al banco.
 *
 * Es por período y medio de pago, no remito por remito: Nave liquida en
 * lotes con uno o más días de demora y ya neta de su comisión, así que una
 * venta puntual de Fudo nunca va a calzar contra una acreditación puntual
 * del banco. Comparar totales del mismo rango de fechas es lo que sí se
 * puede sostener sin inventar una fecha de liquidación que nadie declaró.
 *
 * Quedan afuera a propósito: el efectivo (nunca pasa por el banco) y
 * Pedidos Ya / Uber Eats (liquidan a otra cuenta, todavía no cargada acá).
 * Se muestran aparte para que la comparación no los cuente ni como fantasma
 * ni como faltante.
 */

import { costoDeVenta, type Comisiones, type CostoDeVenta } from "./impuestos";

export type MovimientoBancoResumen = {
  categoria: "TARJETA" | "TRANSFERENCIA" | "IMPUESTO_COMISION" | "OTRO";
  credito: number;
};

export type FilaConciliacion = {
  medio: "Tarjeta" | "Transferencia";
  fudoBruto: number;
  comisionEsperada: number;
  netoEsperado: number;
  banco: number;
  /** banco − netoEsperado. Positivo: entró más de lo esperado. */
  diferencia: number;
  /** Sobre `netoEsperado`. `null` si no hay base contra la que medir. */
  diferenciaPct: number | null;
};

export type Conciliacion = {
  filas: FilaConciliacion[];
  totalFudoBruto: number;
  totalNetoEsperado: number;
  totalBanco: number;
  totalDiferencia: number;
  /** Ventas que no pasan por este extracto: no es una falla, es fuera de alcance. */
  excluido: { efectivo: number; delivery: number; sinReconocer: number };
  /** Plata real del banco que no es venta ni la venta de este extracto: impuestos, comisiones, pagos a proveedores. */
  bancoImpuestosComisiones: number;
  bancoOtros: number;
  /** Venta bruta total del período, con IVA, sea cual sea el medio. Para IIBB
   * e IVA: son sobre TODA la venta, no sólo sobre lo que concilia el banco. */
  ventaTotal: number;
  /** `ventaTotal` menos lo cobrado en efectivo — la base que de verdad se retiene. */
  ventaNoEfectivo: number;
};

const ETIQUETAS_TARJETA = new Set(["Crédito", "Débito", "Billetera / QR"]);

export function conciliar(
  porMedioPago: Record<string, number>,
  comisiones: Comisiones,
  movimientosBanco: MovimientoBancoResumen[]
): Conciliacion {
  const cdv: CostoDeVenta = costoDeVenta(porMedioPago, comisiones);

  let tarjetaBruto = 0;
  let tarjetaComision = 0;
  let transferenciaBruto = 0;

  for (const m of cdv.porMedio) {
    if (ETIQUETAS_TARJETA.has(m.etiqueta)) {
      tarjetaBruto += m.monto;
      tarjetaComision += m.comision;
    } else if (m.etiqueta === "Sin comisión") {
      transferenciaBruto += m.monto;
    }
  }

  const bancoTarjeta = movimientosBanco
    .filter((m) => m.categoria === "TARJETA")
    .reduce((s, m) => s + m.credito, 0);
  const bancoTransferencia = movimientosBanco
    .filter((m) => m.categoria === "TRANSFERENCIA")
    .reduce((s, m) => s + m.credito, 0);
  const bancoImpuestosComisiones = movimientosBanco
    .filter((m) => m.categoria === "IMPUESTO_COMISION")
    .reduce((s, m) => s + m.credito, 0);
  const bancoOtros = movimientosBanco.filter((m) => m.categoria === "OTRO").reduce((s, m) => s + m.credito, 0);

  const fila = (
    medio: FilaConciliacion["medio"],
    fudoBruto: number,
    comisionEsperada: number,
    banco: number
  ): FilaConciliacion => {
    const netoEsperado = fudoBruto - comisionEsperada;
    return {
      medio,
      fudoBruto,
      comisionEsperada,
      netoEsperado,
      banco,
      diferencia: banco - netoEsperado,
      diferenciaPct: netoEsperado !== 0 ? ((banco - netoEsperado) / netoEsperado) * 100 : null,
    };
  };

  const filas: FilaConciliacion[] = [
    fila("Tarjeta", tarjetaBruto, tarjetaComision, bancoTarjeta),
    fila("Transferencia", transferenciaBruto, 0, bancoTransferencia),
  ];

  const totalFudoBruto = filas.reduce((s, f) => s + f.fudoBruto, 0);
  const totalNetoEsperado = filas.reduce((s, f) => s + f.netoEsperado, 0);
  const totalBanco = filas.reduce((s, f) => s + f.banco, 0);

  return {
    filas,
    totalFudoBruto,
    totalNetoEsperado,
    totalBanco,
    totalDiferencia: totalBanco - totalNetoEsperado,
    excluido: {
      efectivo: cdv.ventaSinComision - transferenciaBruto,
      delivery: cdv.ventaDelivery,
      sinReconocer: cdv.ventaSinTasa,
    },
    bancoImpuestosComisiones,
    bancoOtros,
    ventaTotal: cdv.total,
    ventaNoEfectivo: cdv.total - (cdv.ventaSinComision - transferenciaBruto),
  };
}
