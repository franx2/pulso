import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fechaSql } from "@/lib/fechaAR";
import { requireAdminApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

/** Cargar un pago a la fábrica, a mano. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody<{ fecha?: string; monto?: number; medio?: string; nota?: string }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha ?? "")) {
    return NextResponse.json({ error: "Fecha inválida, se espera AAAA-MM-DD" }, { status: 400 });
  }
  if (typeof body.monto !== "number" || !Number.isFinite(body.monto) || body.monto <= 0) {
    return NextResponse.json({ error: "El monto tiene que ser mayor a cero" }, { status: 400 });
  }

  const local = await db.local.findUnique({ where: { id }, select: { id: true } });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });

  const pago = await db.pagoProveedor.create({
    data: {
      localId: id,
      fecha: fechaSql(body.fecha!),
      monto: body.monto,
      medio: body.medio?.trim() || null,
      nota: body.nota?.trim() || null,
    },
  });

  return NextResponse.json({ pago });
}
