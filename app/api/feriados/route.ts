import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi, requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

export async function GET() {
  // Reportes y turnos (encargado) necesitan saber qué días son feriado.
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const feriados = await db.feriado.findMany({ orderBy: { fecha: "asc" } });
  return NextResponse.json({ feriados });
}

export async function POST(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await readJsonBody<{ fecha: string; nombre: string }>(request);
  if (!body?.fecha || !body.nombre?.trim()) {
    return NextResponse.json({ error: "Fecha y nombre son obligatorios" }, { status: 400 });
  }

  const [y, m, d] = body.fecha.split("-").map(Number);
  if (!y || !m || !d) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  const fecha = new Date(Date.UTC(y, m - 1, d));

  try {
    const feriado = await db.feriado.create({ data: { fecha, nombre: body.nombre.trim() } });
    return NextResponse.json({ feriado });
  } catch {
    return NextResponse.json({ error: "Ya hay un feriado cargado ese día" }, { status: 409 });
  }
}
