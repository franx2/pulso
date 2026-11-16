import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { totalesDeVenta } from "@/lib/ventas/calculos";
import { datosDeCliente, saldosDeClientes } from "@/lib/ventas/clientes";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso, type ContextoVentas } from "@/lib/ventas/sesion";

async function buscar(ctx: ContextoVentas, id: string) {
  const c = await db.cliente.findUnique({ where: { id }, select: { localId: true } });
  if (!c) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  if (!enLocal(ctx, c.localId)) return fueraDeLocal();
  return null;
}

/** La ficha: datos, saldo, sus últimas ventas y los pagos a cuenta. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const { id } = await params;
  const error = await buscar(ctx, id);
  if (error) return error;

  const [cliente, ventas, pagos, saldos] = await Promise.all([
    db.cliente.findUnique({ where: { id } }),
    db.venta.findMany({
      where: { clienteId: id, estado: { not: "ANULADA" } },
      orderBy: { abiertaEn: "desc" },
      take: 30,
      select: {
        id: true,
        numero: true,
        estado: true,
        abiertaEn: true,
        total: true,
        descuentoPct: true,
        descuentoMonto: true,
        items: { select: { precio: true, cantidad: true, anulado: true, descuentoPct: true, descuentoMonto: true } },
        pagos: { where: { anulado: false }, select: { monto: true, medioPago: { select: { nombre: true, tipo: true } } } },
      },
    }),
    db.pagoCliente.findMany({ where: { clienteId: id }, orderBy: { creadoEn: "desc" }, take: 30 }),
    saldosDeClientes([id]),
  ]);
  return NextResponse.json({
    cliente: { ...cliente, saldo: saldos.get(id) ?? 0 },
    ventas: ventas.map((v) => ({
      id: v.id,
      numero: v.numero,
      estado: v.estado,
      abiertaEn: v.abiertaEn.toISOString(),
      total: v.total ?? totalesDeVenta(v.items, { pct: v.descuentoPct, monto: v.descuentoMonto }).total,
      aCuenta: v.pagos.filter((p) => p.medioPago.tipo === "CUENTA_CORRIENTE").reduce((s, p) => s + p.monto, 0),
    })),
    pagos: pagos.map((p) => ({ id: p.id, monto: p.monto, nota: p.nota, creadoEn: p.creadoEn.toISOString() })),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_additions");
  if (prohibido) return prohibido;
  const { id } = await params;
  const error = await buscar(ctx, id);
  if (error) return error;
  const r = datosDeCliente(await readJsonBody<Record<string, unknown>>(request), true);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await db.cliente.update({ where: { id }, data: r.ok });
  return NextResponse.json({ ok: true });
}

/** Sacarlo de la libreta. Sus ventas lo siguen nombrando. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_additions");
  if (prohibido) return prohibido;
  const { id } = await params;
  const error = await buscar(ctx, id);
  if (error) return error;
  const saldo = (await saldosDeClientes([id])).get(id) ?? 0;
  if (saldo > 0.5) return NextResponse.json({ error: "Tiene saldo en cuenta corriente: registrá el pago antes de darlo de baja" }, { status: 409 });
  await db.cliente.update({ where: { id }, data: { activo: false } });
  return NextResponse.json({ ok: true });
}
