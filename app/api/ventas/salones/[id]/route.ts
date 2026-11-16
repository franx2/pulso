import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Renombrar un salón. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_rooms");
  if (prohibido) return prohibido;
  const { id } = await params;
  const salon = await db.salon.findUnique({ where: { id }, select: { localId: true } });
  if (!salon) return NextResponse.json({ error: "Salón no encontrado" }, { status: 404 });
  if (!enLocal(ctx, salon.localId)) return fueraDeLocal();
  const body = await readJsonBody<{ nombre?: string }>(request);
  const nombre = body?.nombre?.trim() ?? "";
  if (!nombre) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
  await db.salon.update({ where: { id }, data: { nombre: nombre.slice(0, 40) } });
  return NextResponse.json({ ok: true });
}

/** Borrar un salón: sólo si ninguna de sus mesas tuvo ventas. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_rooms");
  if (prohibido) return prohibido;
  const { id } = await params;
  const salon = await db.salon.findUnique({ where: { id }, select: { localId: true } });
  if (!salon) return NextResponse.json({ error: "Salón no encontrado" }, { status: 404 });
  if (!enLocal(ctx, salon.localId)) return fueraDeLocal();
  const conVentas = await db.venta.count({ where: { mesa: { salonId: id } } });
  if (conVentas) {
    return NextResponse.json({ error: "Este salón ya tuvo ventas: sacá sus mesas en vez de borrarlo, así el historial no las pierde" }, { status: 409 });
  }
  await db.salon.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
