import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi, requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

export async function GET() {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const locales = await db.local.findMany({
    orderBy: { nombre: "asc" },
    include: { _count: { select: { empleados: true } } },
  });
  return NextResponse.json({ locales });
}

export async function POST(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await readJsonBody<{ nombre: string }>(request);
  if (!body?.nombre?.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const local = await db.local.create({ data: { nombre: body.nombre.trim() } });
  return NextResponse.json({ local });
}
