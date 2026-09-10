import assert from "node:assert";
import { conciliar } from "./conciliacion";
import { COMISIONES_POR_DEFECTO } from "./impuestos";

/**
 * Lo que más importa acá es que el efectivo y el delivery NO entren a la
 * comparación —contarlos inflaría "lo que faltó" con plata que nunca iba a
 * pasar por el banco— y que la comisión esperada sea la neta, porque el
 * banco acredita después de descontarla.
 */

const porMedioPago = {
  "Tarj. Crédito": 100_000,
  "Tarj. Débito": 50_000,
  "Mercado pago": 30_000,
  Transferencia: 40_000,
  "Cta. Cte.": 10_000,
  Efectivo: 60_000,
  "Pedidos ya": 25_000,
  "Online Uber Eats": 15_000,
};

const banco = [
  { categoria: "TARJETA" as const, credito: 170_000 }, // debería ser ~178.700 (crédito+débito+MP netos)
  { categoria: "TRANSFERENCIA" as const, credito: 50_000 }, // transferencia + cta cte, sin comisión
  { categoria: "IMPUESTO_COMISION" as const, credito: 0 },
  { categoria: "OTRO" as const, credito: 200_000 }, // plata que entró por otro motivo, no venta
];

const r = conciliar(porMedioPago, COMISIONES_POR_DEFECTO, banco);

// Tarjeta: 100.000×0,96 + 50.000×0,98 + 30.000×0,98 (billetera usa la misma
// tasa que débito por defecto) = 96.000 + 49.000 + 29.400 = 174.400 neto.
const filaTarjeta = r.filas.find((f) => f.medio === "Tarjeta")!;
assert.strictEqual(filaTarjeta.fudoBruto, 180_000);
assert.ok(Math.abs(filaTarjeta.netoEsperado - 174_400) < 0.01, `neto ${filaTarjeta.netoEsperado}`);
assert.ok(Math.abs(filaTarjeta.diferencia - (170_000 - 174_400)) < 0.01);

// Transferencia no tiene comisión: neto esperado = bruto.
const filaTransferencia = r.filas.find((f) => f.medio === "Transferencia")!;
assert.strictEqual(filaTransferencia.fudoBruto, 50_000, "transferencia + cta. cte.");
assert.strictEqual(filaTransferencia.netoEsperado, 50_000);
assert.strictEqual(filaTransferencia.diferencia, 0);

// Efectivo y delivery quedan afuera de la comparación, no desaparecen.
assert.strictEqual(r.excluido.efectivo, 60_000);
assert.strictEqual(r.excluido.delivery, 40_000, "Pedidos ya + Uber Eats");

// La plata que entró por "Otro" no cuenta como venta conciliada.
assert.strictEqual(r.bancoOtros, 200_000);
assert.strictEqual(r.totalBanco, 220_000, "sólo tarjeta + transferencia, no Otro");

// ventaTotal es TODA la venta, IIBB e IVA se calculan sobre eso y no sólo
// sobre lo que pasa por este extracto.
assert.strictEqual(r.ventaTotal, 330_000, "suma de todos los medios, delivery y efectivo incluidos");
assert.strictEqual(r.ventaNoEfectivo, 270_000, "330.000 − 60.000 de efectivo");

// --- Sin remitos de banco cargados, la diferencia es el 100% del neto esperado ---

const sinBanco = conciliar(porMedioPago, COMISIONES_POR_DEFECTO, []);
assert.strictEqual(sinBanco.totalBanco, 0);
assert.ok(sinBanco.totalDiferencia < 0, "falta todo lo esperado");

console.log("lib/compras/conciliacion.test.ts: todos los checks pasaron");
