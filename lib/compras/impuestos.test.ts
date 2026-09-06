import assert from "node:assert";
import { costoDeVenta, IIBB, ingresosBrutos, IVA, posicionIVA } from "./impuestos";

// --- Comisiones por medio de pago ---

// Los nombres son los reales de Fudo, con sus variantes entre sucursales.
const costo = costoDeVenta({
  Efectivo: 1000,
  "Tarj. Crédito": 1000,
  "Tarj. Débito": 1000,
  "Mercado pago": 1000,
  "Pagos qr": 1000,
  "Nave posnet qr": 1000,
  Transferencia: 500,
  "Online Uber Eats": 2000,
  "Pedidos ya online": 1000,
});

assert.strictEqual(costo.total, 9500);
// 4% de crédito + 2% de (débito + MP + 2 QR) = 40 + 80 = 120.
assert.strictEqual(costo.comisiones, 120);
// Efectivo y transferencia no pagan comisión.
assert.strictEqual(costo.ventaSinComision, 1500);
// LAS APPS NO SE ESTIMAN: cobran 20-30%, no 2-4%. Ponerles una tasa
// inventada haría parecer sano un margen de delivery que puede no serlo.
assert.strictEqual(costo.ventaSinTasa, 3000);
const uber = costo.porMedio.find((m) => m.medio === "Online Uber Eats")!;
assert.strictEqual(uber.tasa, null);
assert.strictEqual(uber.comision, 0);
assert.strictEqual(uber.etiqueta, "Falta la comisión");

// Prepaga va como débito; "Cta. Cte." no tiene comisión.
assert.strictEqual(costoDeVenta({ "Tarj. prepaga": 100 }).comisiones, 2);
assert.strictEqual(costoDeVenta({ "Cta. Cte.": 100 }).comisiones, 0);

// Un medio en cero no ensucia la lista.
assert.strictEqual(costoDeVenta({ Efectivo: 0 }).porMedio.length, 0);

// --- Ingresos Brutos ---

assert.strictEqual(IIBB, 0.05);
assert.strictEqual(IVA, 0.21);

// LA BASE NO LLEVA IVA: sobre $121 finales, la base son $100.
const iibb = ingresosBrutos(121, 121);
assert.ok(Math.abs(iibb.baseNeta - 100) < 1e-9, `base dio ${iibb.baseNeta}`);
assert.ok(Math.abs(iibb.sobreVentaTotal - 5) < 1e-9);

// Y EL EFECTIVO TRIBUTA IGUAL. Lo que depende del medio de pago es la
// retención, no el impuesto: si sólo se mira lo retenido, falta la parte del
// efectivo. Con 25% de la venta en efectivo, falta un cuarto del impuesto.
const conEfectivo = ingresosBrutos(1000, 750);
assert.ok(Math.abs(conEfectivo.sobreVentaTotal - (1000 / 1.21) * 0.05) < 1e-9);
assert.ok(Math.abs(conEfectivo.retenidoAproximado - (750 / 1.21) * 0.05) < 1e-9);
assert.ok(Math.abs(conEfectivo.diferencia - (250 / 1.21) * 0.05) < 1e-9);
assert.ok(conEfectivo.diferencia > 0, "el efectivo no retenido es plata que igual se debe");

// --- IVA ---

// NO es ventas menos compras: es el IVA contenido en cada una. Sobre una
// venta final de $121 el débito es $21, no $121.
const iva = posicionIVA(121, 0);
assert.ok(Math.abs(iva.debitoFiscal - 21) < 1e-9);
assert.strictEqual(iva.creditoFiscal, 0);
assert.ok(Math.abs(iva.aPagar - 21) < 1e-9);

// Con compras respaldadas por Factura A el crédito baja lo que hay que pagar.
const conCredito = posicionIVA(121, 60.5);
assert.ok(Math.abs(conCredito.creditoFiscal - 10.5) < 1e-9);
assert.ok(Math.abs(conCredito.aPagar - 10.5) < 1e-9);

// Comprar más que vender da posición a favor, no un pago negativo raro.
assert.ok(posicionIVA(121, 242).aPagar < 0);

console.log("lib/compras/impuestos.test.ts: todos los checks pasaron");
