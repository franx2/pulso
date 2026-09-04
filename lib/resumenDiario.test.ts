import assert from "node:assert";
import { agregarPorDia, claveDiaAR } from "./resumenDiario";

// Una venta de las 23:30 en Argentina llega como 02:30Z del día siguiente:
// tiene que contar en el día que se trabajó.
assert.strictEqual(claveDiaAR("2026-09-04T02:30:00Z"), "2026-09-03", "23:30 AR cae en el día anterior UTC");
assert.strictEqual(claveDiaAR("2026-09-03T21:42:31Z"), "2026-09-03", "18:42 AR es el mismo día");
assert.strictEqual(claveDiaAR("2026-09-04T03:00:00Z"), "2026-09-04", "medianoche AR abre el día nuevo");

const categorias = [
  { id: "22", attributes: { name: "CAFETERIA" } },
  { id: "24", attributes: { name: "BEBIDAS Y JUGOS" } },
];
const productos = [
  { id: "p1", attributes: { name: "CAFÉ", cost: 100 }, relationships: { productCategory: { data: { id: "22" } } } },
  // Sin costo cargado: tiene que marcar costoIncompleto.
  { id: "p2", attributes: { name: "JUGO", cost: null }, relationships: { productCategory: { data: { id: "24" } } } },
];
// `price` es el total de la línea (2 cafés a 500 = 1000), no el unitario.
const items = [
  { id: "i1", attributes: { price: 1000, quantity: 2, canceled: null }, relationships: { product: { data: { id: "p1" } } } },
  { id: "i2", attributes: { price: 500, quantity: 1, canceled: null }, relationships: { product: { data: { id: "p2" } } } },
  // Anulado: no suma ni facturación ni costo.
  { id: "i3", attributes: { price: 9999, quantity: 1, canceled: true }, relationships: { product: { data: { id: "p1" } } } },
];
const mediosPago = [{ id: "1", attributes: { name: "Efectivo" } }];
const pagos = [
  { id: "pg1", attributes: { amount: 2500, canceled: null }, relationships: { paymentMethod: { data: { id: "1" } } } },
  { id: "pg2", attributes: { amount: 111, canceled: true }, relationships: { paymentMethod: { data: { id: "1" } } } },
];
const descuentos = [
  { id: "d1", attributes: { amount: 300, canceled: null } },
  { id: "d2", attributes: { amount: 900, canceled: true } },
];
const ventas = [
  {
    id: "v1",
    attributes: { createdAt: "2026-09-03T21:42:31Z", total: 2500, people: 2, saleType: "EAT-IN" },
    relationships: {
      items: { data: [{ id: "i1" }, { id: "i2" }, { id: "i3" }] },
      payments: { data: [{ id: "pg1" }, { id: "pg2" }] },
      discounts: { data: [{ id: "d1" }, { id: "d2" }] },
    },
  },
  {
    id: "v2",
    attributes: { createdAt: "2026-09-04T12:00:00Z", total: 800, people: null, saleType: "TAKEAWAY" },
    relationships: {},
  },
];

const filas = agregarPorDia({ ventas, items, productos, categorias, pagos, mediosPago, descuentos });

assert.strictEqual(filas.length, 2, "dos días distintos");
const [d3, d4] = filas;

assert.strictEqual(d3.fecha, "2026-09-03");
assert.strictEqual(d3.ventas, 2500);
assert.strictEqual(d3.tickets, 1);
assert.strictEqual(d3.personas, 2);
assert.strictEqual(d3.descuentos, 300, "el descuento anulado no cuenta");
assert.strictEqual(d3.costo, 200, "2 cafés x 100 de costo; el item anulado no suma");
assert.strictEqual(d3.costoIncompleto, true, "el jugo no tiene costo cargado");
assert.deepStrictEqual(d3.porCanal, { "EAT-IN": 2500 });
assert.deepStrictEqual(d3.porMedioPago, { Efectivo: 2500 }, "el pago anulado no cuenta");
assert.deepStrictEqual(
  d3.porCategoria,
  { CAFETERIA: 1000, "BEBIDAS Y JUGOS": 500 },
  "factura el total de la línea, no price x cantidad"
);
assert.deepStrictEqual(d3.topProductos, [
  { nombre: "CAFÉ", cantidad: 2, facturacion: 1000 },
  { nombre: "JUGO", cantidad: 1, facturacion: 500 },
]);

assert.strictEqual(d4.fecha, "2026-09-04");
assert.strictEqual(d4.ventas, 800);
assert.strictEqual(d4.personas, 0, "sin people (takeaway) suma cero, no rompe");
assert.strictEqual(d4.costoIncompleto, false, "sin items no hay costo faltante que marcar");

console.log("resumenDiario.test.ts: todos los checks pasaron");
