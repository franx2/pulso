/**
 * Control de café: lo que entra por remito contra lo que sale por caja.
 *
 * Es el mismo control que ya existe para el helado y responde la misma
 * pregunta: si compré 40 kg y la venta explica 31, faltan 9 kg y eso tiene un
 * nombre. La diferencia con el helado es que el café casi nunca se vende como
 * café: se vende adentro de una promo, y una promo en Fudo es un producto
 * único que no dice qué lleva.
 *
 * Por eso hay dos caminos y se informan por separado:
 *
 * 1. **Sueltos** — el cortado, el latte, el americano. El nombre alcanza.
 * 2. **Promos** — cuentan una infusión cuando su definición en la carta dice
 *    que la lleva. La que no está declarada cuenta una infusión **supuesta**
 *    (dos si es "para dos"): la carta dice que todas la incluyen, y dejarlas
 *    en cero hacía faltar 10 kg por trimestre en Las Cañas —"Desayuno amigos"
 *    sola vende 400 por trimestre—. Se informan aparte para poder auditarlas.
 *
 * El gramaje es uno solo y es un promedio deliberado. Una parte de esas
 * infusiones son té o mate cocido y no llevan café en absoluto; otra parte son
 * dobles y llevan el doble. 14 g es el número que el dueño usa para planificar
 * y es el que hay que poder auditar, no una receta por variante que nadie
 * cargó.
 */

/** Gramos de café por infusión. El promedio con el que se compra. */
export const GRAMOS_POR_INFUSION = 14;

/** Una doble lleva dos veces la dosis, y el nombre lo dice. */
export const GRAMOS_DOBLE = GRAMOS_POR_INFUSION * 2;

export type CompraCafe = {
  detalle: string;
  cantidadKg: number;
  costo: number;
};

export type VentaCafe = {
  producto: string;
  cantidad: number;
};

export type OrigenCafe = "suelto" | "promo" | "supuesto";

export type ResumenCafe = {
  compradoKg: number;
  costoComprado: number;
  costoPorKg: number | null;
  /** Lo que la venta explica, en kg. */
  consumidoKg: number;
  /** `null` cuando no hay compras cargadas: sin base no hay diferencia. */
  balanceKg: number | null;
  ratioConsumidoCompradoPct: number | null;
  /** Cuánto cuesta el café que se fue en cada infusión. */
  costoPorInfusion: number | null;
  infusiones: number;
  infusionesSueltas: number;
  infusionesEnPromo: number;
  /** Promos sin composición cargada, contadas con una infusión cada una. */
  infusionesSupuestas: number;
  /** Qué productos aportaron, para poder discutir el número. */
  detalle: {
    producto: string;
    origen: OrigenCafe;
    unidades: number;
    gramosPorUnidad: number;
    kilos: number;
  }[];
  /** Compras de café, por si hay más de una marca o presentación. */
  compras: { detalle: string; kilos: number; costo: number }[];
  /** Las promos sin composición cargada que entraron con una infusión supuesta. */
  promosSupuestas: { producto: string; unidades: number; infusiones: number }[];
  /** Café comprado que no dice cuánto pesa ("X 20UN"): no se suma. */
  comprasSinPeso: { detalle: string; cantidad: number }[];
};

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * El café en el remito.
 *
 * Cabrales es la marca que compra el negocio; el mismo patrón que usa
 * `lib/compras/recetas.ts` para costear la promo, para que las dos cuentas
 * midan exactamente lo mismo.
 */
export function esCafeComprado(detalle: string): boolean {
  return /CAFE.*CABRALES|CABRALES.*(GRANO|PRESTIGE)/i.test(detalle);
}

/**
 * Kilos de café de un renglón del remito, según la presentación.
 *
 * La cantidad del remito es en unidades de venta, no en kilos: dos "MOLIDO
 * X250G" son medio kilo, no dos. Null si la presentación no dice el peso
 * ("DESCAFEINADO X 20UN"): sumarlo como un kilo inflaba lo comprado.
 */
export function kilosDeCompra(detalle: string, cantidad: number, unidad: string | null): number | null {
  const d = normalizar(detalle);
  const gramos = d.match(/X\s*(\d+(?:[.,]\d+)?)\s*(?:G|GR|GRS|GRAMOS)\b/);
  if (gramos) return (cantidad * Number(gramos[1].replace(",", "."))) / 1000;
  const kg = d.match(/X\s*(\d+(?:[.,]\d+)?)\s*KG\b/);
  if (kg) return cantidad * Number(kg[1].replace(",", "."));
  if (/X\s*KG\b|POR KG|\bKG\b/.test(d) || /KILO/i.test(unidad ?? "")) return cantidad;
  return null;
}

/**
 * Bebidas que NO llevan café aunque se sirvan en la barra.
 *
 * Va antes que todo lo demás: "SUBMARINO" es chocolate, y un "TE" que
 * matchee por descuido convertiría toda la infusión en café inexistente.
 */
const SIN_CAFE = /\bTE\b|\bTE DE\b|MATE|SUBMARINO|CHOCOLATE|LECHE SOLA|JUGO|LIMONADA|LICUADO|AGUA|GASEOSA/;

/**
 * Lo que dice "café" y no es una taza: un sabor de helado, la vajilla, o un
 * agregado a una bebida que ya se contó ("AGREGA TAZÓN CAFÉ XL").
 */
const NO_ES_UNA_TAZA = /HELADO DE|SABOR|VAJILLA|PLATO|\bTAZA\b|AGREG|ADICIONAL|OPCION|EXTRA\b|COOKIE|GALLET|TORTA|ALFAJOR/;

/** Bebidas con espresso. Conservador: sólo lo que sin duda lleva café. */
const CON_CAFE =
  /\bCAFE\b|CORTADO|LATTE|CAPUCCINO|CAPUCHINO|MOCCA|MOCHA|MOCACCINO|LAGRIMA|AMERICANO|ESPRESSO|EXPRESO|MACCHIATO|FLAT WHITE|CARAJILLO|RISTRETTO|CAFETERA/;

/**
 * Cuántos gramos de café se fueron en una unidad vendida.
 *
 * `null` = este producto no lleva café, o no se puede saber.
 */
export function gramosDeVenta(producto: string): number | null {
  const nombre = normalizar(producto);
  if (SIN_CAFE.test(nombre) && !CON_CAFE.test(nombre)) return null;
  if (!CON_CAFE.test(nombre)) return null;
  // Un paquete para llevar ("CAFE PRESTIGE X KG") se va entero.
  if (/\bX\s*\d*\s*(KG|G|GR|GRS)\b/.test(nombre)) {
    const paquete = kilosDeCompra(nombre, 1, null);
    if (paquete != null) return paquete * 1000;
  }
  if (NO_ES_UNA_TAZA.test(nombre)) return null;
  return /\bDOBLE\b|\bDOPPIO\b/.test(nombre) ? GRAMOS_DOBLE : GRAMOS_POR_INFUSION;
}

/**
 * Cuántas infusiones se suponen en una promo sin composición cargada.
 * Cero para lo que no es un desayuno o una merienda: los agregados ("AGREGÁ
 * JUGO A TU PROMO"), las promos de helado o de un combo de regalo.
 */
export function infusionesSupuestas(producto: string): number {
  const n = normalizar(producto);
  if (/AGREG|\bSUMA\b|ADICIONAL|EXTRA|OPCION|HELADO|SMOOTHIE|JUGO|COMBO|LICUADO/.test(n)) return 0;
  return /PARA DOS|2 PERSONAS|\bX ?2\b/.test(n) ? 2 : 1;
}

/** Si el contenido declarado de una promo incluye una infusión. */
export function promoLlevaInfusion(contenido: string): boolean {
  return /INFUSION/.test(normalizar(contenido));
}

export function resumirCafe(
  /** `cantidadKg` null = la presentación no dice cuánto pesa. */
  compras: (Omit<CompraCafe, "cantidadKg"> & { cantidadKg: number | null; cantidad?: number })[],
  ventas: VentaCafe[],
  /**
   * Cómo saber si una venta es una promo y qué lleva. Se inyecta para que
   * este módulo no dependa de la carta y se pueda testear con promos
   * inventadas.
   */
  definicionDe: (producto: string) => { contenido: string } | null,
  esPromo: (producto: string) => boolean
): ResumenCafe {
  let compradoKg = 0;
  let costoComprado = 0;
  const porCompra = new Map<string, { detalle: string; kilos: number; costo: number }>();
  const sinPeso = new Map<string, { detalle: string; cantidad: number }>();
  for (const compra of compras) {
    if (!esCafeComprado(compra.detalle)) continue;
    if (compra.cantidadKg == null) {
      const previo = sinPeso.get(normalizar(compra.detalle)) ?? { detalle: compra.detalle, cantidad: 0 };
      previo.cantidad += compra.cantidad ?? 0;
      sinPeso.set(normalizar(compra.detalle), previo);
      continue;
    }
    compradoKg += compra.cantidadKg;
    costoComprado += compra.costo;
    const clave = normalizar(compra.detalle);
    const acumulado = porCompra.get(clave) ?? { detalle: compra.detalle, kilos: 0, costo: 0 };
    acumulado.kilos += compra.cantidadKg;
    acumulado.costo += compra.costo;
    porCompra.set(clave, acumulado);
  }

  const detalle = new Map<
    string,
    { producto: string; origen: OrigenCafe; unidades: number; gramosPorUnidad: number; kilos: number }
  >();
  const supuestas = new Map<string, { producto: string; unidades: number; infusiones: number }>();
  let consumidoGramos = 0;
  let infusionesSueltas = 0;
  let infusionesEnPromo = 0;
  let totalSupuestas = 0;

  for (const venta of ventas) {
    if (venta.cantidad <= 0) continue;
    const definicion = definicionDe(venta.producto);

    if (definicion) {
      if (!promoLlevaInfusion(definicion.contenido)) continue;
      const gramos = venta.cantidad * GRAMOS_POR_INFUSION;
      consumidoGramos += gramos;
      infusionesEnPromo += venta.cantidad;
      acumular(detalle, venta.producto, "promo", venta.cantidad, GRAMOS_POR_INFUSION, gramos);
      continue;
    }

    // Una promo sin composición cargada: la infusión que dice la carta, como
    // supuesto y a la vista.
    if (esPromo(venta.producto)) {
      const porUnidad = infusionesSupuestas(venta.producto);
      if (porUnidad === 0) continue;
      const infusiones = venta.cantidad * porUnidad;
      const gramos = infusiones * GRAMOS_POR_INFUSION;
      consumidoGramos += gramos;
      totalSupuestas += infusiones;
      acumular(detalle, venta.producto, "supuesto", venta.cantidad, porUnidad * GRAMOS_POR_INFUSION, gramos);
      const clave = normalizar(venta.producto);
      const previo = supuestas.get(clave) ?? { producto: venta.producto, unidades: 0, infusiones: 0 };
      previo.unidades += venta.cantidad;
      previo.infusiones += infusiones;
      supuestas.set(clave, previo);
      continue;
    }

    const gramosPorUnidad = gramosDeVenta(venta.producto);
    if (gramosPorUnidad == null) continue;
    const gramos = venta.cantidad * gramosPorUnidad;
    consumidoGramos += gramos;
    // Un paquete para llevar suma kilos, no tazas.
    if (gramosPorUnidad <= GRAMOS_DOBLE) infusionesSueltas += venta.cantidad * (gramosPorUnidad / GRAMOS_POR_INFUSION);
    acumular(detalle, venta.producto, "suelto", venta.cantidad, gramosPorUnidad, gramos);
  }

  const consumidoKg = consumidoGramos / 1000;
  const infusiones = infusionesSueltas + infusionesEnPromo + totalSupuestas;
  const costoPorKg = compradoKg > 0 ? costoComprado / compradoKg : null;

  return {
    compradoKg,
    costoComprado,
    costoPorKg,
    consumidoKg,
    balanceKg: compradoKg > 0 ? compradoKg - consumidoKg : null,
    ratioConsumidoCompradoPct: compradoKg > 0 ? (consumidoKg / compradoKg) * 100 : null,
    costoPorInfusion: costoPorKg == null ? null : (costoPorKg * GRAMOS_POR_INFUSION) / 1000,
    infusiones,
    infusionesSueltas,
    infusionesEnPromo,
    infusionesSupuestas: totalSupuestas,
    detalle: [...detalle.values()].sort((a, b) => b.kilos - a.kilos),
    compras: [...porCompra.values()].sort((a, b) => b.kilos - a.kilos),
    promosSupuestas: [...supuestas.values()].sort((a, b) => b.unidades - a.unidades),
    comprasSinPeso: [...sinPeso.values()],
  };
}

function acumular(
  mapa: Map<
    string,
    { producto: string; origen: OrigenCafe; unidades: number; gramosPorUnidad: number; kilos: number }
  >,
  producto: string,
  origen: OrigenCafe,
  unidades: number,
  gramosPorUnidad: number,
  gramos: number
) {
  const clave = normalizar(producto);
  const previo = mapa.get(clave) ?? { producto, origen, unidades: 0, gramosPorUnidad, kilos: 0 };
  previo.unidades += unidades;
  previo.kilos += gramos / 1000;
  mapa.set(clave, previo);
}
