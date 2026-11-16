import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/**
 * Abrir una venta: una mesa o un pedido de mostrador. El número es correlativo
 * por local; si dos mozos abren a la vez y chocan, se reintenta con el
 * siguiente. Si la mesa ya tiene una venta en curso, se devuelve esa: tocar
 * una mesa ocupada no puede abrir una segunda cuenta.
 */
export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_additions");
  if (prohibido) return prohibido;

  const body = await readJsonBody<{ localId?: string; tipo?: string; mesaId?: string; comensales?: number; cliente?: string; clienteId?: string; mozoId?: string; comentario?: string }>(request);
  const tipo = body?.tipo === "MESA" ? "MESA" : "MOSTRADOR";
  const local = await db.local.findUnique({ where: { id: body?.localId ?? "" }, select: { id: true } });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 400 });
  if (!enLocal(ctx, local.id)) return fueraDeLocal();

  let mesaId: string | null = null;
  if (tipo === "MESA") {
    const mesa = await db.mesa.findFirst({ where: { id: body?.mesaId ?? "", salon: { localId: local.id } }, select: { id: true } });
    if (!mesa) return NextResponse.json({ error: "Mesa no encontrada" }, { status: 400 });
    mesaId = mesa.id;
    const abierta = await db.venta.findFirst({ where: { mesaId, estado: "EN_CURSO" }, select: { id: true } });
    if (abierta) return NextResponse.json({ id: abierta.id, yaAbierta: true });
  }

  const comensales = Number.isInteger(body?.comensales) && body!.comensales! > 0 ? body!.comensales! : null;
  const comentario = body?.comentario?.trim().slice(0, 300) || null;
  // Un cliente de la libreta trae su nombre y su descuento propio.
  const ficha = body?.clienteId
    ? await db.cliente.findFirst({ where: { id: body.clienteId, localId: local.id, activo: true }, select: { id: true, nombre: true, descuentoPct: true } })
    : null;
  if (body?.clienteId && !ficha) return NextResponse.json({ error: "Ese cliente no es de este local" }, { status: 400 });
  const cliente = ficha?.nombre.slice(0, 60) ?? (body?.cliente?.trim().slice(0, 60) || null);
  let mozoId = tipo === "MESA" ? ctx.empleadoId : null;
  if (body?.mozoId && body.mozoId !== mozoId) {
    const p = sinPermiso(ctx, "assign_waiter");
    if (p) return p;
    mozoId = body.mozoId;
  }

  for (let intento = 0; intento < 5; intento++) {
    const ultimo = await db.venta.findFirst({ where: { localId: local.id }, orderBy: { numero: "desc" }, select: { numero: true } });
    try {
      const venta = await db.venta.create({
        data: {
          localId: local.id,
          numero: (ultimo?.numero ?? 0) + 1,
          tipo,
          mesaId,
          comensales,
          cliente,
          comentario,
          clienteId: ficha?.id ?? null,
          ...(ficha?.descuentoPct ? { descuentoPct: ficha.descuentoPct, descuentoMotivo: `Cliente: ${ficha.nombre}` } : {}),
          abiertaPorId: ctx.empleadoId,
          // Quien abre la mesa queda como mozo, salvo que elija otro.
          mozoId,
        },
        select: { id: true },
      });
      return NextResponse.json({ id: venta.id });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      // Otro abrió la misma mesa en el mismo instante: se usa la suya.
      if (mesaId) {
        const abierta = await db.venta.findFirst({ where: { mesaId, estado: "EN_CURSO" }, select: { id: true } });
        if (abierta) return NextResponse.json({ id: abierta.id, yaAbierta: true });
      }
    }
  }
  return NextResponse.json({ error: "No se pudo abrir la venta, probá de nuevo" }, { status: 409 });
}
