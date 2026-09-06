import assert from "node:assert";
import {
  claveProducto,
  resumirPorSector,
  sectorDe,
  sinClasificar,
  type FilaProducto,
  type Sector,
} from "./sectores";

/**
 * Los nombres de este test son productos reales de agosto de 2026, sacados de
 * `ProductoDiario`. Inventarlos no serviría: lo que hay que probar es que las
 * reglas aguantan cómo escribe las cosas esta cadena, no una taxonomía ideal.
 */

// --- Lo obvio de cada sector ---

assert.strictEqual(sectorDe("HELADO DE PISTACHO", "7. Heladería"), "HELADOS");
assert.strictEqual(sectorDe("CUCURUCHON DULCE X160", null), "HELADOS");
assert.strictEqual(sectorDe("CAFE PRESTIGE NEGRO CABRALES", "2.Cafetería"), "CAFETERIA");
assert.strictEqual(sectorDe("MEDIALUNA ByN MANTECA", "3. Panificados"), "CAFETERIA");
assert.strictEqual(sectorDe("TABLETA INDIVIDUAL 88%", "Tabletas"), "CHOCOLATERIA");
assert.strictEqual(sectorDe("PRESENTACION 6 LINGOTES", "Presentaciones"), "CHOCOLATERIA");

// --- El orden de las reglas, que es donde se juega ---

// "CAFÉ HELADO" es un café, no un helado: la regla de cafetería explícita va
// antes que la de helado.
assert.strictEqual(sectorDe("CAFÉ HELADO", null), "CAFETERIA");
assert.strictEqual(sectorDe("CAFE HELADO GRANDE", null), "CAFETERIA");

// Pero "TORTA HELADA" sí es helado, aunque diga torta: se compra por kilo de
// helado. Si ganara la regla de pastelería, el costo iría al sector equivocado.
assert.strictEqual(sectorDe("TORTA HELADA DE FRUTILLA", null), "HELADOS");
assert.strictEqual(sectorDe("ALFAJOR DE HELADO", null), "HELADOS", "el helado gana sobre el alfajor");

// Una promo que incluye helado sigue siendo una promo sin abrir. Meterla en
// helados atribuiría plata de cafetería al sector equivocado.
assert.strictEqual(sectorDe("PROMO HELADO 1/4", null), "PROMOCION");
assert.strictEqual(sectorDe("PROMO CLÁSICA", "1.Promociones"), "PROMOCION");
assert.strictEqual(sectorDe("ALMUERZO EJECUTIVO", "1.Promociones"), "PROMOCION");
assert.strictEqual(sectorDe("PROMO TOSTÓN", null), "PROMOCION");

// --- El nombre manda sobre la categoría ---

// Las categorías de Fudo están sucias y a veces mal puestas; el nombre no.
assert.strictEqual(
  sectorDe("HELADO DE MENTA GRANIZADA", "2.Cafetería"),
  "HELADOS",
  "un helado mal categorizado sigue siendo un helado"
);
// Y si el nombre no dice nada, recién ahí decide la categoría.
assert.strictEqual(sectorDe("ESPECIAL DE LA CASA", "7. Heladería"), "HELADOS");
assert.strictEqual(sectorDe("XX-99", null), "SIN_CLASIFICAR");

// --- Las excepciones ganan siempre ---

const overrides = new Map<string, Sector>([["COPA DEL MUNDO", "HELADOS"]]);
assert.strictEqual(sectorDe("COPA DEL MUNDO", null), "SIN_CLASIFICAR", "sin override no se puede saber");
assert.strictEqual(sectorDe("COPA DEL MUNDO", null, overrides), "HELADOS");
// El override se busca por clave normalizada: acentos y espacios de más no lo
// rompen, porque el mismo producto viene escrito distinto entre sucursales.
assert.strictEqual(sectorDe("  copa  del mundo ", null, overrides), "HELADOS");
// Y gana incluso contra una regla que sí coincidiría.
const forzado = new Map<string, Sector>([["TORTA ROGEL", "CHOCOLATERIA"]]);
assert.strictEqual(sectorDe("TORTA ROGEL", null), "CAFETERIA");
assert.strictEqual(sectorDe("TORTA ROGEL", null, forzado), "CHOCOLATERIA");

assert.strictEqual(claveProducto("  Café  Helado "), "CAFE HELADO");

// --- El resumen ---

const filas: FilaProducto[] = [
  { producto: "PROMO CLÁSICA", categoria: "1.Promociones", facturacion: 11388980, cantidad: 1675 },
  { producto: "CAFE CHICO", categoria: "2.Cafetería", facturacion: 4000000, cantidad: 2000 },
  { producto: "HELADO 1/4 KG", categoria: "7. Heladería", facturacion: 3000000, cantidad: 500 },
  { producto: "TABLETA 70%", categoria: "Tabletas", facturacion: 1000000, cantidad: 200 },
  { producto: "COPA DEL MUNDO", categoria: null, facturacion: 150000, cantidad: 10 },
];

const { sectores, total, cobertura } = resumirPorSector(filas);
assert.strictEqual(total, 19538980);
const porClave = new Map(sectores.map((s) => [s.sector, s]));
assert.strictEqual(porClave.get("PROMOCION")!.facturacion, 11388980);
assert.strictEqual(porClave.get("CAFETERIA")!.facturacion, 4000000);
assert.strictEqual(porClave.get("HELADOS")!.facturacion, 3000000);
assert.strictEqual(porClave.get("CHOCOLATERIA")!.facturacion, 1000000);
assert.strictEqual(porClave.get("SIN_CLASIFICAR")!.facturacion, 150000);

// Siempre los cinco, aunque alguno esté vacío: lo que no se puede atribuir
// tiene que verse, no desaparecer del gráfico.
assert.strictEqual(sectores.length, 5);
assert.strictEqual(resumirPorSector([]).sectores.length, 5);
assert.strictEqual(resumirPorSector([]).cobertura, 0, "sin datos no se inventa cobertura del 100%");

// LA CIFRA QUE IMPORTA: las promos sin abrir NO cuentan como cubiertas. Saber
// que algo es una promo no dice a qué sector pertenece su plata, y con el 35%
// de la venta ahí adentro, decir "cobertura 99%" sería mentir.
const esperada = ((4000000 + 3000000 + 1000000) / 19538980) * 100;
assert.ok(Math.abs(cobertura - esperada) < 0.01, `cobertura dio ${cobertura.toFixed(1)}%`);
assert.ok(cobertura < 45, "con una promo grande adentro la cobertura tiene que ser baja");

// Resolver la excepción sube la cobertura; abrir la promo la subiría mucho más.
const conOverride = resumirPorSector(filas, new Map([["COPA DEL MUNDO", "HELADOS" as Sector]]));
assert.ok(conOverride.cobertura > cobertura);

// --- La cola por mapear ---

const cola = sinClasificar(filas);
assert.strictEqual(cola.length, 1);
assert.strictEqual(cola[0].producto, "COPA DEL MUNDO");

// El mismo producto repetido en varios días se suma una sola vez, ordenado por
// plata: es la lista de trabajo, y hay que atacarla por lo que más pesa.
const repetido = sinClasificar([
  { producto: "XX-1", categoria: null, facturacion: 100, cantidad: 1 },
  { producto: "XX-1", categoria: null, facturacion: 400, cantidad: 4 },
  { producto: "XX-2", categoria: null, facturacion: 300, cantidad: 3 },
]);
assert.deepStrictEqual(
  repetido.map((f) => [f.producto, f.facturacion]),
  [["XX-1", 500], ["XX-2", 300]]
);

console.log("lib/compras/sectores.test.ts: todos los checks pasaron");
