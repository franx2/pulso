import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { datosDeReserva } from "@/lib/ventas/reservas";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

async function localDe(id: string) {
  return (await db.reserva.findUnique({ where: { id }, select: { localId: true } }))?.localId ?? null;
}

/** Editar la reserva o cambiarle el estado (confirmada, sentada, cancelada, no vino). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_additions");
  if (prohibido) return prohibido;
  const { id } = await params;
  const localId = await localDe(id);
  if (!localId) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  if (!enLocal(ctx, localId)) return fueraDeLocal();
  const r = await datosDeReserva(localId, await readJsonBody<Record<string, unknown>>(request));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await db.reserva.update({ where: { id }, data: r.ok });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_additions");
  if (prohibido) return prohibido;
  const { id } = await params;
  const localId = await localDe(id);
  if (!localId) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  if (!enLocal(ctx, localId)) return fueraDeLocal();
  await db.reserva.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
