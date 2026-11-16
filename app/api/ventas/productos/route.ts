import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { costoDeReceta, costoUnitario, preciosVigentes, stockDeIngredientes } from "@/lib/ventas/inventario";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Más de mil productos con su receta, y el stock calculado de cada ingrediente. */
export const maxDuration = 60;

/**
 * Todo lo de la pantalla de Productos de un local: productos con su receta y
 * su costo, categorías, cocinas e ingredientes con su costo y su stock.
 */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const localId = new URL(request.url).searchParams.get("localId") ?? "";

  const [productos, categorias, cocinas, ingredientes, precios, stock] = await Promise.all([
    db.productoVenta.findMany({
      where: { localId },
      orderBy: [{ nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        codigo: true,
        categoriaId: true,
        cocinaId: true,
        precio: true,
        activo: true,
        favorito: true,
        editadoEn: true,
        fudoId: true,
        receta: { select: { ingredienteId: true, cantidad: true } },
      },
    }),
    db.categoriaVenta.findMany({ where: { localId }, orderBy: [{ orden: "asc" }, { nombre: "asc" }], select: { id: true, nombre: true, padreId: true } }),
    db.cocina.findMany({ where: { localId }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.ingrediente.findMany({
      where: { localId },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, unidad: true, insumo: true, costo: true, stockMinimo: true, activo: true, _count: { select: { recetas: true } } },
    }),
    preciosVigentes(),
    stockDeIngredientes(localId),
  ]);

  const ingredientesConCosto = ingredientes.map((i) => {
    const { costo, automatico } = costoUnitario(i, precios);
    return {
      id: i.id,
      nombre: i.nombre,
      unidad: i.unidad,
      insumo: i.insumo,
      costoManual: i.costo,
      costo,
      automatico,
      stockMinimo: i.stockMinimo,
      activo: i.activo,
      enRecetas: i._count.recetas,
      stock: stock.get(i.id)?.stock ?? 0,
      contadoEn: stock.get(i.id)?.contadoEn ?? null,
    };
  });
  const costos = new Map(ingredientesConCosto.map((i) => [i.id, i.costo]));

  return NextResponse.json({
    productos: productos.map((p) => ({
      ...p,
      editadoEn: p.editadoEn?.toISOString() ?? null,
      costo: p.receta.length ? costoDeReceta(p.receta, costos) : null,
    })),
    categorias,
    cocinas,
    ingredientes: ingredientesConCosto,
    permisos: ctx.permisos,
  });
}

/** Crear un producto nuevo en la carta del local. */
export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "update_products");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ localId?: string; nombre?: string; categoriaId?: string; precio?: number; codigo?: string; cocinaId?: string | null }>(request);
  const nombre = body?.nombre?.trim() ?? "";
  const precio = Number(body?.precio);
  if (!nombre) return NextResponse.json({ error: "Escribí el nombre del producto" }, { status: 400 });
  if (!(precio >= 0)) return NextResponse.json({ error: "El precio no puede ser negativo" }, { status: 400 });
  const categoria = await db.categoriaVenta.findFirst({ where: { id: body?.categoriaId ?? "", localId: body?.localId ?? "" }, select: { id: true, localId: true } });
  if (!categoria) return NextResponse.json({ error: "Elegí una categoría de este local" }, { status: 400 });

  const producto = await db.productoVenta.create({
    data: {
      localId: categoria.localId,
      categoriaId: categoria.id,
      nombre,
      precio,
      codigo: body?.codigo?.trim() || null,
      cocinaId: body?.cocinaId || null,
      editadoEn: new Date(),
    },
    select: { id: true },
  });
  return NextResponse.json({ id: producto.id });
}
