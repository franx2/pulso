import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Un retiro o un ingreso de plata que no es una venta. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_cash_movements");
  if (prohibido) return prohibido;
  const { id } = await params;
  const body = await readJsonBody<{ tipo?: string; monto?: number; motivo?: string }>(request);
  const monto = Number(body?.monto);
  const motivo = body?.motivo?.trim() ?? "";
  if (!(monto > 0)) return NextResponse.json({ error: "El monto tiene que ser mayor a cero" }, { status: 400 });
  if (!motivo) return NextResponse.json({ error: "Escribí el motivo" }, { status: 400 });

  const caja = await db.caja.findUnique({ where: { id }, select: { cerradaEn: true } });
  if (!caja || caja.cerradaEn) return NextResponse.json({ error: "La caja no está abierta" }, { status: 409 });
  await db.movimientoCaja.create({
    data: {
      cajaId: id,
      tipo: body?.tipo === "INGRESO" ? "INGRESO" : "EGRESO",
      monto,
      motivo: motivo.slice(0, 140),
      empleadoId: ctx.empleadoId,
    },
  });
  return NextResponse.json({ ok: true });
}
