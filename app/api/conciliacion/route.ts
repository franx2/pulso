import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diaDeFechaSql, fechaSql } from "@/lib/fechaAR";
import { rangoDias } from "@/lib/periodo";
import { requireAdminApi } from "@/lib/session";
import { ingresosBrutos, posicionIVA, type Comisiones } from "@/lib/compras/impuestos";
import { conciliar } from "@/lib/compras/conciliacion";

/**
 * Conciliación bancaria e impuestos del período, por local.
 *
 * Junta lo que Fudo dice que se cobró (`ResumenDiario.porMedioPago`) con lo
 * que entró al banco (`MovimientoBancario`, cargado a mano desde el CSV) y
 * de paso muestra IIBB e IVA del mismo período, porque son la otra mitad de
 * la misma pregunta: cuánto se cobró de verdad y cuánto corresponde declarar.
 */
export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const { desde, hasta, dias, periodo } = rangoDias(params);
  const localId = params.get("localId") ?? "";

  const desdeSql = fechaSql(desde);
  const hastaSql = fechaSql(hasta);

  const [locales, resumenes, movimientos] = await Promise.all([
    db.local.findMany({
      where: localId ? { id: localId } : {},
      select: {
        id: true,
        nombre: true,
        comisionCredito: true,
        comisionDebito: true,
        comisionBilletera: true,
        comisionDelivery: true,
      },
      orderBy: { nombre: "asc" },
    }),
    db.resumenDiario.findMany({
      where: { fecha: { gte: desdeSql, lte: hastaSql }, ...(localId ? { localId } : {}) },
      select: { localId: true, porMedioPago: true },
    }),
    db.movimientoBancario.findMany({
      where: { fecha: { gte: desdeSql, lte: hastaSql }, ...(localId ? { localId } : {}) },
      select: {
        id: true,
        localId: true,
        fecha: true,
        descripcion: true,
        referencia: true,
        categoria: true,
        credito: true,
        debito: true,
        saldo: true,
      },
      orderBy: { fecha: "asc" },
    }),
  ]);

  const porLocal = locales.map((local) => {
    const medios: Record<string, number> = {};
    for (const fila of resumenes.filter((r) => r.localId === local.id)) {
      const mapa = (fila.porMedioPago ?? {}) as Record<string, unknown>;
      for (const [medio, monto] of Object.entries(mapa)) {
        if (typeof monto !== "number") continue;
        medios[medio] = (medios[medio] ?? 0) + monto;
      }
    }

    const comisiones: Comisiones = {
      credito: local.comisionCredito,
      debito: local.comisionDebito,
      billetera: local.comisionBilletera,
      delivery: local.comisionDelivery,
    };

    const susMovimientos = movimientos.filter((m) => m.localId === local.id);
    const conciliacion = conciliar(
      medios,
      comisiones,
      susMovimientos.map((m) => ({ categoria: m.categoria, credito: m.credito }))
    );

    return {
      localId: local.id,
      local: local.nombre,
      conciliacion,
      // Sin Factura A el crédito fiscal de compras es cero, igual que en
      // Resultado: los remitos del proveedor son "Presupuesto X", no dan
      // crédito.
      iibb: ingresosBrutos(conciliacion.ventaTotal, conciliacion.ventaNoEfectivo),
      iva: posicionIVA(conciliacion.ventaTotal, 0),
      movimientos: susMovimientos.map((m) => ({
        id: m.id,
        fecha: diaDeFechaSql(m.fecha),
        descripcion: m.descripcion,
        referencia: m.referencia,
        categoria: m.categoria,
        credito: m.credito,
        debito: m.debito,
        saldo: m.saldo,
      })),
    };
  });

  return NextResponse.json({
    periodo,
    desde,
    hasta,
    dias,
    locales: locales.map((l) => ({ id: l.id, nombre: l.nombre })),
    porLocal,
  });
}
