import assert from "node:assert";
import { calcularResultado, neto } from "./resultado";
import { costoDeVenta, IIBB, IVA } from "./impuestos";

/**
 * El resultado operativo es la cifra sobre la que se decide si el negocio
 * cierra. Los dos errores que la arruinan son mezclar netos con finales
 * —que cuenta el IVA dos veces— y tomar un cero por un dato.
 */

const medios = {
  Efectivo: 400_000,
  "Tarjeta de credito": 300_000,
  "Mercado pago": 300_000,
};
const cdv = costoDeVenta(medios);

const base = {
  ventaBruta: 1_000_000,
  costoDeVenta: cdv,
  mercaderiaBruta: 363_000,
  royaltyBruto: 60_500,
  comprasConFactura: 0,
  costoLaboral: 150_000,
  costosFijos: 100_000,
  hayRemitos: true,
  empleadosSinPrecio: 0,
  conceptosFijosSinCargar: 0,
};

const r = calcularResultado(base);

// --- Todo en netos, una sola vez ---

// $1.000.000 finales son $826.446 netos.
assert.ok(Math.abs(r.ventaNeta - 1_000_000 / 1.21) < 0.01, `venta neta ${r.ventaNeta}`);
assert.ok(Math.abs(neto(121) - 100) < 1e-9);

const linea = (id: string) => r.lineas.find((l) => l.id === id)!;

// La mercadería entra neta: $363.000 con IVA son $300.000.
assert.ok(Math.abs(linea("mercaderia").monto + 300_000) < 0.01, `mercadería ${linea("mercaderia").monto}`);
assert.ok(Math.abs(linea("royalty").monto + 50_000) < 0.01);

// IIBB sobre TODA la venta neta, efectivo incluido. Es el punto que más se
// confunde: la retención no es la base del impuesto.
assert.ok(Math.abs(linea("iibb").monto + r.ventaNeta * IIBB) < 0.01);
assert.ok(
  Math.abs(linea("iibb").monto) > Math.abs(r.ventaNeta * IIBB * 0.6),
  "no se calcula sólo sobre lo no efectivo"
);

// Comisiones: 4% del crédito + 2% de Mercado Pago, y va neta de IVA.
const comisionBruta = 300_000 * 0.04 + 300_000 * 0.02;
assert.ok(Math.abs(linea("comisiones").monto + comisionBruta / (1 + IVA)) < 0.01);

// El efectivo no paga comisión.
assert.strictEqual(cdv.ventaSinComision, 400_000);

// --- El resultado cierra ---

const suma = r.ventaNeta + r.lineas.reduce((s, l) => s + l.monto, 0);
assert.ok(Math.abs(r.resultado - suma) < 1e-6, "el total es la suma de las líneas");
assert.ok(Math.abs(r.resultadoPct - (r.resultado / r.ventaNeta) * 100) < 1e-9);

// Todas las líneas restan: ninguna suma por error de signo.
for (const l of r.lineas) assert.ok(l.monto <= 0, `${l.id} tendría que restar`);

// --- El IVA se informa aparte, no se resta ---

assert.ok(Math.abs(r.iva.debito - r.ventaNeta * IVA) < 0.01);
assert.strictEqual(r.iva.credito, 0, "sin Factura A no hay crédito fiscal");
assert.ok(
  !r.lineas.some((l) => l.id === "iva"),
  "el IVA no es un gasto del período: es una deuda a depositar"
);

// Con Factura A sí hay crédito, y baja lo que se deposita.
const conFactura = calcularResultado({ ...base, comprasConFactura: 363_000 });
assert.ok(conFactura.iva.credito > 0);
assert.ok(conFactura.iva.aPagar < r.iva.aPagar);
// Pero el resultado operativo no cambia: el IVA nunca fue parte de él.
assert.ok(Math.abs(conFactura.resultado - r.resultado) < 1e-9);

// --- Lo que falta se dice, no se pone en cero ---

const incompleto = calcularResultado({
  ...base,
  hayRemitos: false,
  mercaderiaBruta: 0,
  empleadosSinPrecio: 3,
  conceptosFijosSinCargar: 2,
});
assert.strictEqual(incompleto.incompletas, 3);
assert.strictEqual(incompleto.lineas.find((l) => l.id === "mercaderia")!.completa, false);
assert.match(incompleto.lineas.find((l) => l.id === "laboral")!.falta!, /3 empleados/);
assert.match(incompleto.lineas.find((l) => l.id === "fijos")!.falta!, /2 conceptos/);
// Y sin mercadería el resultado da MEJOR, que es exactamente por qué hay que
// marcarlo: un resultado sin costos es el más lindo y el más falso.
assert.ok(incompleto.resultado > r.resultado);

// Un medio de pago que ninguna regla reconoce deja la línea de comisiones
// incompleta: se cobró por ahí y no se le aplicó costo.
const raro = calcularResultado({
  ...base,
  costoDeVenta: costoDeVenta({ ...medios, "Cripto USDT": 100_000 }),
});
assert.strictEqual(raro.lineas.find((l) => l.id === "comisiones")!.completa, false);

// --- Venta en cero no rompe nada ---

const vacio = calcularResultado({ ...base, ventaBruta: 0 });
assert.strictEqual(vacio.resultadoPct, 0);
assert.ok(Number.isFinite(vacio.resultado));

console.log("lib/compras/resultado.test.ts: todos los checks pasaron");
