import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { costoPorLinea, parsearRemito, RemitoIlegible, verificarRemito } from "./remito";

/**
 * Los fixtures son el texto real de cuatro remitos del proveedor (agosto de
 * 2026). No son inventados a propósito: el valor del parser está en que
 * aguante lo que el proveedor manda de verdad — nombres con "&", con
 * paréntesis, cantidades decimales, un remito de una sola línea que no es
 * mercadería.
 */
const fixture = (nombre: string) => readFileSync(join(import.meta.dirname, "fixtures", `${nombre}.txt`), "utf8");

// --- Encabezado ---

const r5004 = parsearRemito(fixture("remito-5004"));
assert.strictEqual(r5004.numero, "16-5004");
assert.strictEqual(r5004.puntoVenta, 16);
assert.strictEqual(r5004.numeroComprobante, 5004);
assert.strictEqual(r5004.fecha, "2026-08-25", "la fecha va en ISO, no en dd/mm/aaaa");
assert.strictEqual(r5004.cliente, "CUMBRES Y PLACERES SAS (BIANCONERO GUAYMALLEN)");
assert.strictEqual(r5004.cuit, "30718808975");
assert.strictEqual(r5004.ajustePct, 10.5);

// --- Líneas ---

assert.strictEqual(r5004.lineas.length, 31, "el remito 5004 tiene 31 productos");

// El encabezado se repite en la página 2 y no puede colarse como producto.
assert.ok(!r5004.lineas.some((l) => /Detalle|Unitario/.test(l.detalle)), "no entra el encabezado");

const cafe = r5004.lineas.find((l) => l.codigo === "1099");
assert.ok(cafe);
assert.deepStrictEqual(
  { cantidad: cafe.cantidad, unidad: cafe.unidad, precioUnitario: cafe.precioUnitario, total: cafe.total },
  { cantidad: 2, unidad: "Kilogramos", precioUnitario: 47997.85, total: 95995.7 }
);

// Cantidades decimales: el helado se factura por kilo con dos decimales.
const helado = r5004.lineas.find((l) => l.detalle === "HELADO DE BANANA SPLIT");
assert.ok(helado);
assert.strictEqual(helado.cantidad, 8.28);
assert.strictEqual(helado.total, 75348);

// Nombres con paréntesis y con "&" no rompen el detalle.
const sesamo = r5004.lineas.find((l) => l.codigo === "776");
assert.ok(sesamo);
assert.strictEqual(sesamo.detalle, "SEMILLA DE SESAMO x kg (BLANCO O NEGRO)");
assert.strictEqual(sesamo.cantidad, 0.1, "cantidades menores a 1 se leen bien");
const individuales = r5004.lineas.find((l) => l.codigo === "1369");
assert.ok(individuales);
assert.strictEqual(individuales.detalle, "INDIVIDUALES PACK DE 100 UNIDADES B&N");

// El código viene con separador de miles y no es un decimal: "3.189" es 3189.
assert.ok(r5004.lineas.some((l) => l.codigo === "3189"));

// --- Totales y el ajuste del 10,5% ---

assert.strictEqual(Number(r5004.sumaLineas.toFixed(2)), 920297.74);
assert.strictEqual(r5004.subtotal, 1016928.98);
assert.strictEqual(r5004.total, 1016928.98);

const v5004 = verificarRemito(r5004);
assert.ok(v5004.ok, `el 5004 tiene que cerrar: ${v5004.problemas.join(" | ")}`);
// EL PUNTO: el campo dice "Desc. aplicado" pero el subtotal es la suma × 1,105.
// Si algún día el proveedor lo cambia a un descuento de verdad, este check cae.
assert.ok(
  Math.abs(v5004.factorObservado - 1.105) < 0.0001,
  `el ajuste suma, no resta: factor observado ${v5004.factorObservado}`
);

const conAjuste = costoPorLinea(r5004);
const cafeConAjuste = conAjuste.find((l) => l.codigo === "1099");
assert.ok(cafeConAjuste);
assert.strictEqual(Number(cafeConAjuste.costoLista.toFixed(2)), 95995.7);
assert.strictEqual(Number(cafeConAjuste.costoConAjuste.toFixed(2)), 106075.25);
// La suma de los costos con ajuste tiene que dar el subtotal declarado.
assert.ok(
  Math.abs(conAjuste.reduce((s, l) => s + l.costoConAjuste, 0) - r5004.subtotal) < 1,
  "prorratear el ajuste tiene que reconstruir el subtotal"
);

// --- Los otros tres ---

const r5005 = parsearRemito(fixture("remito-5005"));
assert.strictEqual(r5005.fecha, "2026-08-27");
assert.strictEqual(r5005.lineas.length, 8);
assert.strictEqual(r5005.subtotal, 184059.46);
assert.ok(verificarRemito(r5005).ok);
// Unidad en litros, que no es ni unidades ni kilos.
assert.strictEqual(r5005.lineas.find((l) => l.codigo === "501")?.unidad, "Litros");

const r5007 = parsearRemito(fixture("remito-5007"));
assert.strictEqual(r5007.fecha, "2026-08-29");
assert.strictEqual(r5007.lineas.length, 22);
assert.ok(verificarRemito(r5007).ok, verificarRemito(r5007).problemas.join(" | "));

// EL REDONDEO DEL PROVEEDOR: imprime la cantidad con dos decimales pero
// factura con tres. Este helado figura como 7,27 kg y cierra en 66.111,50 a
// 9.100 el kilo, o sea que pesaba 7,265. La verificación no puede marcarlo
// como error —es correcto— pero la cantidad exacta sí tiene que reflejarlo.
const chocolate = r5007.lineas.find((l) => l.detalle === "HELADO DE CHOCOLATE AMARGO");
assert.ok(chocolate);
assert.strictEqual(chocolate.cantidad, 7.27, "la impresa");
assert.strictEqual(Number(chocolate.cantidadExacta.toFixed(3)), 7.265, "la facturada");
assert.strictEqual(chocolate.total, 66111.5);

// Y una diferencia que NO se explica por el redondeo sí tiene que saltar.
const falseado = {
  ...r5007,
  lineas: r5007.lineas.map((l) =>
    l.detalle === "HELADO DE CHOCOLATE AMARGO" ? { ...l, total: l.total * 2 } : l
  ),
};
assert.ok(!verificarRemito(falseado).ok, "el doble de una línea no es redondeo");

// El mismo producto cambió de precio entre el 25 y el 29, y el nombre está
// escrito distinto. Por eso el código es la clave y no el detalle.
const cafe25 = r5004.lineas.find((l) => l.codigo === "1099");
const cafe29 = r5007.lineas.find((l) => l.codigo === "1099");
assert.ok(cafe25 && cafe29);
assert.notStrictEqual(cafe25.detalle, cafe29.detalle, "el nombre cambia de escritura");
assert.strictEqual(cafe25.precioUnitario, 47997.85);
assert.strictEqual(cafe29.precioUnitario, 51837.67);

// --- El remito que NO es mercadería ---

const r5006 = parsearRemito(fixture("remito-5006"));
assert.strictEqual(r5006.fecha, "2026-08-30");
assert.strictEqual(r5006.lineas.length, 1);
assert.strictEqual(r5006.lineas[0].detalle, "USO DE MARCA");
assert.strictEqual(r5006.observaciones, "USO DE MARCA AGOSTO");
assert.strictEqual(r5006.subtotal, 1124160.95);
assert.ok(verificarRemito(r5006).ok);

// --- El mismo remito, extraído por el otro camino ---

// `pdftotext -layout` deja dos espacios entre la unidad y el detalle; la
// reconstrucción desde las coordenadas del PDF (lib/compras/pdf.ts, que es la
// que corre en producción porque en Vercel no hay pdftotext) deja uno. El
// parser tiene que dar exactamente lo mismo con los dos, o los tests estarían
// validando un camino que nadie ejecuta.
const desdePdf = parsearRemito(fixture("remito-5004-desde-pdf"));
assert.strictEqual(desdePdf.numero, r5004.numero);
assert.strictEqual(desdePdf.fecha, r5004.fecha);
assert.strictEqual(desdePdf.cliente, r5004.cliente);
assert.strictEqual(desdePdf.cuit, r5004.cuit);
assert.strictEqual(desdePdf.ajustePct, r5004.ajustePct);
assert.strictEqual(desdePdf.subtotal, r5004.subtotal);
assert.strictEqual(desdePdf.lineas.length, r5004.lineas.length);
assert.ok(Math.abs(desdePdf.sumaLineas - r5004.sumaLineas) < 0.01);
assert.ok(verificarRemito(desdePdf).ok);
assert.deepStrictEqual(
  desdePdf.lineas.map((l) => [l.codigo, l.cantidad, l.precioUnitario, l.total]),
  r5004.lineas.map((l) => [l.codigo, l.cantidad, l.precioUnitario, l.total]),
  "los dos caminos tienen que leer las mismas líneas"
);

// --- Que falle ruidosamente ---

assert.throws(() => parsearRemito("cualquier cosa"), RemitoIlegible, "sin número tiene que tirar error");
assert.throws(() => parsearRemito("Nro: 16 - 5.004\nNombre: X"), RemitoIlegible, "sin fecha tampoco pasa");

// Si se pierde una línea, la verificación tiene que avisar: es la red que
// evita que un producto no leído baje el costo en silencio.
const mutilado = { ...r5004, lineas: r5004.lineas.slice(0, -1) };
mutilado.sumaLineas = mutilado.lineas.reduce((s, l) => s + l.total, 0);
const vMutilado = verificarRemito(mutilado);
assert.ok(!vMutilado.ok, "un remito al que le falta una línea no puede dar OK");
assert.match(vMutilado.problemas[0], /líneas sin leer/);

console.log("lib/compras/remito.test.ts: todos los checks pasaron");
