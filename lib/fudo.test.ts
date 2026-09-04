import assert from "node:assert";
import { sumarPagosEnEfectivo, resumirVentas } from "./fudo";

const metodos = [
  { id: "1", attributes: { name: "Efectivo" } },
  { id: "3", attributes: { name: "Tarj. Crédito" } },
  { id: "10", attributes: { name: "Efectivo Uber Eats" } },
];

const pagos = [
  { attributes: { amount: 1000, canceled: null }, relationships: { paymentMethod: { data: { id: "1" } } } },
  { attributes: { amount: 500, canceled: null }, relationships: { paymentMethod: { data: { id: "3" } } } },
  { attributes: { amount: 200, canceled: null }, relationships: { paymentMethod: { data: { id: "10" } } } },
  // Cancelado: no debe sumar aunque sea efectivo.
  { attributes: { amount: 300, canceled: true }, relationships: { paymentMethod: { data: { id: "1" } } } },
  // Sin método resuelto (no vino en `included`): se ignora, no se asume efectivo.
  { attributes: { amount: 999, canceled: null }, relationships: { paymentMethod: { data: { id: "77" } } } },
];

assert.strictEqual(sumarPagosEnEfectivo(pagos, metodos), 1200, "suma Efectivo + Efectivo Uber Eats, ignora tarjeta/cancelado/desconocido");
assert.strictEqual(sumarPagosEnEfectivo([], metodos), 0, "sin pagos, total 0");

const usuarios = [{ id: "25", attributes: { name: "Nicolas" } }];
const ventas = [
  { attributes: { people: 2, total: 25700 }, relationships: { waiter: { data: { id: "25" } } } },
  { attributes: { people: null, total: 40000 } }, // takeaway: sin personas, sin mozo
  { attributes: { people: 1, total: 6800 }, relationships: { waiter: { data: { id: "25" } } } },
  { attributes: { people: 1, total: 6800 } }, // eat-in sin mozo asignado en Fudo
];
const resumen = resumirVentas(ventas, usuarios);
assert.strictEqual(resumen.cantidadVentas, 4);
assert.strictEqual(resumen.totalVentas, 25700 + 40000 + 6800 + 6800);
assert.strictEqual(resumen.personasAtendidas, 4, "suma people, ignora null (takeaway)");
assert.strictEqual(resumen.porMozo.length, 1, "sólo mozos con dato en Fudo");
assert.strictEqual(resumen.porMozo[0].fudoUsuarioId, "25");
assert.strictEqual(resumen.porMozo[0].nombreFudo, "Nicolas");
assert.strictEqual(resumen.porMozo[0].cantidadVentas, 2);
assert.strictEqual(resumen.porMozo[0].totalVentas, 25700 + 6800);

console.log("fudo.test.ts OK");
