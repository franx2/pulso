import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { requireAdminApi } from "@/lib/session";
import { ES_FORMATO_HELADO } from "@/lib/compras/consumoHelado";

/**
 * Cambiar cuántos gramos lleva un formato de helado. `gramos: null` vuelve al
 * valor de fábrica. Es de toda la cadena, no de una sucursal.
 */
export async function PUT(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await readJsonBody<{ formato?: string; gramos?: number | null }>(request);
  const formato = body?.formato ?? "";
  if (!ES_FORMATO_HELADO(formato)) return NextResponse.json({ error: "Formato desconocido" }, { status: 400 });

  if (body?.gramos == null) {
    await db.equivalenciaHelado.deleteMany({ where: { formato } });
    return NextResponse.json({ ok: true, porDefecto: true });
  }
  const gramos = Number(body.gramos);
  // Una bocha no pesa 0 g ni 5 kg: un valor fuera de rango es un error de tipeo.
  if (!Number.isFinite(gramos) || gramos < 10 || gramos > 5000) {
    return NextResponse.json({ error: "Los gramos tienen que estar entre 10 y 5.000" }, { status: 400 });
  }
  await db.equivalenciaHelado.upsert({
    where: { formato },
    create: { formato, gramos },
    update: { gramos },
  });
  return NextResponse.json({ ok: true });
}
