import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { choca, primerLugarLibre, tamanoGrilla } from "@/lib/ventas/plano";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso, type ContextoVentas } from "@/lib/ventas/sesion";

async function buscar(ctx: ContextoVentas, id: string) {
  const mesa = await db.mesa.findUnique({
    where: { id },
    select: { id: true, salonId: true, numero: true, fila: true, columna: true, tamano: true, salon: { select: { localId: true } } },
  });
  if (!mesa) return { error: NextResponse.json({ error: "Mesa no encontrada" }, { status: 404 }) };
  if (!enLocal(ctx, mesa.salon.localId)) return { error: fueraDeLocal() };
  return { mesa };
}

/**
 * Mover una mesa, cambiarle el número, la forma o el tamaño, o pasarla a otro
 * salón del mismo local. Nunca puede quedar encima de otra.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_rooms");
  if (prohibido) return prohibido;
  const { id } = await params;
  const r = await buscar(ctx, id);
  if ("error" in r) return r.error;
  const { mesa } = r;

  const body = await readJsonBody<{ fila?: number; columna?: number; numero?: number; forma?: string; tamano?: string; salonId?: string }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const destino = {
    id,
    salonId: body.salonId ?? mesa.salonId,
    fila: body.fila ?? mesa.fila,
    columna: body.columna ?? mesa.columna,
    tamano: (body.tamano === "GRANDE" || body.tamano === "CHICA" ? body.tamano : mesa.tamano) as "CHICA" | "GRANDE",
  };
  if (!Number.isInteger(destino.fila) || !Number.isInteger(destino.columna) || destino.fila < 0 || destino.columna < 0 || destino.fila > 60 || destino.columna > 60) {
    return NextResponse.json({ error: "Posición inválida" }, { status: 400 });
  }
  if (destino.salonId !== mesa.salonId) {
    const salon = await db.salon.findUnique({ where: { id: destino.salonId }, select: { localId: true } });
    if (!salon || salon.localId !== mesa.salon.localId) return NextResponse.json({ error: "Ese salón no es de este local" }, { status: 400 });
  }
  const vecinas = await db.mesa.findMany({ where: { salonId: destino.salonId, activa: true }, select: { id: true, fila: true, columna: true, tamano: true } });
  // Pasada a otro salón sin decir dónde: al primer lugar libre de ese salón.
  if (destino.salonId !== mesa.salonId && body.fila === undefined && body.columna === undefined) {
    Object.assign(destino, primerLugarLibre(vecinas, destino.tamano, Math.max(8, tamanoGrilla(vecinas).columnas)));
  }
  if (choca(vecinas, destino)) return NextResponse.json({ error: "Ahí ya hay otra mesa" }, { status: 409 });

  if (body.numero !== undefined) {
    if (!Number.isInteger(body.numero) || body.numero < 1 || body.numero > 9999) return NextResponse.json({ error: "Número inválido" }, { status: 400 });
    const repetida = await db.mesa.findFirst({ where: { numero: body.numero, id: { not: id }, activa: true, salon: { localId: mesa.salon.localId } }, select: { id: true } });
    if (repetida) return NextResponse.json({ error: `Ya hay una mesa ${body.numero} en el local` }, { status: 409 });
    // El número es único por salón: una mesa dada de baja con ese número le cede el lugar.
    await db.mesa.updateMany({ where: { salonId: destino.salonId, numero: body.numero, activa: false, id: { not: id } }, data: { numero: { increment: 10000 } } });
  }

  await db.mesa.update({
    where: { id },
    data: {
      salonId: destino.salonId,
      fila: destino.fila,
      columna: destino.columna,
      tamano: destino.tamano,
      ...(body.forma === "REDONDA" || body.forma === "CUADRADA" ? { forma: body.forma } : {}),
      ...(body.numero !== undefined ? { numero: body.numero } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

/**
 * Sacar una mesa del plano. Si tuvo ventas se da de baja (el historial la
 * sigue nombrando); si nunca se usó, se borra. Con una venta abierta, no.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_rooms");
  if (prohibido) return prohibido;
  const { id } = await params;
  const r = await buscar(ctx, id);
  if ("error" in r) return r.error;

  const [abierta, usadas] = await Promise.all([
    db.venta.count({ where: { mesaId: id, estado: "EN_CURSO" } }),
    db.venta.count({ where: { mesaId: id } }),
  ]);
  if (abierta) return NextResponse.json({ error: "La mesa tiene una venta abierta: cobrala o cambiala de mesa primero" }, { status: 409 });
  if (usadas) await db.mesa.update({ where: { id }, data: { activa: false } });
  else await db.mesa.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
