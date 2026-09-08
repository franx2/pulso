import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";

/** Borrar un pago cargado por error. No hay edición: se borra y se vuelve a cargar. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  await db.pagoProveedor.delete({ where: { id } }).catch(() => null);

  return NextResponse.json({ ok: true });
}
