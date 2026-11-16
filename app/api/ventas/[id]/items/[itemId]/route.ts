import { NextResponse } from "next/server";
import type { MotivoAnulacionItem } from "@prisma/client";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { resolverDescuento, type PedidoDescuento } from "@/lib/ventas/descuentos";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

const MOTIVOS: MotivoAnulacionItem[] = [
  "PEDIDO_DEL_CLIENTE",
  "DEMORA_EN_COCINA",
  "ERROR",
  "CLIENTE_INSATISFECHO",
  "CAMBIO_DE_PRODUCTO",
  "SIN_STOCK",
  "PRUEBA",
  "OTRO",
];

async function buscar(ventaId: string, itemId: string) {
  return db.itemVenta.findFirst({
    where: { id: itemId, ventaId },
    select: { id: true, enviadoEn: true, anulado: true, venta: { select: { estado: true, localId: true } } },
  });
}

/**
 * Cambiar cantidad o comentario (sólo antes de enviarlo a cocina), el precio
 * (con permiso), o anularlo. Un ítem ya enviado no se borra: se anula con
 * motivo, para que quede constancia de lo que la cocina preparó.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const { id, itemId } = await params;
  const body = await readJsonBody<{
    cantidad?: number;
    comentario?: string | null;
    precio?: number;
    anular?: { motivo?: string; comentario?: string };
    /** Descuento de este renglón: de la lista, libre, o null para quitarlo. */
    descuento?: PedidoDescuento;
  }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const item = await buscar(id, itemId);
  if (!item) return NextResponse.json({ error: "Producto no encontrado en la venta" }, { status: 404 });
  if (!enLocal(ctx, item.venta.localId)) return fueraDeLocal();
  if (item.venta.estado !== "EN_CURSO") return NextResponse.json({ error: "La venta ya está cerrada" }, { status: 409 });
  if (item.anulado) return NextResponse.json({ error: "Ese producto ya está anulado" }, { status: 409 });

  if (body.anular) {
    const motivo = body.anular.motivo as MotivoAnulacionItem;
    if (!MOTIVOS.includes(motivo)) return NextResponse.json({ error: "Elegí el motivo de la anulación" }, { status: 400 });
    if (item.enviadoEn) {
      const p = sinPermiso(ctx, "cancel_additions");
      if (p) return p;
    }
    await db.itemVenta.update({
      where: { id: itemId },
      data: {
        anulado: true,
        motivoAnulacion: motivo,
        comentarioAnulacion: body.anular.comentario?.trim().slice(0, 140) || null,
        anuladoPorId: ctx.empleadoId,
        anuladoEn: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  }

  const data: Record<string, unknown> = {};
  if (body.cantidad !== undefined || body.comentario !== undefined) {
    if (item.enviadoEn) {
      return NextResponse.json({ error: "Ya se envió a cocina: para cambiarlo, anulalo y cargalo de nuevo" }, { status: 409 });
    }
    if (body.cantidad !== undefined) {
      if (!(body.cantidad > 0) || body.cantidad > 999) return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
      data.cantidad = body.cantidad;
    }
    if (body.comentario !== undefined) data.comentario = body.comentario?.trim().slice(0, 140) || null;
  }
  if (body.precio !== undefined) {
    const p = sinPermiso(ctx, "change_addition_price");
    if (p) return p;
    if (!(body.precio >= 0)) return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
    data.precio = body.precio;
  }
  if (body.descuento !== undefined) {
    const r = await resolverDescuento(ctx, item.venta.localId, body.descuento);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    data.descuentoPct = r.ok.pct;
    data.descuentoMonto = r.ok.monto;
    data.descuentoNombre = r.ok.nombre;
  }
  await db.itemVenta.update({ where: { id: itemId }, data });
  return NextResponse.json({ ok: true });
}

/** Sacar un producto que todavía no se envió a cocina: no dejó rastro en la cocina. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const { id, itemId } = await params;
  const item = await buscar(id, itemId);
  if (!item) return NextResponse.json({ error: "Producto no encontrado en la venta" }, { status: 404 });
  if (!enLocal(ctx, item.venta.localId)) return fueraDeLocal();
  if (item.venta.estado !== "EN_CURSO") return NextResponse.json({ error: "La venta ya está cerrada" }, { status: 409 });
  if (item.enviadoEn) return NextResponse.json({ error: "Ya se envió a cocina: hay que anularlo con motivo" }, { status: 409 });
  await db.itemVenta.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
}
