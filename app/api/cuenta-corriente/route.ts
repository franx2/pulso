import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diaDeFechaSql } from "@/lib/fechaAR";
import { requireAdminApi } from "@/lib/session";
import { calcularCuentaCorriente } from "@/lib/compras/cuentaCorriente";

/**
 * Cuenta corriente con la fábrica, por local.
 *
 * Se devuelven las cuatro sucursales siempre —el volumen de remitos y pagos
 * de este negocio es chico— para que la pantalla pueda mostrar el total de
 * cadena y el detalle de una sucursal sin dos consultas separadas.
 */
export async function GET() {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const locales = await db.local.findMany({
    select: { id: true, nombre: true, saldoInicialProveedor: true, saldoInicialProveedorFecha: true },
    orderBy: { nombre: "asc" },
  });

  const [remitos, pagos] = await Promise.all([
    // Sólo mercadería y servicio con local asignado: un remito sin asignar
    // todavía no es deuda de nadie en particular.
    db.compra.findMany({
      where: { localId: { not: null } },
      select: { id: true, localId: true, fecha: true, numero: true, total: true, tipo: true },
      orderBy: { fecha: "asc" },
    }),
    db.pagoProveedor.findMany({
      select: { id: true, localId: true, fecha: true, monto: true, medio: true, nota: true },
      orderBy: { fecha: "asc" },
    }),
  ]);

  const porLocal = locales.map((local) => {
    const cuenta = calcularCuentaCorriente({
      saldoInicial: local.saldoInicialProveedor,
      fechaInicial: local.saldoInicialProveedorFecha ? diaDeFechaSql(local.saldoInicialProveedorFecha) : null,
      remitos: remitos
        .filter((r) => r.localId === local.id)
        .map((r) => ({ id: r.id, fecha: diaDeFechaSql(r.fecha), numero: r.numero, total: r.total, tipo: r.tipo })),
      pagos: pagos
        .filter((p) => p.localId === local.id)
        .map((p) => ({ id: p.id, fecha: diaDeFechaSql(p.fecha), monto: p.monto, medio: p.medio, nota: p.nota })),
    });
    return { localId: local.id, local: local.nombre, ...cuenta };
  });

  return NextResponse.json({
    locales: locales.map((l) => ({ id: l.id, nombre: l.nombre })),
    porLocal,
    saldoCadena: porLocal.reduce((s, l) => s + l.saldo, 0),
  });
}
