import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/**
 * Cargar un producto en la venta. Nombre, precio y cocina se copian del
 * producto en este momento: si mañana cambia la carta, esta venta no cambia.
 * Queda "sin enviar" hasta que se imprime la comanda.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_additions");
  if (prohibido) return prohibido;

  const { id } = await params;
  const body = await readJsonBody<{ productoId?: string; cantidad?: number; comentario?: string }>(request);
  const cantidad = Number(body?.cantidad ?? 1);
  if (!(cantidad > 0) || cantidad > 999) return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });

  const venta = await db.venta.findUnique({ where: { id }, select: { estado: true, localId: true } });
  if (!venta) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
  if (venta.estado !== "EN_CURSO") return NextResponse.json({ error: "La venta ya está cerrada" }, { status: 409 });

  const producto = await db.productoVenta.findFirst({
    where: { id: body?.productoId ?? "", localId: venta.localId, activo: true },
    select: { id: true, nombre: true, precio: true, cocinaId: true, categoria: { select: { cocinaId: true } } },
  });
  if (!producto) return NextResponse.json({ error: "Ese producto no está en la carta de este local" }, { status: 400 });

  // Tocar dos veces el mismo producto suma en el mismo renglón mientras no se
  // haya enviado a cocina ni tenga comentario: lo decide el servidor, así los
  // toques rápidos no dependen de que la pantalla ya se haya actualizado.
  const comentario = body?.comentario?.trim().slice(0, 140) || null;
  if (!comentario) {
    const igual = await db.itemVenta.findFirst({
      where: { ventaId: id, productoId: producto.id, enviadoEn: null, anulado: false, comentario: null },
      select: { id: true },
    });
    if (igual) {
      await db.itemVenta.update({ where: { id: igual.id }, data: { cantidad: { increment: cantidad } } });
      return NextResponse.json({ id: igual.id, sumado: true });
    }
  }

  const item = await db.itemVenta.create({
    data: {
      ventaId: id,
      productoId: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad,
      comentario,
      // La cocina del producto, o la de su categoría.
      cocinaId: producto.cocinaId ?? producto.categoria.cocinaId,
      creadoPorId: ctx.empleadoId,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: item.id });
}
