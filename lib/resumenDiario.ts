/**
 * Agrega una tanda de ventas de Fudo en filas por día calendario, que es lo
 * que después lee el dashboard. Todo lo pesado (paginar la API) vive en
 * lib/fudoResumen.ts; acá sólo está la cuenta, que es pura y se testea sola.
 */

/** Fudo devuelve UTC; el negocio cierra la caja por día argentino (UTC-3),
 * así que una venta de las 23:30 de Mendoza (02:30Z del día siguiente) tiene
 * que caer en el día que se trabajó, no en el siguiente. */
const OFFSET_AR_MS = 3 * 60 * 60 * 1000;

export function claveDiaAR(iso: string): string {
  return new Date(new Date(iso).getTime() - OFFSET_AR_MS).toISOString().slice(0, 10);
}

export type VentaCruda = {
  id: string;
  attributes: { createdAt: string; total: number; people: number | null; saleType: string | null };
  relationships?: {
    items?: { data?: { id: string }[] };
    payments?: { data?: { id: string }[] };
    discounts?: { data?: { id: string }[] };
    cashRegister?: { data?: { id: string } | null };
  };
};
export type CajaCruda = { id: string; attributes: { name: string } };
export type ItemCrudo = {
  id: string;
  attributes: { price: number; quantity: number; canceled: boolean | null };
  relationships?: { product?: { data?: { id: string } | null } };
};
export type ProductoCrudo = {
  id: string;
  attributes: { name: string; cost: number | null };
  relationships?: { productCategory?: { data?: { id: string } | null } };
};
export type CategoriaCruda = { id: string; attributes: { name: string } };
export type PagoCrudo = {
  id: string;
  attributes: { amount: number; canceled: boolean | null };
  relationships?: { paymentMethod?: { data?: { id: string } | null } };
};
export type MedioPagoCrudo = { id: string; attributes: { name: string } };
export type DescuentoCrudo = { id: string; attributes: { amount: number; canceled: boolean | null } };

export type FilaResumen = {
  fecha: string;
  ventas: number;
  tickets: number;
  personas: number;
  descuentos: number;
  costo: number;
  costoIncompleto: boolean;
  porMedioPago: Record<string, number>;
  porCanal: Record<string, number>;
  porCategoria: Record<string, number>;
  /** Descuentos por caja, que en esta cuenta de Fudo es una persona: es la
   * respuesta a "quién lo descontó", no sólo cuánto. */
  descuentosPorCaja: Record<string, number>;
  topProductos: { nombre: string; cantidad: number; facturacion: number }[];
};

const TOP_PRODUCTOS = 20;

export function agregarPorDia(datos: {
  ventas: VentaCruda[];
  items: ItemCrudo[];
  productos: ProductoCrudo[];
  categorias: CategoriaCruda[];
  pagos: PagoCrudo[];
  mediosPago: MedioPagoCrudo[];
  descuentos: DescuentoCrudo[];
  cajas?: CajaCruda[];
}): FilaResumen[] {
  const itemPorId = new Map(datos.items.map((i) => [i.id, i]));
  const productoPorId = new Map(datos.productos.map((p) => [p.id, p]));
  const categoriaPorId = new Map(datos.categorias.map((c) => [c.id, c.attributes.name]));
  const pagoPorId = new Map(datos.pagos.map((p) => [p.id, p]));
  const medioPorId = new Map(datos.mediosPago.map((m) => [m.id, m.attributes.name]));
  const descuentoPorId = new Map(datos.descuentos.map((d) => [d.id, d]));
  const cajaPorId = new Map((datos.cajas ?? []).map((c) => [c.id, c.attributes.name]));

  // Los productos se acumulan por día y recién al final se recorta el top:
  // recortar antes daría un ranking distinto según el orden de las ventas.
  type Acumulador = FilaResumen & { productos: Map<string, { nombre: string; cantidad: number; facturacion: number }> };
  const porDia = new Map<string, Acumulador>();

  const bucket = (fecha: string): Acumulador => {
    let d = porDia.get(fecha);
    if (!d) {
      d = {
        fecha,
        ventas: 0,
        tickets: 0,
        personas: 0,
        descuentos: 0,
        costo: 0,
        costoIncompleto: false,
        porMedioPago: {},
        porCanal: {},
        porCategoria: {},
        descuentosPorCaja: {},
        topProductos: [],
        productos: new Map(),
      };
      porDia.set(fecha, d);
    }
    return d;
  };

  for (const v of datos.ventas) {
    const dia = bucket(claveDiaAR(v.attributes.createdAt));
    dia.ventas += v.attributes.total;
    dia.tickets++;
    dia.personas += v.attributes.people ?? 0;

    const canal = v.attributes.saleType ?? "SIN-CANAL";
    dia.porCanal[canal] = (dia.porCanal[canal] ?? 0) + v.attributes.total;

    for (const ref of v.relationships?.items?.data ?? []) {
      const item = itemPorId.get(ref.id);
      if (!item || item.attributes.canceled) continue;
      // `price` en Fudo ya es el total de la línea, no el unitario: una venta
      // de "CORTADO x2 @9200" cierra en 9200, no en 18400. Multiplicar por la
      // cantidad duplicaba la facturación por producto y por categoría.
      const facturacion = item.attributes.price;
      const producto = item.relationships?.product?.data?.id
        ? productoPorId.get(item.relationships.product.data.id)
        : undefined;

      // El costo del producto sí es unitario, así que acá la cantidad va.
      if (producto?.attributes.cost != null) {
        dia.costo += producto.attributes.cost * item.attributes.quantity;
      } else {
        // Un producto sin costo cargado hace que el margen del día quede
        // mejor de lo que es; se marca en vez de mentir por omisión.
        dia.costoIncompleto = true;
      }

      const categoriaId = producto?.relationships?.productCategory?.data?.id;
      const categoria = (categoriaId && categoriaPorId.get(categoriaId)) || "SIN CATEGORÍA";
      dia.porCategoria[categoria] = (dia.porCategoria[categoria] ?? 0) + facturacion;

      const nombre = producto?.attributes.name ?? "Sin nombre";
      const acc = dia.productos.get(nombre) ?? { nombre, cantidad: 0, facturacion: 0 };
      acc.cantidad += item.attributes.quantity;
      acc.facturacion += facturacion;
      dia.productos.set(nombre, acc);
    }

    for (const ref of v.relationships?.payments?.data ?? []) {
      const pago = pagoPorId.get(ref.id);
      if (!pago || pago.attributes.canceled) continue;
      const metodoId = pago.relationships?.paymentMethod?.data?.id;
      const medio = (metodoId && medioPorId.get(metodoId)) || "Sin especificar";
      dia.porMedioPago[medio] = (dia.porMedioPago[medio] ?? 0) + pago.attributes.amount;
    }

    const cajaId = v.relationships?.cashRegister?.data?.id;
    const caja = (cajaId && cajaPorId.get(cajaId)) || "Sin caja";
    for (const ref of v.relationships?.discounts?.data ?? []) {
      const desc = descuentoPorId.get(ref.id);
      if (!desc || desc.attributes.canceled) continue;
      dia.descuentos += desc.attributes.amount;
      dia.descuentosPorCaja[caja] = (dia.descuentosPorCaja[caja] ?? 0) + desc.attributes.amount;
    }
  }

  return [...porDia.values()]
    .map(({ productos, ...fila }) => ({
      ...fila,
      topProductos: [...productos.values()]
        .sort((a, b) => b.facturacion - a.facturacion)
        .slice(0, TOP_PRODUCTOS),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
