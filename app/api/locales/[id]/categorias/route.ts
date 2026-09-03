import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi, requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id: localId } = await params;
  const categorias = await db.categoria.findMany({ where: { localId }, orderBy: { nombre: "asc" } });
  return NextResponse.json({ categorias });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id: localId } = await params;
  const body = await readJsonBody<{ nombre: string }>(request);
  if (!body?.nombre?.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  let categoria;
  try {
    categoria = await db.categoria.create({ data: { localId, nombre: body.nombre.trim() } });
  } catch {
    return NextResponse.json({ error: "Ya existe una categoría con ese nombre en este local" }, { status: 409 });
  }

  return NextResponse.json({ categoria });
}
