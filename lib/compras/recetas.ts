/**
 * Costo de lo que se arma en el local.
 *
 * Hay productos que se compran y se venden tal cual —una tableta, una torta—
 * y ahí el costo sale directo del remito. Pero una promo y un cucurucho se
 * ARMAN: llevan café, leche, helado y un envase que se compran por separado.
 * Sin receta, esos productos no tienen costo y son el 45% de la facturación.
 *
 * Los precios NO están escritos acá. Se leen de los remitos en cada consulta,
 * así que suben solos con la inflación: lo único fijo es cuánto entra de cada
 * cosa, que es lo que de verdad no cambia.
 */

/** Un insumo, con cómo encontrarlo en el remito y cómo pasar a unidad de uso. */
export type Insumo = {
  id: string;
  etiqueta: string;
  /** Con qué se lo reconoce en el detalle del remito. */
  patron: RegExp;
  /**
   * Cuántas unidades de consumo trae una unidad de compra.
   *
   * El café se compra por kilo y se usa por kilo: 1. La leche viene en pack de
   * 12 litros y se usa por litro: 12. Los potes vienen de a 25 y se usan de a
   * uno: 25. Sin esto, un pack de leche costaría lo mismo que un litro.
   */
  porCompra: number;
  unidad: string;
};

export const INSUMOS: Insumo[] = [
  { id: "cafe", etiqueta: "Café en grano", patron: /CAFE.*CABRALES|CABRALES.*(GRANO|PRESTIGE)/i, porCompra: 1, unidad: "kg" },
  { id: "leche", etiqueta: "Leche entera", patron: /PACK LECHE ENTERA/i, porCompra: 12, unidad: "litro" },
  { id: "helado", etiqueta: "Helado", patron: /^HELADO DE /i, porCompra: 1, unidad: "kg" },
  { id: "pote1", etiqueta: "Pote 1 kg", patron: /POTE DE HELADO 1 KG/i, porCompra: 25, unidad: "unidad" },
  { id: "pote025", etiqueta: "Pote 1/4 kg", patron: /POTE DE HELADO 1\/4 KG/i, porCompra: 25, unidad: "unidad" },
  { id: "cucurucho", etiqueta: "Cucurucho", patron: /CUCURUCHON DULCE X160/i, porCompra: 160, unidad: "unidad" },
  { id: "medialuna", etiqueta: "Medialuna", patron: /MEDIALUNA ByN MANTECA/i, porCompra: 100, unidad: "unidad" },
];

export type LineaCompra = { detalle: string; precioUnitario: number; fecha: string };

/**
 * Precio por unidad de uso de cada insumo, según la compra MÁS RECIENTE.
 *
 * La más reciente y no el promedio: el café subió 8% en cuatro días, y para
 * decidir si un producto todavía deja margen importa lo que cuesta hoy, no lo
 * que costó el mes pasado.
 */
export function preciosDeInsumos(compras: LineaCompra[]): Map<string, { precio: number; fecha: string; detalle: string }> {
  const precios = new Map<string, { precio: number; fecha: string; detalle: string }>();
  for (const insumo of INSUMOS) {
    const candidatas = compras
      .filter((c) => insumo.patron.test(c.detalle) && c.precioUnitario > 0)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (candidatas.length === 0) continue;
    const ultima = candidatas[0];
    precios.set(insumo.id, {
      precio: ultima.precioUnitario / insumo.porCompra,
      fecha: ultima.fecha,
      detalle: ultima.detalle,
    });
  }
  return precios;
}

export type Componente = { insumo: string; cantidad: number };
export type Receta = {
  patron: RegExp;
  nombre: string;
  componentes: Componente[];
  /** Lo que la receta NO cubre, para no dar por completo un costo que no lo está. */
  faltante?: string;
};

/**
 * La infusión que llevan TODAS las promos: 14 g de café y 150 ml de leche.
 * Las cantidades las fijó el dueño.
 */
export const INFUSION: Componente[] = [
  { insumo: "cafe", cantidad: 0.014 },
  { insumo: "leche", cantidad: 0.15 },
];

export const RECETAS: Receta[] = [
  // --- Helados: helado a granel más el envase ---
  {
    patron: /HELADO 1\s?KG|HELADO DE 1 KG/i,
    nombre: "Pote 1 kg",
    componentes: [
      { insumo: "helado", cantidad: 1 },
      { insumo: "pote1", cantidad: 1 },
    ],
  },
  {
    patron: /HELADO 1\/2\s?KG/i,
    nombre: "Pote 1/2 kg",
    componentes: [
      { insumo: "helado", cantidad: 0.5 },
      // El pote de 1/2 kg no aparece en ningún remito: se usa el de 1/4 como
      // referencia y queda declarado, en vez de dejar el envase en cero.
      { insumo: "pote025", cantidad: 1 },
    ],
    faltante: "el pote de 1/2 kg no está en los remitos; se usa el de 1/4 como referencia",
  },
  {
    patron: /HELADO 1\/4\s?KG/i,
    nombre: "Pote 1/4 kg",
    componentes: [
      { insumo: "helado", cantidad: 0.25 },
      { insumo: "pote025", cantidad: 1 },
    ],
  },
  {
    patron: /CUCURUCHON|CUCURUCHO 3/i,
    nombre: "Cucuruchón",
    componentes: [
      { insumo: "helado", cantidad: 0.18 },
      { insumo: "cucurucho", cantidad: 1 },
    ],
  },
  {
    patron: /CUCURUCHO/i,
    nombre: "Cucurucho",
    componentes: [
      { insumo: "helado", cantidad: 0.12 },
      { insumo: "cucurucho", cantidad: 1 },
    ],
  },

  // --- Promos: infusión más lo que dice la carta ---
  {
    patron: /PROMO CL[AÁ]SICA/i,
    nombre: "Promo Clásica",
    componentes: [...INFUSION, { insumo: "medialuna", cantidad: 2 }],
  },
  {
    patron: /PROMO MA[NÑ]ANA/i,
    nombre: "Promo Mañana",
    componentes: [...INFUSION, { insumo: "medialuna", cantidad: 2 }],
    faltante: "no está en la carta cargada; se asume igual a la Clásica",
  },
  {
    // El resto de las promos lleva la infusión y un acompañamiento que se
    // compra armado (tostado, chipa, tostón). Ese costo sale del remito por
    // producto, no de una receta: acá sólo se cubre la infusión.
    patron: /PROMO|ALMUERZO EJECUTIVO|DESAYUNO /i,
    nombre: "Promo (sólo infusión)",
    componentes: INFUSION,
    faltante: "falta el costo del acompañamiento, que se compra armado",
  },
];

export type CostoArmado = {
  nombre: string;
  costo: number;
  detalle: { etiqueta: string; cantidad: number; unidad: string; precio: number; subtotal: number }[];
  /** Insumos de la receta que no aparecen en ningún remito. */
  sinPrecio: string[];
  faltante: string | null;
  completo: boolean;
};

/**
 * Costo de armar un producto.
 *
 * Devuelve `null` si no hay receta: mejor que el producto quede sin costo a
 * que aparezca con uno inventado.
 */
export function costoDe(
  producto: string,
  precios: Map<string, { precio: number }>
): CostoArmado | null {
  const receta = RECETAS.find((r) => r.patron.test(producto));
  if (!receta) return null;

  const detalle: CostoArmado["detalle"] = [];
  const sinPrecio: string[] = [];
  let costo = 0;

  for (const componente of receta.componentes) {
    const insumo = INSUMOS.find((i) => i.id === componente.insumo)!;
    const precio = precios.get(componente.insumo)?.precio;
    if (precio == null) {
      sinPrecio.push(insumo.etiqueta);
      continue;
    }
    const subtotal = precio * componente.cantidad;
    costo += subtotal;
    detalle.push({
      etiqueta: insumo.etiqueta,
      cantidad: componente.cantidad,
      unidad: insumo.unidad,
      precio,
      subtotal,
    });
  }

  return {
    nombre: receta.nombre,
    costo,
    detalle,
    sinPrecio,
    faltante: receta.faltante ?? null,
    completo: sinPrecio.length === 0 && !receta.faltante,
  };
}
