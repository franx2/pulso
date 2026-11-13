import assert from "node:assert";
import {
  GRAMOS_POR_INFUSION,
  esCafeComprado,
  gramosDeVenta,
  infusionesSupuestas,
  kilosDeCompra,
  promoLlevaInfusion,
  resumirCafe,
} from "./consumoCafe";

/**
 * El control de café compara kilos comprados contra kilos que la venta
 * explica. Los dos errores que lo arruinan son simétricos y caros:
 * contar café donde no lo hay (un té sumado como infusión inventa merma que
 * no existe) y no contarlo donde sí lo hay (una promo con infusión sin
 * declarar deja el consumo corto y hace parecer que se roba café).
 */

// --- Qué lleva café y qué no ---

assert.strictEqual(gramosDeVenta("CORTADO"), GRAMOS_POR_INFUSION);
assert.strictEqual(gramosDeVenta("Café con leche"), GRAMOS_POR_INFUSION);
assert.strictEqual(gramosDeVenta("LATTE"), GRAMOS_POR_INFUSION);
assert.strictEqual(gramosDeVenta("CAPUCCINO"), GRAMOS_POR_INFUSION);
assert.strictEqual(gramosDeVenta("LAGRIMA"), GRAMOS_POR_INFUSION);

// Una doble lleva dos dosis y el nombre lo dice.
assert.strictEqual(gramosDeVenta("ESPRESSO DOBLE"), GRAMOS_POR_INFUSION * 2);

// Se sirven en la misma barra y no llevan un gramo de café.
assert.strictEqual(gramosDeVenta("TE"), null);
assert.strictEqual(gramosDeVenta("TE DE JAZMIN"), null);
assert.strictEqual(gramosDeVenta("MATE COCIDO"), null);
assert.strictEqual(gramosDeVenta("SUBMARINO"), null, "es chocolate");
assert.strictEqual(gramosDeVenta("MEDIALUNA"), null);
assert.strictEqual(gramosDeVenta("LIMONADA"), null);

// "CAFÉ HELADO" sí lleva café, aunque el nombre diga helado.
assert.strictEqual(gramosDeVenta("CAFE HELADO"), GRAMOS_POR_INFUSION);

// --- El café del remito ---

assert.ok(esCafeComprado("CABRALES PRESTIGE GRANO 1KG"));
assert.ok(esCafeComprado("CAFE MOLIDO CABRALES 1KG"));
assert.ok(!esCafeComprado("HELADO DE DULCE DE LECHE"));
assert.ok(!esCafeComprado("PACK LECHE ENTERA"), "leche no es café");

// --- Promos ---

assert.ok(promoLlevaInfusion("Infusión + 2 tostadas con queso y dulce"));
assert.ok(promoLlevaInfusion("infusion + chipa"));
assert.ok(!promoLlevaInfusion("Cucurucho de 2 bochas"));

// --- El resumen ---

const CARTA: Record<string, string> = {
  "PROMO CLASICA": "Infusión + 2 panificados",
  "PROMO HELADO": "Cucurucho de 2 bochas",
};
const definicionDe = (producto: string) => {
  const clave = producto.toUpperCase();
  for (const [nombre, contenido] of Object.entries(CARTA)) {
    if (clave.includes(nombre)) return { contenido };
  }
  return null;
};
const esPromo = (producto: string) => /PROMO/i.test(producto);

const r = resumirCafe(
  [
    { detalle: "CABRALES PRESTIGE GRANO 1KG", cantidadKg: 10, costo: 200000 },
    { detalle: "HELADO DE CHOCOLATE", cantidadKg: 50, costo: 900000 },
  ],
  [
    { producto: "CORTADO", cantidad: 100 },
    { producto: "TE", cantidad: 500 },
    { producto: "PROMO CLASICA", cantidad: 200 },
    { producto: "PROMO HELADO", cantidad: 300 },
    { producto: "PROMO MISTERIOSA", cantidad: 40 },
  ],
  definicionDe,
  esPromo
);

// Sólo el café entra como compra: el helado del mismo remito no cuenta.
assert.strictEqual(r.compradoKg, 10);
assert.strictEqual(r.costoComprado, 200000);
assert.strictEqual(r.costoPorKg, 20000);

// 100 cortados + 200 promos con infusión + 40 de la promo sin declarar.
assert.strictEqual(r.infusionesSueltas, 100);
assert.strictEqual(r.infusionesEnPromo, 200);
assert.strictEqual(r.infusiones, 340);

// El té no aportó un solo gramo, y la promo de helado tampoco.
assert.ok(!r.detalle.some((d) => d.producto === "TE"));
assert.ok(!r.detalle.some((d) => d.producto === "PROMO HELADO"));

// La promo sin declarar cuenta una infusión supuesta, a la vista: 40 × 14 g.
assert.deepStrictEqual(r.promosSupuestas, [{ producto: "PROMO MISTERIOSA", unidades: 40, infusiones: 40 }]);
assert.strictEqual(r.infusionesSupuestas, 40);
assert.ok(Math.abs(r.consumidoKg - 4.76) < 1e-9, `con la supuesta ${r.consumidoKg}`);

assert.ok(Math.abs(r.balanceKg! - 5.24) < 1e-9, "10 comprados menos 4,76 explicados");
assert.ok(Math.abs(r.ratioConsumidoCompradoPct! - 47.6) < 1e-9);
assert.ok(Math.abs(r.costoPorInfusion! - 280) < 1e-9, "20000 $/kg × 14 g = $280");

// --- Lo que se contaba mal, del trimestre real de Las Cañas ---

// Dice "café" pero no es una taza.
assert.strictEqual(gramosDeVenta("HELADO DE CAPUCCINO"), null, "es un sabor de helado");
assert.strictEqual(gramosDeVenta("PLATOS CAFE GRANDE"), null, "es vajilla");
assert.strictEqual(gramosDeVenta("AGREGA TAZÓN CAFÉ XL"), null, "agrega a un café que ya se contó");
// Café que no se reconocía.
assert.strictEqual(gramosDeVenta("MOCACCINO"), GRAMOS_POR_INFUSION);
assert.strictEqual(gramosDeVenta("ICED LATTE CLASICO"), GRAMOS_POR_INFUSION);
// Un paquete para llevar se va entero.
assert.strictEqual(gramosDeVenta("CAFE PRESTIGE X KG"), 1000);

// La cantidad del remito es en unidades, no en kilos.
assert.strictEqual(kilosDeCompra("CAFE CABRALES MOLIDO COLOMBIA X250G", 2, "Unidades"), 0.5);
assert.strictEqual(kilosDeCompra("CAFE PRESTIGE NEGRO CABRALES X KG", 3, "Kilogramos"), 3);
assert.strictEqual(kilosDeCompra("CAFE CABRALES COLOMBIA GRANO x kg", 1, "Unidades"), 1);
assert.strictEqual(kilosDeCompra("CAFE CABRALES DESCAFEINADO X 20UN", 1, "Unidades"), null, "no dice el peso");

// Promos sin composición: una infusión; dos si es para dos; ninguna si es un agregado.
assert.strictEqual(infusionesSupuestas("PROMO DESAYUNO AMIGOS ROBERTO"), 1);
assert.strictEqual(infusionesSupuestas("PROMO PARA DOS"), 2);
assert.strictEqual(infusionesSupuestas("AGREGÁ JUGO A TU PROMO"), 0);
assert.strictEqual(infusionesSupuestas("HELADO 1KG PROMOCION"), 0);

// Lo que no dice cuánto pesa no se suma: se lista.
const conDescafeinado = resumirCafe(
  [
    { detalle: "CAFE PRESTIGE CABRALES X KG", cantidadKg: 2, costo: 100 },
    { detalle: "CAFE CABRALES DESCAFEINADO X 20UN", cantidadKg: null, cantidad: 1, costo: 10 },
  ],
  [],
  definicionDe,
  esPromo
);
assert.strictEqual(conDescafeinado.compradoKg, 2);
assert.deepStrictEqual(conDescafeinado.comprasSinPeso, [{ detalle: "CAFE CABRALES DESCAFEINADO X 20UN", cantidad: 1 }]);

// Sin compras cargadas no hay diferencia que informar: null, no cero. Cero
// diría "no falta nada", que es una afirmación que no se puede hacer.
const sinCompras = resumirCafe([], [{ producto: "CORTADO", cantidad: 10 }], definicionDe, esPromo);
assert.strictEqual(sinCompras.balanceKg, null);
assert.strictEqual(sinCompras.ratioConsumidoCompradoPct, null);
assert.strictEqual(sinCompras.costoPorInfusion, null);
assert.ok(sinCompras.consumidoKg > 0, "el consumo se mide igual");

console.log("lib/compras/consumoCafe.test.ts: todos los checks pasaron");
