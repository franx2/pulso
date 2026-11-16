import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

async function propio(id: string) {
  return db.descuentoPlantilla.findUnique({ where: { id }, select: { localId: true } });
}

/** Activar o desactivar un descuento de la lista. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_discount_templates");
  if (prohibido) return prohibido;
  const { id } = await params;
  const d = await propio(id);
  if (!d) return NextResponse.json({ error: "Descuento no encontrado" }, { status: 404 });
  if (!enLocal(ctx, d.localId)) return fueraDeLocal();
  const body = await readJsonBody<{ activo?: boolean }>(request);
  await db.descuentoPlantilla.update({ where: { id }, data: { activo: Boolean(body?.activo) } });
  return NextResponse.json({ ok: true });
}

/** Borrarlo de la lista. Las ventas que ya lo usaron guardan su nombre y su monto. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_discount_templates");
  if (prohibido) return prohibido;
  const { id } = await params;
  const d = await propio(id);
  if (!d) return NextResponse.json({ error: "Descuento no encontrado" }, { status: 404 });
  if (!enLocal(ctx, d.localId)) return fueraDeLocal();
  await db.descuentoPlantilla.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
