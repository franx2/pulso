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
 *    que la lleva. La promo que no está declarada no se estima: se lista como
 *    pendiente, igual que el helado hace con lo que no sabe leer.
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

export type OrigenCafe = "suelto" | "promo";

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
  /**
   * Promos sin composición declarada. No se estiman: son el trabajo que falta
   * para que este control cierre, y decirlo es más útil que inventarlo.
   */
  promosSinDefinir: { producto: string; unidades: number }[];
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
 * Bebidas que NO llevan café aunque se sirvan en la barra.
 *
 * Va antes que todo lo demás: "SUBMARINO" es chocolate, y un "TE" que
 * matchee por descuido convertiría toda la infusión en café inexistente.
 */
const SIN_CAFE = /\bTE\b|\bTE DE\b|MATE|SUBMARINO|CHOCOLATE|LECHE SOLA|JUGO|LIMONADA|LICUADO|AGUA|GASEOSA/;

/** Bebidas con espresso. Conservador: sólo lo que sin duda lleva café. */
const CON_CAFE =
  /\bCAFE\b|CORTADO|LATTE|CAPUCCINO|CAPUCHINO|MOCCA|MOCHA|LAGRIMA|AMERICANO|ESPRESSO|EXPRESO|MACCHIATO|FLAT WHITE|CARAJILLO|RISTRETTO|CAFETERA/;

/**
 * Cuántos gramos de café se fueron en una unidad vendida.
 *
 * `null` = este producto no lleva café, o no se puede saber.
 */
export function gramosDeVenta(producto: string): number | null {
  const nombre = normalizar(producto);
  if (SIN_CAFE.test(nombre) && !CON_CAFE.test(nombre)) return null;
  if (!CON_CAFE.test(nombre)) return null;
  return /\bDOBLE\b|\bDOPPIO\b/.test(nombre) ? GRAMOS_DOBLE : GRAMOS_POR_INFUSION;
}

/** Si el contenido declarado de una promo incluye una infusión. */
export function promoLlevaInfusion(contenido: string): boolean {
  return /INFUSION/.test(normalizar(contenido));
}

export function resumirCafe(
  compras: CompraCafe[],
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
  for (const compra of compras) {
    if (!esCafeComprado(compra.detalle)) continue;
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
  const pendientes = new Map<string, { producto: string; unidades: number }>();
  let consumidoGramos = 0;
  let infusionesSueltas = 0;
  let infusionesEnPromo = 0;

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

    // Una promo sin definir puede llevar café o no. Se lista, no se estima.
    if (esPromo(venta.producto)) {
      const clave = normalizar(venta.producto);
      const previo = pendientes.get(clave) ?? { producto: venta.producto, unidades: 0 };
      previo.unidades += venta.cantidad;
      pendientes.set(clave, previo);
      continue;
    }

    const gramosPorUnidad = gramosDeVenta(venta.producto);
    if (gramosPorUnidad == null) continue;
    const gramos = venta.cantidad * gramosPorUnidad;
    consumidoGramos += gramos;
    infusionesSueltas += venta.cantidad * (gramosPorUnidad / GRAMOS_POR_INFUSION);
    acumular(detalle, venta.producto, "suelto", venta.cantidad, gramosPorUnidad, gramos);
  }

  const consumidoKg = consumidoGramos / 1000;
  const infusiones = infusionesSueltas + infusionesEnPromo;
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
    detalle: [...detalle.values()].sort((a, b) => b.kilos - a.kilos),
    compras: [...porCompra.values()].sort((a, b) => b.kilos - a.kilos),
    promosSinDefinir: [...pendientes.values()].sort((a, b) => b.unidades - a.unidades),
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
