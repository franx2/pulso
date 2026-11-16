import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { saldoDeVenta, totalesDeVenta } from "@/lib/ventas/calculos";
import { cajaAbierta } from "@/lib/ventas/consultas";
import { facturarVenta, reintentarPendientes, validarReceptor } from "@/lib/ventas/facturacion";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

type PagoPedido = { medioPagoId?: string; monto?: number; propina?: number };

/**
 * Cobrar: uno o varios pagos y, si cubren el total, cerrar la venta.
 *
 * Hace falta una caja abierta: cada cobro queda en la caja del turno, que es
 * lo que se cuenta al cerrar. Si con efectivo pagaron de más, lo que se guarda
 * es lo que quedó en el cajón (lo entregado menos el vuelto): si no, el
 * esperado de la caja daría plata que se devolvió.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_payments");
  if (prohibido) return prohibido;

  const { id } = await params;
  const body = await readJsonBody<{ pagos?: PagoPedido[]; cerrar?: boolean; facturaA?: unknown }>(request);
  const receptor = validarReceptor(body?.facturaA);
  if (typeof receptor === "string") return NextResponse.json({ error: receptor }, { status: 400 });
  const pedidos = (body?.pagos ?? []).filter((p) => Number(p.monto) > 0 || Number(p.propina) > 0);
  if (pedidos.some((p) => Number(p.monto) < 0 || Number(p.propina ?? 0) < 0)) {
    return NextResponse.json({ error: "Los montos no pueden ser negativos" }, { status: 400 });
  }
  if (pedidos.some((p) => Number(p.propina) > 0)) {
    const p = sinPermiso(ctx, "create_tips");
    if (p) return p;
  }
  if (body?.cerrar) {
    const p = sinPermiso(ctx, "close_sales");
    if (p) return p;
  }

  const venta = await db.venta.findUnique({
    where: { id },
    select: {
      estado: true,
      localId: true,
      descuentoPct: true,
      descuentoMonto: true,
      items: { select: { precio: true, cantidad: true, anulado: true } },
      pagos: { select: { monto: true, propina: true, anulado: true } },
    },
  });
  if (!venta) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
  if (venta.estado !== "EN_CURSO") return NextResponse.json({ error: "La venta ya está cerrada" }, { status: 409 });

  const caja = await cajaAbierta(venta.localId);
  if (!caja) return NextResponse.json({ error: "No hay una caja abierta. Abrila desde Caja antes de cobrar." }, { status: 409 });

  const medios = await db.medioPago.findMany({
    where: { localId: venta.localId, activo: true, id: { in: pedidos.map((p) => p.medioPagoId ?? "") } },
    select: { id: true, tipo: true },
  });
  const tipoDe = new Map(medios.map((m) => [m.id, m.tipo]));
  if (pedidos.some((p) => !tipoDe.has(p.medioPagoId ?? ""))) {
    return NextResponse.json({ error: "Elegí un medio de pago válido para cada pago" }, { status: 400 });
  }

  const { total } = totalesDeVenta(venta.items, { pct: venta.descuentoPct, monto: venta.descuentoMonto });
  const nuevos = pedidos.map((p) => ({ medioPagoId: p.medioPagoId!, monto: Number(p.monto ?? 0), propina: Number(p.propina ?? 0) }));
  const saldo = saldoDeVenta(total, [...venta.pagos, ...nuevos.map((n) => ({ ...n, anulado: false }))]);

  // El vuelto sale del efectivo; con tarjeta o transferencia no hay vuelto.
  let vuelto = saldo.vuelto;
  if (vuelto > 0) {
    for (const n of [...nuevos].reverse()) {
      if (tipoDe.get(n.medioPagoId) !== "EFECTIVO" || vuelto <= 0) continue;
      const baja = Math.min(n.monto, vuelto);
      n.monto -= baja;
      vuelto -= baja;
    }
    if (vuelto > 0.009) {
      return NextResponse.json({ error: "Se está cobrando de más con un medio que no es efectivo: no puede haber vuelto" }, { status: 400 });
    }
  }

  if (body?.cerrar && saldo.falta > 0.009) {
    return NextResponse.json({ error: `Falta cobrar $${Math.round(saldo.falta).toLocaleString("es-AR")} para cerrar la venta` }, { status: 400 });
  }

  await db.$transaction([
    ...nuevos
      .filter((n) => n.monto > 0 || n.propina > 0)
      .map((n) => db.pagoVenta.create({ data: { ventaId: id, ...n, cajaId: caja.id, cobradoPorId: ctx.empleadoId } })),
    ...(body?.cerrar
      ? [
          db.venta.update({
            where: { id },
            data: { estado: "CERRADA", total, cerradaPorId: ctx.empleadoId, cerradaEn: new Date(), cajaId: caja.id },
          }),
        ]
      : []),
  ]);

  // La factura sale después de cerrar: si ARCA falla, la venta ya está cerrada y el comprobante queda pendiente.
  const factura = body?.cerrar ? await facturarVenta(id, receptor) : null;
  if (body?.cerrar) after(() => reintentarPendientes(venta.localId));

  return NextResponse.json({
    ok: true,
    vuelto: saldo.vuelto,
    cerrada: Boolean(body?.cerrar),
    factura: factura && { cae: factura.cae, numero: factura.numero, error: factura.error },
  });
}
