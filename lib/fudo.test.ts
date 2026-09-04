import assert from "node:assert";
import { sumarPagosEnEfectivo } from "./fudo";

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

console.log("fudo.test.ts OK");
