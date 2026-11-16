import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { ordenarMedios } from "@/lib/ventas/importarFudo";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Todos los medios de pago del local, activos o no, para configurarlos. */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const localId = new URL(request.url).searchParams.get("localId") ?? "";
  const medios = await db.medioPago.findMany({
    where: { localId },
    orderBy: { orden: "asc" },
    select: { id: true, nombre: true, tipo: true, activo: true },
  });
  return NextResponse.json({ medios: ordenarMedios(medios) });
}

/** Activar o desactivar un medio de pago. */
export async function PATCH(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_payment_types");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ id?: string; activo?: boolean }>(request);
  await db.medioPago.update({ where: { id: body?.id ?? "" }, data: { activo: Boolean(body?.activo) } });
  return NextResponse.json({ ok: true });
}
