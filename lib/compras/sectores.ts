/**
 * A qué sector del negocio pertenece cada producto.
 *
 * El negocio se divide en tres: **helados**, **cafetería y comidas** y
 * **chocolatería**. Fudo no lo sabe: sus categorías están escritas distinto en
 * cada sucursal ("7. Heladería", "HELADERIA", "Heladeria PYA") y hay 99
 * variantes para un puñado de conceptos.
 *
 * Las reglas viven acá, en código, y no en la base. Son el vocabulario común
 * del negocio: se testean, se versionan y se revisan en un diff. Lo que sí va
 * a la base son las **excepciones** — el producto suelto que las reglas no
 * saben leer — porque eso es data, cambia seguido y lo carga el usuario.
 *
 * Las promociones son un sector aparte a propósito, no se reparten. Son el 35%
 * de la facturación y Fudo las guarda como un producto único: "PROMO CLÁSICA"
 * por $11,4M, sin decir qué lleva adentro. Meterlas en cafetería porque el
 * nombre suena a desayuno sería inventar un tercio de la venta. Quedan visibles
 * como lo que son —sin abrir— hasta que alguien declare su composición.
 */

import { definicionDe, repartir } from "./promos";

export const SECTORES = ["HELADOS", "CAFETERIA", "CHOCOLATERIA", "PROMOCION", "SIN_CLASIFICAR"] as const;
export type Sector = (typeof SECTORES)[number];

export const ETIQUETA_SECTOR: Record<Sector, string> = {
  HELADOS: "Helados",
  CAFETERIA: "Cafetería y comidas",
  CHOCOLATERIA: "Chocolatería",
  PROMOCION: "Promociones sin abrir",
  SIN_CLASIFICAR: "Sin clasificar",
};

/**
 * Las reglas, en orden. **La primera que coincide gana**, así que el orden es
 * parte de la definición y no un detalle.
 *
 * Los casos que obligan a que haya un orden y no un simple conjunto:
 * "CAFÉ HELADO" es cafetería, "TORTA HELADA" es helado, "ALFAJOR DE HELADO"
 * es helado, y "PROMO HELADO" es una promo antes que un helado.
 */
const REGLAS: { sector: Sector; patron: RegExp }[] = [
  // 1. Promos primero: una promo que incluye helado sigue siendo una promo.
  { sector: "PROMOCION", patron: /\bPROMO|PROMOCION|COMBO|ALMUERZO EJECUTIVO|DESAYUNO |MERIENDA |BRUNCH|MENU DEL DIA|\bPROTEIC/i },

  // 2. Cafetería explícita, antes que helado: "CAFÉ HELADO" es un café.
  { sector: "CAFETERIA", patron: /CAF[EÉ] HELADO|CAPUCCINO HELADO|SUBMARINO|FRAPPE/i },

  // 3. Helado. "TORTA HELADA" y "ALFAJOR DE HELADO" caen acá y no en
  //    pastelería ni chocolatería, que es lo correcto: se compran por kilo de
  //    helado.
  { sector: "HELADOS", patron: /HELAD|CUCURUCH|\bCONO\b|\bCONOS\b|PALITO|AFFOGATO|SUNDAE|BANANA SPLIT|POTE DE 1|\bPOTES?\b/i },

  // 4. Chocolatería: tabletas, bombones, alfajores y las presentaciones de
  //    regalo, que en el remito figuran como "PRESENTACION 6 LINGOTES".
  { sector: "CHOCOLATERIA", patron: /CHOCOLAT|TABLETA|BOMBON|ALFAJOR|PRESENTACION|LINGOTE|TRUFA|HUEVO DE PASCUA|CONITO|CHUPETIN|MARROC|GARRAPI/i },

  // 5. Cafetería y comidas: todo lo que se toma o se come en el local.
  { sector: "CAFETERIA", patron: /CAF[EÉ]|CAPUCCINO|LATTE|MOCCA|CORTADO|LAGRIMA|\bT[EÉ]\b|MATE|INFUSION|JUGO|LIMONADA|LICUADO|BEBIDA|AGUA|GASEOSA|SODA|CERVEZA|VINO|CHAMPA/i },
  { sector: "CAFETERIA", patron: /MEDIALUNA|TOSTAD|SANDW|PANINI|FOCACCIA|TARTA|TORTA|BUDIN|\bPAN\b|FACTURA|CROISSANT|WAFFLE|WAFLE|BRIOCHE|CHIPA|SCON|MUFFIN|PASTELER|PANIFICAD|MONOPORCION|CHEESECAKE|ROGEL|BROWNIE|CRUMBLE|LEMON PIE|CUADRADO DE/i },
  { sector: "CAFETERIA", patron: /ENSALADA|LOCRO|SOPA|OMELET|HUEVOS|MILANESA|POLLO|CARNE|JAM[OÓ]N|QUESO|AVOCADO|PALTA|YOGUR|GRANOLA|CEREAL|FRUTA|TERNERA|MORTADELA|BONDIOLA/i },
];

/**
 * Clasifica un producto.
 *
 * `overrides` son las correcciones cargadas por el usuario, con la clave ya
 * normalizada. Ganan siempre: si alguien dijo que "COPA DEL MUNDO" es helado,
 * ninguna regla lo discute.
 */
export function sectorDe(
  producto: string,
  categoria: string | null,
  overrides: Map<string, Sector> = new Map()
): Sector {
  const override = overrides.get(claveProducto(producto));
  if (override) return override;

  // El nombre del producto manda sobre la categoría: las categorías de Fudo
  // están sucias y a veces mal puestas, el nombre casi nunca.
  for (const regla of REGLAS) if (regla.patron.test(producto)) return regla.sector;
  if (categoria) for (const regla of REGLAS) if (regla.patron.test(categoria)) return regla.sector;
  return "SIN_CLASIFICAR";
}

/** Clave estable de un producto: sin acentos, sin dobles espacios, en mayúsculas. */
export function claveProducto(producto: string): string {
  return producto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type FilaProducto = {
  producto: string;
  categoria: string | null;
  facturacion: number;
  cantidad: number;
};

export type ResumenSector = {
  sector: Sector;
  etiqueta: string;
  facturacion: number;
  cantidad: number;
  productos: number;
  porcentaje: number;
};

/**
 * Reparte la facturación por sector.
 *
 * Devuelve siempre los cinco sectores, incluso en cero: que "sin clasificar" y
 * "promociones sin abrir" aparezcan aunque estén vacíos es el punto — lo que
 * no se puede atribuir tiene que verse, no desaparecer del gráfico.
 */
export function resumirPorSector(
  filas: FilaProducto[],
  overrides: Map<string, Sector> = new Map()
): {
  sectores: ResumenSector[];
  total: number;
  cobertura: number;
  promosRepartidas: number;
  promosSupuestas: number;
} {
  const acumulado = new Map<Sector, { facturacion: number; cantidad: number; productos: Set<string> }>();
  for (const sector of SECTORES) {
    acumulado.set(sector, { facturacion: 0, cantidad: 0, productos: new Set() });
  }

  // Facturación de promos que sí se pudo repartir: se descuenta de la
  // "cobertura pendiente" pero se sigue contando aparte, porque una promo
  // repartida por hipótesis no es lo mismo que un producto medido.
  let promosRepartidas = 0;
  let promosSupuestas = 0;

  for (const fila of filas) {
    const sector = sectorDe(fila.producto, fila.categoria, overrides);
    const clave = claveProducto(fila.producto);

    // Una promo con composición declarada se abre entre sus sectores. Sin
    // declaración queda en PROMOCION, visible como no atribuida: adivinar por
    // el nombre es justamente lo que hay que evitar con el 31% de la venta.
    if (sector === "PROMOCION") {
      const partes = repartir(fila.producto, fila.facturacion);
      if (partes) {
        for (const parte of partes) {
          const destino = acumulado.get(parte.sector)!;
          destino.facturacion += parte.monto;
          destino.productos.add(clave);
        }
        // Las unidades no se parten: una promo vendida es una promo vendida.
        acumulado.get("PROMOCION")!.cantidad += fila.cantidad;
        promosRepartidas += fila.facturacion;
        if (definicionDe(fila.producto)?.base === "supuesto") promosSupuestas += fila.facturacion;
        continue;
      }
    }

    const a = acumulado.get(sector)!;
    a.facturacion += fila.facturacion;
    a.cantidad += fila.cantidad;
    a.productos.add(clave);
  }

  const total = filas.reduce((s, f) => s + f.facturacion, 0);
  const sectores = SECTORES.map((sector) => {
    const a = acumulado.get(sector)!;
    return {
      sector,
      etiqueta: ETIQUETA_SECTOR[sector],
      facturacion: a.facturacion,
      cantidad: a.cantidad,
      productos: a.productos.size,
      porcentaje: total > 0 ? (a.facturacion / total) * 100 : 0,
    };
  });

  // Cobertura: qué parte de la venta está en un sector real del negocio. Las
  // promos sin abrir NO cuentan como cubiertas, aunque estén "clasificadas":
  // saber que algo es una promo no dice a qué sector pertenece su plata.
  const atribuido = sectores
    .filter((s) => s.sector !== "SIN_CLASIFICAR" && s.sector !== "PROMOCION")
    .reduce((s, x) => s + x.facturacion, 0);

  return {
    sectores,
    total,
    cobertura: total > 0 ? (atribuido / total) * 100 : 0,
    promosRepartidas,
    // Cuánta plata está atribuida por hipótesis y no por medición. Sin este
    // número la cobertura suena más firme de lo que es.
    promosSupuestas,
  };
}

/** Los productos sin sector, de mayor a menor: la cola que hay que mapear. */
export function sinClasificar(
  filas: FilaProducto[],
  overrides: Map<string, Sector> = new Map()
): FilaProducto[] {
  const porProducto = new Map<string, FilaProducto>();
  for (const fila of filas) {
    if (sectorDe(fila.producto, fila.categoria, overrides) !== "SIN_CLASIFICAR") continue;
    const clave = claveProducto(fila.producto);
    const previo = porProducto.get(clave);
    if (previo) {
      previo.facturacion += fila.facturacion;
      previo.cantidad += fila.cantidad;
    } else {
      porProducto.set(clave, { ...fila });
    }
  }
  return [...porProducto.values()].sort((a, b) => b.facturacion - a.facturacion);
}
