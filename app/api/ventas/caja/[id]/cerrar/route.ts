import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/**
 * Cerrar la caja con lo que se contó. No se puede con ventas en curso: lo que
 * se cobre después tiene que caer en la caja siguiente, no en una cerrada.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_cash_counts");
  if (prohibido) return prohibido;
  const { id } = await params;
  const body = await readJsonBody<{ efectivoContado?: number; comentario?: string }>(request);
  const contado = Number(body?.efectivoContado);
  if (!(contado >= 0)) return NextResponse.json({ error: "Cargá cuánto efectivo contaste" }, { status: 400 });

  const caja = await db.caja.findUnique({ where: { id }, select: { cerradaEn: true, localId: true } });
  if (!caja) return NextResponse.json({ error: "Caja no encontrada" }, { status: 404 });
  if (caja.cerradaEn) return NextResponse.json({ error: "La caja ya está cerrada" }, { status: 409 });
  const enCurso = await db.venta.count({ where: { localId: caja.localId, estado: "EN_CURSO" } });
  if (enCurso > 0) {
    const cuantas = enCurso === 1 ? "1 venta abierta" : enCurso + " ventas abiertas";
    return NextResponse.json({ error: "Hay " + cuantas + ": cobralas o anulalas antes de cerrar la caja" }, { status: 409 });
  }

  await db.caja.update({
    where: { id },
    data: { cerradaEn: new Date(), cerradaPorId: ctx.empleadoId, efectivoContado: contado, comentario: body?.comentario?.trim() || null },
  });
  return NextResponse.json({ ok: true });
}
