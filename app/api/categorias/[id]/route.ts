import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody<{ nombre: string }>(request);
  if (!body?.nombre?.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  let categoria;
  try {
    categoria = await db.categoria.update({ where: { id }, data: { nombre: body.nombre.trim() } });
  } catch {
    return NextResponse.json({ error: "Ya existe una categoría con ese nombre en este local" }, { status: 409 });
  }

  return NextResponse.json({ categoria });
}

/** Borrar una categoría no borra empleados: quedan sin categoría (onDelete: SetNull). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  await db.categoria.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
