import assert from "node:assert";
import { convalidarPagos } from "./convalidacionPagos";

/**
 * Lo que más importa acá es que dos pagos del mismo monto no se peguen los
 * dos a la misma transferencia, que un monto tipeado con un pequeño desvío
 * siga emparejando, y que un pago en efectivo (sin nada que lo respalde en
 * el banco) se informe como tal y no como un error.
 */

const mov = (id: string, fecha: string, debito: number, descripcion = "TRF INMED PROVEED") => ({
  id,
  fecha,
  descripcion,
  referencia: "BIANCO Y NERO SRL",
  debito,
});

// --- Match exacto ---

const r1 = convalidarPagos(
  [{ id: "p1", fecha: "2026-08-10", monto: 500_000, medio: "Transferencia" }],
  [mov("m1", "2026-08-10", 500_000)]
);
assert.strictEqual(r1.pagos[0].movimiento?.id, "m1");
assert.strictEqual(r1.pagos[0].diferenciaDias, 0);

// --- Tolerancia: $150.000 tipeado contra $149.980 real ---

const r2 = convalidarPagos(
  [{ id: "p1", fecha: "2026-08-10", monto: 150_000, medio: "Transferencia" }],
  [mov("m1", "2026-08-10", 149_980)]
);
assert.strictEqual(r2.pagos[0].movimiento?.id, "m1", "dentro de tolerancia");

// Pero $150.000 contra $145.000 (fuera de tolerancia) no empareja.
const r3 = convalidarPagos(
  [{ id: "p1", fecha: "2026-08-10", monto: 150_000, medio: "Transferencia" }],
  [mov("m1", "2026-08-10", 145_000)]
);
assert.strictEqual(r3.pagos[0].movimiento, null);

// --- Ventana de fecha: el banco acredita unos días después ---

const r4 = convalidarPagos(
  [{ id: "p1", fecha: "2026-08-10", monto: 200_000, medio: "Transferencia" }],
  [mov("m1", "2026-08-12", 200_000)]
);
assert.strictEqual(r4.pagos[0].movimiento?.id, "m1");
assert.strictEqual(r4.pagos[0].diferenciaDias, 2);

// Fuera de la ventana (7 días) no empareja, aunque el monto sea exacto.
const r5 = convalidarPagos(
  [{ id: "p1", fecha: "2026-08-10", monto: 200_000, medio: "Transferencia" }],
  [mov("m1", "2026-08-17", 200_000)]
);
assert.strictEqual(r5.pagos[0].movimiento, null);

// --- Dos pagos del mismo monto no pueden señalar la misma transferencia ---

const r6 = convalidarPagos(
  [
    { id: "p1", fecha: "2026-08-10", monto: 300_000, medio: "Transferencia" },
    { id: "p2", fecha: "2026-08-11", monto: 300_000, medio: "Transferencia" },
  ],
  [mov("m1", "2026-08-10", 300_000), mov("m2", "2026-08-11", 300_000)]
);
const asignados = r6.pagos.map((p) => p.movimiento?.id).sort();
assert.deepStrictEqual(asignados, ["m1", "m2"], "cada pago se lleva una transferencia distinta");

// Y si sólo hay UNA transferencia para dos pagos iguales, sólo uno empareja.
const r7 = convalidarPagos(
  [
    { id: "p1", fecha: "2026-08-10", monto: 300_000, medio: "Transferencia" },
    { id: "p2", fecha: "2026-08-10", monto: 300_000, medio: "Transferencia" },
  ],
  [mov("m1", "2026-08-10", 300_000)]
);
const conMatch = r7.pagos.filter((p) => p.movimiento != null);
assert.strictEqual(conMatch.length, 1, "sólo un pago se lleva la única transferencia real");

// --- Efectivo: sin banco detrás, y no es un error ---

const r8 = convalidarPagos(
  [{ id: "p1", fecha: "2026-08-10", monto: 50_000, medio: "Efectivo" }],
  [mov("m1", "2026-08-10", 200_000)] // ninguna transferencia coincide en monto
);
assert.strictEqual(r8.pagos[0].movimiento, null);
assert.strictEqual(r8.pagos[0].pago.medio, "Efectivo");

// --- Transferencias a proveedor sin ningún pago que las reclame ---

const r9 = convalidarPagos(
  [],
  [mov("m1", "2026-08-05", 400_000, "TRF INMED PROVEED"), mov("m2", "2026-08-06", 20_000, "PAGO DE SERVICIOS")]
);
assert.strictEqual(r9.sinRegistrar.length, 1, "sólo la que dice PROVEED");
assert.strictEqual(r9.sinRegistrar[0].id, "m1");

console.log("lib/compras/convalidacionPagos.test.ts: todos los checks pasaron");
