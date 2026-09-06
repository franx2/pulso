import assert from "node:assert";
import { costoDe, INSUMOS, preciosDeInsumos, RECETAS, type LineaCompra } from "./recetas";

// Precios reales de los remitos de agosto de 2026.
const compras: LineaCompra[] = [
  { detalle: "CAFE PRESTIGE NEGRO CABRALES x kg", precioUnitario: 51837.67, fecha: "2026-08-29" },
  { detalle: "CAFE PRESTIGE NEGRO CABRALES X KG", precioUnitario: 47997.85, fecha: "2026-08-25" },
  { detalle: "PACK LECHE ENTERA X 12LTS", precioUnitario: 24204.67, fecha: "2026-08-29" },
  { detalle: "HELADO DE PISTACHO", precioUnitario: 9100, fecha: "2026-08-25" },
  { detalle: "POTE DE HELADO 1 KG 25UN", precioUnitario: 18621.9, fecha: "2026-08-25" },
  { detalle: "POTE DE HELADO 1/4 KG 25UN", precioUnitario: 7110.18, fecha: "2026-08-25" },
  { detalle: "CUCURUCHON DULCE X160", precioUnitario: 29743.75, fecha: "2026-08-25" },
  { detalle: "MEDIALUNA ByN MANTECA x 100 u", precioUnitario: 43702.92, fecha: "2026-08-29" },
];

const precios = preciosDeInsumos(compras);

// LA CONVERSIÓN ES EL PUNTO: un pack de 12 litros no cuesta lo mismo que un
// litro, ni una caja de 25 potes lo mismo que un pote.
assert.ok(Math.abs(precios.get("leche")!.precio - 24204.67 / 12) < 0.01, "leche por litro");
assert.ok(Math.abs(precios.get("pote1")!.precio - 18621.9 / 25) < 0.01, "pote por unidad");
assert.ok(Math.abs(precios.get("cucurucho")!.precio - 29743.75 / 160) < 0.01);
assert.ok(Math.abs(precios.get("medialuna")!.precio - 43702.92 / 100) < 0.01);
// El café se compra y se usa por kilo: no se divide.
assert.strictEqual(precios.get("cafe")!.precio, 51837.67);

// Se toma la compra MÁS RECIENTE, no un promedio: el café subió 8% en cuatro
// días y para saber si algo todavía deja margen importa lo que cuesta hoy.
assert.strictEqual(precios.get("cafe")!.fecha, "2026-08-29");

// --- Costo de la infusión que llevan todas las promos ---

const clasica = costoDe("PROMO CLÁSICA", precios)!;
assert.ok(clasica);
// 14 g de café + 150 ml de leche + 2 medialunas.
const esperado = 0.014 * 51837.67 + 0.15 * (24204.67 / 12) + 2 * (43702.92 / 100);
assert.ok(Math.abs(clasica.costo - esperado) < 0.01, `dio ${clasica.costo}, esperaba ${esperado}`);
assert.strictEqual(clasica.detalle.length, 3);
assert.ok(clasica.completo);

// --- Helados: el envase cuenta ---

const pote1 = costoDe("HELADO 1KG", precios)!;
assert.ok(Math.abs(pote1.costo - (9100 + 18621.9 / 25)) < 0.01);
const cucurucho = costoDe("CUCURUCHO 2 SABORES", precios)!;
assert.ok(Math.abs(cucurucho.costo - (0.12 * 9100 + 29743.75 / 160)) < 0.01);

// EL ORDEN IMPORTA: "CUCURUCHON 3 SABORES" lleva más helado que un cucurucho
// común, y su regla va antes. Si ganara la otra, se subestimaría el costo.
const cucuruchon = costoDe("CUCURUCHON 3 SABORES", precios)!;
assert.strictEqual(cucuruchon.nombre, "Cucuruchón");
assert.ok(cucuruchon.costo > cucurucho.costo);

// Y una promo genérica cae en la receta general, que sólo cubre la infusión y
// lo dice: dar por completo un costo que no lo está sería peor que no tenerlo.
const generica = costoDe("PROMO TOSTÓN", precios)!;
assert.strictEqual(generica.nombre, "Promo (sólo infusión)");
assert.ok(!generica.completo);
assert.match(generica.faltante!, /acompañamiento/);

// El pote de 1/2 kg no existe en los remitos: se usa el de 1/4 y queda dicho.
const medio = costoDe("HELADO 1/2KG", precios)!;
assert.ok(!medio.completo);
assert.match(medio.faltante!, /1\/2 kg no está/);

// Sin receta no se inventa un costo.
assert.strictEqual(costoDe("TABLETA 70%", precios), null);

// Un insumo sin compras se reporta, no se cuenta como cero.
const sinCafe = costoDe("PROMO CLÁSICA", preciosDeInsumos(compras.filter((c) => !/CAFE/i.test(c.detalle))))!;
assert.deepStrictEqual(sinCafe.sinPrecio, ["Café en grano"]);
assert.ok(!sinCafe.completo);
assert.ok(sinCafe.costo < clasica.costo);

// Toda receta tiene que referirse a insumos que existen.
for (const receta of RECETAS) {
  for (const c of receta.componentes) {
    assert.ok(INSUMOS.some((i) => i.id === c.insumo), `"${receta.nombre}" usa un insumo inexistente: ${c.insumo}`);
    assert.ok(c.cantidad > 0, `"${receta.nombre}" tiene una cantidad no positiva`);
  }
}

console.log("lib/compras/recetas.test.ts: todos los checks pasaron");
