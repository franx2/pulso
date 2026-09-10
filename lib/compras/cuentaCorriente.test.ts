import assert from "node:assert";
import { calcularCuentaCorriente } from "./cuentaCorriente";

/**
 * Es una cuenta corriente real: si el saldo final no coincide con lo que el
 * dueño espera, deja de confiar en toda la pantalla. Lo que más importa
 * verificar es el corte —que un remito viejo no se cuente dos veces junto
 * con el saldo inicial— y que el orden de los movimientos sea estable.
 */

const remitos = [
  { id: "r1", fecha: "2026-08-15", numero: "16-5001", total: 100_000, tipo: "MERCADERIA" as const },
  { id: "r2", fecha: "2026-09-01", numero: "16-5010", total: 50_000, tipo: "MERCADERIA" as const },
  { id: "r3", fecha: "2026-09-03", numero: "16-5011", total: 30_000, tipo: "SERVICIO" as const },
];
const pagos = [{ id: "p1", fecha: "2026-09-02", monto: 40_000, medio: "Transferencia", nota: null }];

// --- El corte separa lo que ya está adentro del saldo inicial ---

const r = calcularCuentaCorriente({
  saldoInicial: 200_000,
  fechaInicial: "2026-08-31",
  remitos,
  pagos,
});

// El remito del 15/8 quedó afuera: es anterior al corte, ya está adentro del
// número que cargó el usuario. Contarlo también sería deuda duplicada.
assert.strictEqual(r.totalRemitos, 80_000, "sólo los remitos posteriores al corte");
assert.strictEqual(r.movimientos.some((m) => m.descripcion.includes("5001")), false);

// 200.000 + 50.000 + 30.000 (royalty) − 40.000 = 240.000
assert.strictEqual(r.saldo, 240_000);
assert.strictEqual(r.totalPagos, 40_000);

// El royalty entra como remito, con su propia etiqueta.
assert.ok(r.movimientos.some((m) => m.descripcion === "Royalty 16-5011"));

// El subtipo distingue mercadería de royalty sin parsear la descripción, que
// es texto para mostrar y no una clave para filtrar por.
const filaRoyalty = r.movimientos.find((m) => m.descripcion === "Royalty 16-5011")!;
assert.strictEqual(filaRoyalty.subtipo, "SERVICIO");
const filaRemito = r.movimientos.find((m) => m.descripcion === "Remito 16-5010")!;
assert.strictEqual(filaRemito.subtipo, "MERCADERIA");

// --- El saldo corre en orden cronológico, no en el orden en que se cargó ---

const fechas = r.movimientos.map((m) => m.fecha);
const ordenadas = [...fechas].sort();
assert.deepStrictEqual(fechas, ordenadas);

// El saldo de cada fila es el acumulado hasta ahí, no el total final.
const filaDelPago = r.movimientos.find((m) => m.tipo === "PAGO")!;
assert.strictEqual(filaDelPago.saldo, 210_000, "200.000 + 50.000 − 40.000, antes del royalty del 3/9");

// --- Sin corte cargado, todo cuenta ---

const sinCorte = calcularCuentaCorriente({ saldoInicial: 0, fechaInicial: null, remitos, pagos });
assert.strictEqual(sinCorte.totalRemitos, 180_000, "los tres remitos, nada que filtrar");
assert.strictEqual(sinCorte.movimientos.some((m) => m.tipo === "SALDO_INICIAL"), false, "no hay nada que mostrar");
assert.strictEqual(sinCorte.saldo, 140_000);

// --- Sin remitos ni pagos, el saldo es el inicial tal cual ---

const soloInicial = calcularCuentaCorriente({
  saldoInicial: 500_000,
  fechaInicial: "2026-08-31",
  remitos: [],
  pagos: [],
});
assert.strictEqual(soloInicial.saldo, 500_000);
assert.strictEqual(soloInicial.movimientos.length, 1);

// --- Un pago no puede volverse deuda por error de signo ---

for (const m of r.movimientos.filter((m) => m.tipo === "PAGO")) {
  assert.strictEqual(m.debe, 0);
  assert.ok(m.haber > 0);
}

console.log("lib/compras/cuentaCorriente.test.ts: todos los checks pasaron");
