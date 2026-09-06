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
assert.strictEqual(costo.comisiones, 120 + 810);
// Efectivo y transferencia no pagan comisión.
assert.strictEqual(costo.ventaSinComision, 1500);
// LAS APPS SON LA COMISIÓN MÁS CARA: 27% contra 2-4% del resto. Y el orden
// de las reglas importa — "Pedidos ya efectivo" contiene "efectivo": si
// ganara esa regla, la venta más cara de cobrar contaría como la más barata.
assert.strictEqual(costo.ventaDelivery, 3000);
assert.strictEqual(costo.comisionDelivery, 810);
const uber = costo.porMedio.find((m) => m.medio === "Online Uber Eats")!;
assert.strictEqual(uber.tasa, 0.27);
assert.strictEqual(uber.etiqueta, "Delivery");
const pyEfectivo = costoDeVenta({ "Pedidos ya efectivo": 1000 });
assert.strictEqual(pyEfectivo.porMedio[0].etiqueta, "Delivery", "la app gana sobre 'efectivo'");
assert.strictEqual(pyEfectivo.comisiones, 270);

// Las tasas son por local: cada sucursal negocia su propio contrato.
const propias = costoDeVenta(
  { "Tarj. Crédito": 1000, "Online Uber Eats": 1000 },
  { credito: 0.06, debito: 0.03, billetera: 0.03, delivery: 0.3 }
);
assert.strictEqual(propias.comisiones, 60 + 300);

// Un medio que ninguna regla reconoce se informa, no se estima en cero.
const raro = costoDeVenta({ "Vale de canje": 500 });
assert.strictEqual(raro.porMedio[0].tasa, null);
assert.strictEqual(raro.ventaSinTasa, 500);

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
