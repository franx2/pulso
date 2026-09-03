import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEncargadoApi } from "@/lib/session";

/** Marca una alerta como resuelta: el encargado ya la miró y la dio por vista. */
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;

  const alerta = await db.alerta.update({
    where: { id },
    data: { resuelta: true, resueltaPorId: session.empleadoId, resueltaEn: new Date() },
  });

  return NextResponse.json({ alerta });
}
