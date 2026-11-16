import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** El cliente paga parte o todo lo que debe en cuenta corriente. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_payments");
  if (prohibido) return prohibido;
  const { id } = await params;
  const cliente = await db.cliente.findUnique({ where: { id }, select: { localId: true } });
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  if (!enLocal(ctx, cliente.localId)) return fueraDeLocal();

  const body = await readJsonBody<{ monto?: number; nota?: string }>(request);
  const monto = Number(body?.monto);
  if (!Number.isFinite(monto) || monto <= 0) return NextResponse.json({ error: "El monto tiene que ser positivo" }, { status: 400 });
  await db.pagoCliente.create({ data: { clienteId: id, monto, nota: body?.nota?.trim().slice(0, 200) || null } });
  return NextResponse.json({ ok: true });
}
