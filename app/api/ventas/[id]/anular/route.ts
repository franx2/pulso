import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { anularFacturaDeVenta } from "@/lib/ventas/facturacion";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Anular una venta entera: sale de la caja y deja de sumar, con motivo y autor. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "cancel_sales");
  if (prohibido) return prohibido;
  const { id } = await params;
  const body = await readJsonBody<{ motivo?: string }>(request);
  const motivo = body?.motivo?.trim() ?? "";
  if (!motivo) return NextResponse.json({ error: "Escribí por qué se anula la venta" }, { status: 400 });

  const venta = await db.venta.findUnique({ where: { id }, select: { estado: true } });
  if (!venta) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
  if (venta.estado === "ANULADA") return NextResponse.json({ error: "La venta ya está anulada" }, { status: 409 });

  await db.$transaction([
    db.pagoVenta.updateMany({ where: { ventaId: id }, data: { anulado: true } }),
    db.venta.update({
      where: { id },
      data: { estado: "ANULADA", anuladaPorId: ctx.empleadoId, anuladaEn: new Date(), motivoAnulacion: motivo.slice(0, 200) },
    }),
  ]);
  // Una factura emitida no se borra: se anula con nota de crédito. Si falla queda pendiente y se reintenta.
  await anularFacturaDeVenta(id);
  return NextResponse.json({ ok: true });
}
