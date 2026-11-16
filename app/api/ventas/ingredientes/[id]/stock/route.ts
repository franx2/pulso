import { NextResponse } from "next/server";
import type { TipoMovimientoStock } from "@prisma/client";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

const TIPOS: TipoMovimientoStock[] = ["CONTEO", "INGRESO", "EGRESO"];

/** Los últimos movimientos manuales de un ingrediente. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const { id } = await params;
  const movimientos = await db.movimientoStock.findMany({
    where: { ingredienteId: id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, tipo: true, cantidad: true, motivo: true, autor: true, createdAt: true },
  });
  return NextResponse.json({ movimientos: movimientos.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) });
}

/**
 * Un conteo (fija el stock en lo contado), un ingreso o un egreso. Lo que
 * consumen las ventas no pasa por acá: se calcula de las recetas.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "update_stock");
  if (prohibido) return prohibido;
  const { id } = await params;
  const body = await readJsonBody<{ tipo?: string; cantidad?: number; motivo?: string }>(request);
  const tipo = body?.tipo as TipoMovimientoStock;
  const cantidad = Number(body?.cantidad);
  if (!TIPOS.includes(tipo)) return NextResponse.json({ error: "Tipo de movimiento inválido" }, { status: 400 });
  if (!(cantidad >= 0) || (tipo !== "CONTEO" && cantidad === 0)) {
    return NextResponse.json({ error: tipo === "CONTEO" ? "Cargá lo que contaste" : "La cantidad tiene que ser mayor a cero" }, { status: 400 });
  }
  if (tipo === "EGRESO" && !body?.motivo?.trim()) return NextResponse.json({ error: "Escribí el motivo del egreso" }, { status: 400 });

  const ing = await db.ingrediente.findUnique({ where: { id }, select: { id: true, localId: true } });
  if (!ing) return NextResponse.json({ error: "Ingrediente no encontrado" }, { status: 404 });
  if (!enLocal(ctx, ing.localId)) return fueraDeLocal();
  await db.movimientoStock.create({
    data: { ingredienteId: id, tipo, cantidad, motivo: body?.motivo?.trim().slice(0, 140) || null, autor: ctx.session.nombre ?? "—" },
  });
  return NextResponse.json({ ok: true });
}
