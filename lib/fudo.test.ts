import assert from "node:assert";
import { sumarPagosEnEfectivo, resumirVentas, sumarEfectivoDeCaja, sumarGastosEnEfectivo } from "./fudo";

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

// sumarEfectivoDeCaja: la caja vive en la venta, no en el pago — payments
// no expone su origen, hay que ir vía sales.payments.
const ventasConCaja = [
  {
    relationships: {
      cashRegister: { data: { id: "12" } }, // Antonella
      payments: { data: [{ id: "p1" }, { id: "p2" }] },
    },
  },
  {
    relationships: {
      cashRegister: { data: { id: "9" } }, // Maria: no debe sumar
      payments: { data: [{ id: "p3" }] },
    },
  },
  { relationships: { payments: { data: [{ id: "p4" }] } } }, // sin caja
];
const pagosConId = [
  { id: "p1", attributes: { amount: 5000, canceled: null }, relationships: { paymentMethod: { data: { id: "1" } } } },
  { id: "p2", attributes: { amount: 2000, canceled: null }, relationships: { paymentMethod: { data: { id: "3" } } } }, // tarjeta
  { id: "p3", attributes: { amount: 9999, canceled: null }, relationships: { paymentMethod: { data: { id: "1" } } } }, // otra caja
  { id: "p4", attributes: { amount: 100, canceled: null }, relationships: { paymentMethod: { data: { id: "1" } } } },
];
assert.strictEqual(
  sumarEfectivoDeCaja(ventasConCaja, pagosConId, metodos, "12"),
  5000,
  "sólo efectivo de ventas de ESA caja, ignora otra caja/tarjeta/sin caja"
);
assert.strictEqual(sumarEfectivoDeCaja(ventasConCaja, pagosConId, metodos, "999"), 0, "caja sin ventas, total 0");

// Gastos pagados desde la caja: salen del cajón, no tienen que estar al cerrar.
const metodosConCodigo = [
  { id: "1", attributes: { name: "Efectivo", code: "cash" } },
  { id: "3", attributes: { name: "Tarj. Crédito", code: "credit-card" } },
  { id: "8", attributes: { name: "Transferencia", code: "transferencia" } },
];
const gastos = [
  { attributes: { amount: 3000, canceled: null, useInCashCount: true }, relationships: { paymentMethod: { data: { id: "1" } } } },
  // Efectivo sin la marca: sale del cajón igual, se descuenta.
  { attributes: { amount: 500, canceled: null }, relationships: { paymentMethod: { data: { id: "1" } } } },
  // Marcado explícitamente fuera del arqueo: se respeta.
  { attributes: { amount: 9999, canceled: null, useInCashCount: false }, relationships: { paymentMethod: { data: { id: "1" } } } },
  // Pagado por transferencia: no tocó la caja.
  { attributes: { amount: 7000, canceled: null, useInCashCount: true }, relationships: { paymentMethod: { data: { id: "8" } } } },
  // Anulado.
  { attributes: { amount: 100, canceled: true, useInCashCount: true }, relationships: { paymentMethod: { data: { id: "1" } } } },
];
assert.strictEqual(
  sumarGastosEnEfectivo(gastos, metodosConCodigo),
  3500,
  "sólo gastos en efectivo no anulados y no excluidos del arqueo"
);
assert.strictEqual(sumarGastosEnEfectivo([], metodosConCodigo), 0, "sin gastos, total 0");

console.log("fudo.test.ts OK");
