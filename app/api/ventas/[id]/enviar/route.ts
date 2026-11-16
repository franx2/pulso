import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/**
 * Mandar a cocina lo cargado y no enviado: se marca con la misma hora, y esa
 * hora es la que usa la página de impresión para armar una comanda por cocina.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_additions");
  if (prohibido) return prohibido;
  const { id } = await params;

  const venta = await db.venta.findUnique({ where: { id }, select: { estado: true } });
  if (!venta) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
  if (venta.estado !== "EN_CURSO") return NextResponse.json({ error: "La venta ya está cerrada" }, { status: 409 });

  const enviadoEn = new Date();
  const { count } = await db.itemVenta.updateMany({
    where: { ventaId: id, enviadoEn: null, anulado: false },
    data: { enviadoEn },
  });
  if (count === 0) return NextResponse.json({ error: "No hay nada nuevo para enviar" }, { status: 409 });
  return NextResponse.json({ enviadoEn: enviadoEn.toISOString(), cantidad: count });
}
