import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";

/** Borrar un movimiento bancario cargado por error. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  await db.movimientoBancario.delete({ where: { id } }).catch(() => null);

  return NextResponse.json({ ok: true });
}
