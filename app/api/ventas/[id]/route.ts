import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { ventaCompleta } from "@/lib/ventas/consultas";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const { id } = await params;
  const venta = await ventaCompleta(id);
  if (!venta) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });

  // Para cambiar de mozo o de mesa sin otra consulta.
  const [mozos, mesasLibres] = await Promise.all([
    db.empleado.findMany({
      where: { activo: true, OR: [{ localId: venta.local.id }, { asignaciones: { some: { localId: venta.local.id } } }] },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    }),
    db.mesa.findMany({
      where: { activa: true, salon: { localId: venta.local.id }, ventas: { none: { estado: "EN_CURSO" } } },
      select: { id: true, numero: true, salon: { select: { nombre: true } } },
      orderBy: [{ salon: { orden: "asc" } }, { numero: "asc" }],
    }),
  ]);

  return NextResponse.json({
    venta,
    mozos,
    mesasLibres: mesasLibres.map((m) => ({ id: m.id, numero: m.numero, salon: m.salon.nombre })),
    permisos: ctx.permisos,
  });
}

/** Datos de la venta: comensales, cliente, comentario, mozo, mesa y descuento. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const { id } = await params;
  const body = await readJsonBody<{
    comensales?: number | null;
    cliente?: string | null;
    comentario?: string | null;
    mozoId?: string | null;
    mesaId?: string;
    descuentoPct?: number | null;
    descuentoMonto?: number | null;
    descuentoMotivo?: string | null;
  }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const venta = await db.venta.findUnique({ where: { id }, select: { estado: true, localId: true } });
  if (!venta) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
  if (venta.estado !== "EN_CURSO") return NextResponse.json({ error: "La venta ya está cerrada" }, { status: 409 });

  const data: Record<string, unknown> = {};
  if (body.comensales !== undefined) data.comensales = body.comensales && body.comensales > 0 ? Math.round(body.comensales) : null;
  if (body.cliente !== undefined) data.cliente = body.cliente?.trim().slice(0, 60) || null;
  if (body.comentario !== undefined) data.comentario = body.comentario?.trim().slice(0, 300) || null;

  if (body.mozoId !== undefined) {
    const p = sinPermiso(ctx, "assign_waiter");
    if (p) return p;
    data.mozoId = body.mozoId || null;
  }
  if (body.mesaId !== undefined) {
    const p = sinPermiso(ctx, "move_additions");
    if (p) return p;
    const mesa = await db.mesa.findFirst({
      where: { id: body.mesaId, salon: { localId: venta.localId }, ventas: { none: { estado: "EN_CURSO" } } },
      select: { id: true },
    });
    if (!mesa) return NextResponse.json({ error: "Esa mesa no existe o ya está ocupada" }, { status: 409 });
    data.mesaId = mesa.id;
    data.tipo = "MESA";
  }
  if (body.descuentoPct !== undefined || body.descuentoMonto !== undefined) {
    const p = sinPermiso(ctx, "create_discounts");
    if (p) return p;
    const pct = body.descuentoPct ?? null;
    const monto = body.descuentoMonto ?? 0;
    if ((pct != null && (pct < 0 || pct > 100)) || monto < 0) {
      return NextResponse.json({ error: "El descuento tiene que ser entre 0 y 100%, o un monto positivo" }, { status: 400 });
    }
    data.descuentoPct = pct && pct > 0 ? pct : null;
    data.descuentoMonto = pct && pct > 0 ? 0 : monto;
    data.descuentoMotivo = body.descuentoMotivo?.trim() || null;
  }

  await db.venta.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
