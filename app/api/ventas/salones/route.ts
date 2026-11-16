import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Un salón nuevo, vacío, al final de la lista. */
export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_rooms");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ localId?: string; nombre?: string }>(request);
  if (!enLocal(ctx, body?.localId)) return fueraDeLocal();
  const nombre = body?.nombre?.trim() ?? "";
  if (!nombre) return NextResponse.json({ error: "Escribí el nombre del salón" }, { status: 400 });
  const ultimo = await db.salon.findFirst({ where: { localId: body!.localId! }, orderBy: { orden: "desc" }, select: { orden: true } });
  const salon = await db.salon.create({ data: { localId: body!.localId!, nombre: nombre.slice(0, 40), orden: (ultimo?.orden ?? 0) + 1 }, select: { id: true } });
  return NextResponse.json(salon);
}
