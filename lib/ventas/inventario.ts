import type { UnidadIngrediente } from "@prisma/client";
import { db } from "@/lib/db";
import { diaDeFechaSql, fechaSql, hoyAR, sumarDias } from "@/lib/fechaAR";
import { costear, INSUMOS, preciosDeInsumos, ultimosPrecios, type PrecioInsumo } from "@/lib/compras/recetas";
import type { GramosHelado } from "@/lib/compras/consumoHelado";

/**
 * Ingredientes, recetas y stock de un local.
 *
 * El costo de un ingrediente vinculado a un insumo de compras sale de la
 * última factura del proveedor (el mismo cálculo que usa la Carta); si no
 * está vinculado, del costo cargado a mano.
 *
 * El stock se CALCULA: último conteo + ingresos − egresos − lo que consumieron
 * las ventas cerradas desde ese conteo, según la receta vigente. No se guarda
 * un "descuento" por venta, así una venta anulada deja de restar sola y no hay
 * nada que revertir.
 */

const DIAS_PRECIOS = 120;

/** Precios de los insumos según las últimas compras al proveedor. */
export async function preciosVigentes(): Promise<Map<string, PrecioInsumo>> {
  const desde = sumarDias(hoyAR(), -DIAS_PRECIOS);
  const lineas = await db.compraItem.findMany({
    where: { compra: { tipo: "MERCADERIA", fecha: { gte: fechaSql(desde) } } },
    select: { detalle: true, precioUnitario: true, compra: { select: { fecha: true, ivaCredito: true } } },
  });
  return preciosDeInsumos(
    ultimosPrecios(
      lineas.map((l) => ({
        detalle: l.detalle,
        precioUnitario: l.precioUnitario,
        fecha: diaDeFechaSql(l.compra.fecha),
        esFactura: l.compra.ivaCredito != null,
      }))
    )
  );
}

/** Costo por unidad de un ingrediente: el de las facturas si está vinculado, si no el manual. */
export function costoUnitario(ing: { insumo: string | null; costo: number }, precios: Map<string, PrecioInsumo>) {
  const auto = ing.insumo ? precios.get(ing.insumo)?.porUnidad : undefined;
  return { costo: auto ?? ing.costo, automatico: auto != null };
}

export type RenglonReceta = { ingredienteId: string; cantidad: number };

/** Costo de una receta con los costos unitarios de cada ingrediente. */
export function costoDeReceta(receta: RenglonReceta[], costos: Map<string, number>) {
  return receta.reduce((s, r) => s + r.cantidad * (costos.get(r.ingredienteId) ?? 0), 0);
}

/**
 * Stock de cada ingrediente del local, calculado. Para cada uno: el último
 * conteo (o cero si nunca se contó), más ingresos, menos egresos, menos lo
 * consumido por ventas cerradas desde el conteo.
 */
export async function stockDeIngredientes(localId: string): Promise<Map<string, { stock: number; contadoEn: string | null }>> {
  const [ingredientes, movimientos, recetas] = await Promise.all([
    db.ingrediente.findMany({ where: { localId }, select: { id: true } }),
    db.movimientoStock.findMany({
      where: { ingrediente: { localId } },
      orderBy: { createdAt: "asc" },
      select: { ingredienteId: true, tipo: true, cantidad: true, createdAt: true },
    }),
    db.recetaItem.findMany({ where: { ingrediente: { localId } }, select: { productoId: true, ingredienteId: true, cantidad: true } }),
  ]);

  // Desde cuándo cuenta cada ingrediente: su último conteo.
  const base = new Map<string, { stock: number; desde: Date | null }>(ingredientes.map((i) => [i.id, { stock: 0, desde: null }]));
  for (const m of movimientos) {
    const b = base.get(m.ingredienteId);
    if (!b) continue;
    if (m.tipo === "CONTEO") {
      b.stock = m.cantidad;
      b.desde = m.createdAt;
    } else b.stock += m.tipo === "INGRESO" ? m.cantidad : -m.cantidad;
  }

  // Lo vendido desde el conteo más viejo que importe.
  const desdes = [...base.values()].map((b) => b.desde?.getTime() ?? 0);
  const minimo = new Date(Math.min(...desdes, Date.now()));
  const vendidos = recetas.length
    ? await db.itemVenta.findMany({
        where: {
          anulado: false,
          productoId: { in: [...new Set(recetas.map((r) => r.productoId))] },
          venta: { localId, estado: "CERRADA", cerradaEn: { gt: minimo } },
        },
        select: { productoId: true, cantidad: true, venta: { select: { cerradaEn: true } } },
      })
    : [];

  const recetaPorProducto = new Map<string, { ingredienteId: string; cantidad: number }[]>();
  for (const r of recetas) recetaPorProducto.set(r.productoId, [...(recetaPorProducto.get(r.productoId) ?? []), r]);
  for (const v of vendidos) {
    for (const r of recetaPorProducto.get(v.productoId!) ?? []) {
      const b = base.get(r.ingredienteId);
      if (!b || (b.desde && v.venta.cerradaEn! <= b.desde)) continue;
      b.stock -= v.cantidad * r.cantidad;
    }
  }

  return new Map([...base].map(([id, b]) => [id, { stock: Math.round(b.stock * 1000) / 1000, contadoEn: b.desde?.toISOString() ?? null }]));
}

const UNIDAD: Record<string, UnidadIngrediente> = { g: "G", ml: "ML", u: "U" };

/**
 * Arranca un local con los insumos de compras como ingredientes y, en cada
 * producto que todavía no tiene receta, la receta que ya usa la Carta
 * (cortado, promos, tostados, helado por formato…). No pisa nada: lo que ya
 * tiene receta o ya existe queda como está.
 */
export async function precargarRecetas(localId: string) {
  const [precios, equivalencias, existentes, productos] = await Promise.all([
    preciosVigentes(),
    db.equivalenciaHelado.findMany({ select: { formato: true, gramos: true } }),
    db.ingrediente.findMany({ where: { localId }, select: { id: true, nombre: true } }),
    db.productoVenta.findMany({ where: { localId, receta: { none: {} } }, select: { id: true, nombre: true } }),
  ]);
  const gramosHelado: GramosHelado = Object.fromEntries(equivalencias.map((e) => [e.formato, e.gramos]));

  const porNombre = new Map(existentes.map((i) => [i.nombre, i.id]));
  const nuevos = INSUMOS.filter((i) => !porNombre.has(i.nombre)).map((i) => ({
    localId,
    nombre: i.nombre,
    unidad: UNIDAD[i.unidad],
    insumo: i.id,
    costo: precios.get(i.id)?.porUnidad ?? 0,
  }));
  if (nuevos.length) await db.ingrediente.createMany({ data: nuevos, skipDuplicates: true });
  const todos = await db.ingrediente.findMany({ where: { localId }, select: { id: true, nombre: true } });
  const idPorNombre = new Map(todos.map((i) => [i.nombre, i.id]));

  // `costear` deja afuera los insumos sin precio; para armar la receta tienen
  // que estar todos, así que los que nunca se compraron entran con costo cero.
  const completos = new Map(precios);
  for (const i of INSUMOS) {
    if (!completos.has(i.id)) {
      completos.set(i.id, { id: i.id, nombre: i.nombre, unidad: i.unidad, precioCompra: 0, porUnidad: 0, porCompra: i.porCompra, fecha: "", detalles: [] });
    }
  }

  const renglones: { productoId: string; ingredienteId: string; cantidad: number }[] = [];
  let conReceta = 0;
  for (const p of productos) {
    const c = costear(p.nombre, completos, gramosHelado);
    if (!c) continue;
    const lineas = c.componentes.filter((x) => idPorNombre.has(x.nombre) && x.cantidad > 0);
    if (lineas.length === 0) continue;
    conReceta++;
    for (const l of lineas) renglones.push({ productoId: p.id, ingredienteId: idPorNombre.get(l.nombre)!, cantidad: Math.round(l.cantidad * 1000) / 1000 });
  }
  if (renglones.length) await db.recetaItem.createMany({ data: renglones, skipDuplicates: true });
  return { ingredientesNuevos: nuevos.length, productosConReceta: conReceta };
}
