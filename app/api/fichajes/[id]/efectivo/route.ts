import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmpleadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

/** El empleado carga el efectivo que contó al fichar su propia salida. Sólo
 * sobre su propio fichaje, y sólo si esa salida generó un arqueo (Fudo
 * configurado en el local). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const fichaje = await db.fichaje.findUnique({ where: { id } });
  if (!fichaje || fichaje.empleadoId !== session.empleadoId) {
    return NextResponse.json({ error: "Fichaje no encontrado" }, { status: 404 });
  }
  if (fichaje.tipo !== "SALIDA" || fichaje.efectivoEsperado == null) {
    return NextResponse.json({ error: "Este fichaje no tiene arqueo" }, { status: 400 });
  }

  const body = await readJsonBody<{ efectivoContado?: number }>(request);
  const efectivoContado = typeof body?.efectivoContado === "number" ? body.efectivoContado : null;
  if (efectivoContado == null || efectivoContado < 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
  }

  const actualizado = await db.fichaje.update({ where: { id }, data: { efectivoContado } });
  return NextResponse.json({ fichaje: actualizado });
}
