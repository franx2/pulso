import assert from "node:assert";
import { costear, costoDeReventa, INSUMOS, preciosDeInsumos, RECETAS, ultimosPrecios, type LineaCompra } from "./recetas";

// Precios de ejemplo, con la forma de las facturas y los remitos del proveedor.
const compras: LineaCompra[] = [
  // El remito trae la lista; la factura, el neto (lista −5%).
  { detalle: "CAFE PRESTIGE NEGRO CABRALES X KG", precioUnitario: 40000, fecha: "2026-09-01", esFactura: false },
  { detalle: "CAFE PRESTIGE NEGRO CABRALES x kg", precioUnitario: 41800, fecha: "2026-10-01", esFactura: true },
  { detalle: "PACK LECHE ENTERA X 12LTS", precioUnitario: 12000, fecha: "2026-10-01", esFactura: true },
  { detalle: "AZUCAR EN SOBRES CABRALES CAJA X 800 UND", precioUnitario: 8000, fecha: "2026-10-01", esFactura: true },
  // Dos medialunas distintas el mismo día: no es una suba, son dos productos.
  { detalle: "MEDIALUNA ByN MANTECA PRELEUDADA x 100 u", precioUnitario: 50000, fecha: "2026-10-01", esFactura: true },
  { detalle: "MEDIALUNA ByN MANTECA x 100 u", precioUnitario: 40000, fecha: "2026-10-01", esFactura: true },
  // Helado: una sola lista. El pistacho ya vino con la suba; la menta, todavía no.
  { detalle: "HELADO DE MENTA GRANIZADA", precioUnitario: 8000, fecha: "2026-10-01", esFactura: true },
  { detalle: "HELADO DE PISTACHO", precioUnitario: 8000, fecha: "2026-10-01", esFactura: true },
  { detalle: "HELADO DE PISTACHO", precioUnitario: 9000, fecha: "2026-11-01", esFactura: true },
  { detalle: "POTE DE HELADO 1 KG 25UN", precioUnitario: 25000, fecha: "2026-10-01", esFactura: true },
  { detalle: "MINI CUCURUCHON DULCE X240", precioUnitario: 24000, fecha: "2026-10-01", esFactura: true },
  { detalle: "PRESENTACION ALARGADA 13 BOMBONES", precioUnitario: 10000, fecha: "2026-10-01", esFactura: true },
];

const ultimos = ultimosPrecios(compras);
const precios = preciosDeInsumos(ultimos);
const cerca = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? ""} dio ${a}, esperaba ${b}`);

// El remito se lleva a neto con el mismo 5% de la factura, y gana la compra
// más reciente: lo que importa para el margen es lo que cuesta hoy.
const cafe = ultimos.get("CAFE PRESTIGE NEGRO CABRALES X KG")!;
cerca(cafe.precio, 41800);
cerca(cafe.anterior!, 40000 * 0.95);
assert.strictEqual(cafe.vigenteDesde, "2026-10-01");

// LA CONVERSIÓN ES EL PUNTO: un pack de 12 litros no cuesta lo mismo que un ml.
cerca(precios.get("leche")!.porUnidad, 1);
cerca(precios.get("cafe")!.porUnidad, 41.8);

// Dos productos de un mismo insumo se promedian y no parecen una suba.
cerca(precios.get("medialuna")!.porUnidad, 450);
assert.strictEqual(ultimos.get("MEDIALUNA BYN MANTECA X 100 U")!.anterior, null);

// El helado es una lista: la suba del pistacho rige para todos los sabores.
cerca(precios.get("helado")!.porUnidad, 9);

// Cortado suelto: 14 g + 40 ml + un sobre de azúcar.
cerca(costear("CORTADO", precios)!.costo, 14 * 41.8 + 40 + 10);

// La promo usa la infusión que fijó el dueño (14 g y 150 ml), no un cortado.
const clasica = costear("PROMO CLÁSICA", precios)!;
cerca(clasica.costo, 14 * 41.8 + 150 + 10 + 2 * 450);
assert.ok(clasica.supuesto, "la elección de 2 medialunas se muestra como supuesto");

// Helado por formato: los gramos de la equivalencia (editable) + el envase.
cerca(costear("HELADO 1KG", precios)!.costo, 1070 * 9 + 1000);
cerca(costear("HELADO 1KG", precios, { kilo: 1000 })!.costo, 1000 * 9 + 1000, "con la equivalencia editada");
cerca(costear("CUCURUCHO 2 SABORES", precios)!.costo, 180 * 9 + 100);

// EL ORDEN IMPORTA: "ESPRESSO DOBLE" no puede caer en "ESPRESSO", ni "PROMO
// TOSTÓN" en el tostón suelto.
assert.strictEqual(costear("ESPRESSO DOBLE", precios)!.receta, "Espresso doble");
assert.strictEqual(costear("PROMO TOSTÓN", precios)!.receta, "Promo tostón");
assert.strictEqual(costear("LICUADO DE HELADO Y LECHE", precios)!.receta, "Licuado de helado y leche");

// Un insumo sin compras se reporta, no se cuenta como cero.
const tostado = costear("TOSTADO DE JYQ (ENTERO)", precios)!;
assert.ok(tostado.faltan.includes("Jamón cocido"));
assert.strictEqual(tostado.costo, 0);

// Sin receta no se inventa un costo; lo que se revende con el mismo nombre
// cuesta lo que se pagó.
assert.strictEqual(costear("TABLETA 70%", precios), null);
cerca(costoDeReventa("PRESENTACIÓN ALARGADA 13 BOMBONES.", ultimos)!.costo, 10000);

// Toda receta se refiere a insumos y recetas que existen.
const ids = new Set(RECETAS.map((r) => r.id));
for (const receta of RECETAS) {
  for (const c of receta.componentes) {
    if ("insumo" in c) assert.ok(INSUMOS.some((x) => x.id === c.insumo), `"${receta.nombre}" usa un insumo inexistente: ${c.insumo}`);
    if ("receta" in c) assert.ok(ids.has(c.receta), `"${receta.nombre}" usa una receta inexistente: ${c.receta}`);
    if ("cantidad" in c) assert.ok(c.cantidad > 0, `"${receta.nombre}" tiene una cantidad no positiva`);
  }
}

console.log("lib/compras/recetas.test.ts: todos los checks pasaron");
