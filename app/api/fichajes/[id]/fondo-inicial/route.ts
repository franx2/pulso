import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmpleadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

/** El empleado carga cuánto había en la caja al abrir, sólo sobre su propio
 * fichaje de ENTRADA — la salida lo suma a lo vendido para el arqueo. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const fichaje = await db.fichaje.findUnique({ where: { id } });
  if (!fichaje || fichaje.empleadoId !== session.empleadoId) {
    return NextResponse.json({ error: "Fichaje no encontrado" }, { status: 404 });
  }
  if (fichaje.tipo !== "ENTRADA") {
    return NextResponse.json({ error: "El fondo inicial se carga al abrir la caja" }, { status: 400 });
  }

  const body = await readJsonBody<{ fondoInicial?: number }>(request);
  const fondoInicial = typeof body?.fondoInicial === "number" ? body.fondoInicial : null;
  if (fondoInicial == null || fondoInicial < 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
  }

  const actualizado = await db.fichaje.update({ where: { id }, data: { fondoInicial } });
  return NextResponse.json({ fichaje: actualizado });
}
