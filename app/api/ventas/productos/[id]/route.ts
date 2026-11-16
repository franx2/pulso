import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/**
 * Editar un producto y, si viene, reemplazar su receta entera. Queda marcado
 * como editado en Pulso: sincronizar con Fudo ya no lo pisa.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "update_products");
  if (prohibido) return prohibido;

  const { id } = await params;
  const body = await readJsonBody<{
    nombre?: string;
    codigo?: string | null;
    categoriaId?: string;
    cocinaId?: string | null;
    precio?: number;
    activo?: boolean;
    favorito?: boolean;
    receta?: { ingredienteId: string; cantidad: number }[];
  }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const producto = await db.productoVenta.findUnique({ where: { id }, select: { localId: true } });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (!enLocal(ctx, producto.localId)) return fueraDeLocal();

  const data: Record<string, unknown> = { editadoEn: new Date() };
  if (body.nombre !== undefined) {
    if (!body.nombre.trim()) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    data.nombre = body.nombre.trim();
  }
  if (body.codigo !== undefined) data.codigo = body.codigo?.trim() || null;
  if (body.precio !== undefined) {
    if (!(Number(body.precio) >= 0)) return NextResponse.json({ error: "El precio no puede ser negativo" }, { status: 400 });
    data.precio = Number(body.precio);
  }
  if (body.activo !== undefined) data.activo = Boolean(body.activo);
  if (body.favorito !== undefined) data.favorito = Boolean(body.favorito);
  if (body.categoriaId !== undefined) {
    const cat = await db.categoriaVenta.findFirst({ where: { id: body.categoriaId, localId: producto.localId }, select: { id: true } });
    if (!cat) return NextResponse.json({ error: "Esa categoría no es de este local" }, { status: 400 });
    data.categoriaId = cat.id;
  }
  if (body.cocinaId !== undefined) {
    if (body.cocinaId) {
      const cocina = await db.cocina.findFirst({ where: { id: body.cocinaId, localId: producto.localId }, select: { id: true } });
      if (!cocina) return NextResponse.json({ error: "Esa cocina no es de este local" }, { status: 400 });
    }
    data.cocinaId = body.cocinaId || null;
  }

  let receta: { ingredienteId: string; cantidad: number }[] | null = null;
  if (body.receta) {
    const lineas = body.receta.filter((r) => Number(r.cantidad) > 0);
    const ids = [...new Set(lineas.map((r) => r.ingredienteId))];
    if (ids.length !== lineas.length) return NextResponse.json({ error: "Un ingrediente está dos veces en la receta" }, { status: 400 });
    const validos = await db.ingrediente.count({ where: { id: { in: ids }, localId: producto.localId } });
    if (validos !== ids.length) return NextResponse.json({ error: "La receta usa ingredientes que no son de este local" }, { status: 400 });
    receta = lineas.map((r) => ({ ingredienteId: r.ingredienteId, cantidad: Number(r.cantidad) }));
  }

  await db.$transaction([
    db.productoVenta.update({ where: { id }, data }),
    ...(receta
      ? [
          db.recetaItem.deleteMany({ where: { productoId: id } }),
          db.recetaItem.createMany({ data: receta.map((r) => ({ productoId: id, ...r })) }),
        ]
      : []),
  ]);
  return NextResponse.json({ ok: true });
}
