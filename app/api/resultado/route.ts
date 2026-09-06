import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fechaSql } from "@/lib/fechaAR";
import { rangoDias } from "@/lib/periodo";
import { requireAdminApi } from "@/lib/session";
import { CONCEPTOS_FIJOS, costoDeVenta, type Comisiones } from "@/lib/compras/impuestos";
import { calcularResultado } from "@/lib/compras/resultado";

/** Junta venta, compras, sueldos y gastos de un período: varias consultas. */
export const maxDuration = 60;

/**
 * El resultado operativo de un local o de la cadena.
 *
 * Las comisiones son por local porque cada sucursal negocia sus contratos, y
 * los costos fijos son por local y por mes. Cuando se mira la cadena entera se
 * suman los resultados de cada una, no se promedia nada: promediar comisiones
 * distintas sobre ventas distintas da un número que no es de nadie.
 */
export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const { desde, hasta, dias, periodo } = rangoDias(params);
  const localId = params.get("localId") ?? "";

  const desdeSql = fechaSql(desde);
  const hastaSql = fechaSql(hasta);
  const meses = mesesEntre(desde, hasta);

  const [locales, resumenes, compras, empleados, fichajes, costosFijos] = await Promise.all([
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
      select: { localId: true, ventas: true, porMedioPago: true },
    }),
    db.compra.findMany({
      where: {
        fecha: { gte: desdeSql, lte: hastaSql },
        ...(localId ? { localId } : { localId: { not: null } }),
      },
      select: { localId: true, tipo: true, subtotal: true },
    }),
    db.empleado.findMany({
      where: { activo: true, ...(localId ? { localId } : {}) },
      select: { id: true, localId: true, precioHora: true },
    }),
    // El costo laboral se toma de las horas ya liquidadas por día, que es lo
    // que `Fichaje` permite reconstruir sin recalcular toda la jornada acá.
    db.fichaje.findMany({
      where: { timestamp: { gte: desdeSql, lte: new Date(hastaSql.getTime() + 86_400_000) } },
      select: { empleadoId: true, localId: true, tipo: true, timestamp: true },
      orderBy: { timestamp: "asc" },
    }),
    db.costoFijo.findMany({
      where: { mes: { in: meses }, ...(localId ? { localId } : {}) },
      select: { localId: true, mes: true, concepto: true, monto: true },
    }),
  ]);

  const porLocal = locales.map((local) => {
    const suyos = resumenes.filter((r) => r.localId === local.id);
    const ventaBruta = suyos.reduce((s, r) => s + r.ventas, 0);

    // Los medios de pago llegan como JSON por día: se acumulan.
    const medios: Record<string, number> = {};
    for (const fila of suyos) {
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

    const susCompras = compras.filter((c) => c.localId === local.id);
    const mercaderiaBruta = susCompras
      .filter((c) => c.tipo === "MERCADERIA")
      .reduce((s, c) => s + c.subtotal, 0);
    const royaltyBruto = susCompras
      .filter((c) => c.tipo === "SERVICIO")
      .reduce((s, c) => s + c.subtotal, 0);

    const susEmpleados = empleados.filter((e) => e.localId === local.id);
    const horasPorEmpleado = horasTrabajadas(fichajes, local.id);
    let costoLaboral = 0;
    let empleadosSinPrecio = 0;
    for (const empleado of susEmpleados) {
      const horas = horasPorEmpleado.get(empleado.id) ?? 0;
      if (horas <= 0) continue;
      if (empleado.precioHora == null) {
        empleadosSinPrecio++;
        continue;
      }
      costoLaboral += horas * empleado.precioHora;
    }

    const susFijos = costosFijos.filter((c) => c.localId === local.id);
    const fijosDelPeriodo = susFijos.reduce((s, c) => s + c.monto, 0);
    // Los conceptos son mensuales; si el período abarca dos meses, faltan los
    // de los dos. Se cuenta contra todos los meses tocados.
    const cargados = new Set(susFijos.map((c) => `${c.mes}|${c.concepto}`));
    const conceptosFijosSinCargar =
      meses.length * CONCEPTOS_FIJOS.length - [...cargados].length;

    return {
      localId: local.id,
      local: local.nombre,
      ...calcularResultado({
        ventaBruta,
        costoDeVenta: costoDeVenta(medios, comisiones),
        mercaderiaBruta,
        royaltyBruto,
        // Los remitos que carga el sistema son "Presupuesto X", un
        // comprobante no fiscal: no dan crédito. Hasta que exista la Factura A
        // cargada, el crédito fiscal de compras es cero y el IVA de esa
        // mercadería es un costo real que ya está adentro de la línea.
        comprasConFactura: 0,
        costoLaboral,
        costosFijos: fijosDelPeriodo,
        hayRemitos: susCompras.length > 0,
        empleadosSinPrecio,
        conceptosFijosSinCargar: Math.max(conceptosFijosSinCargar, 0),
      }),
    };
  });

  return NextResponse.json({
    periodo,
    desde,
    hasta,
    dias,
    meses,
    localId,
    locales: locales.map((l) => ({ id: l.id, nombre: l.nombre })),
    porLocal,
  });
}

/** Los meses "AAAA-MM" que toca un rango de días. */
function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let cursor = desde.slice(0, 7);
  while (cursor <= hasta.slice(0, 7)) {
    meses.push(cursor);
    const [anio, mes] = cursor.split("-").map(Number);
    cursor = mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, "0")}`;
  }
  return meses;
}

/**
 * Horas trabajadas por empleado, de entrada a salida.
 *
 * Una entrada sin salida no suma: un turno abierto todavía no es un costo, y
 * cerrarlo al final del día inventaría horas que nadie trabajó.
 */
function horasTrabajadas(
  fichajes: { empleadoId: string; localId: string; tipo: string; timestamp: Date }[],
  localId: string
): Map<string, number> {
  const horas = new Map<string, number>();
  const abiertos = new Map<string, Date>();
  for (const f of fichajes) {
    if (f.localId !== localId) continue;
    if (f.tipo === "ENTRADA") {
      abiertos.set(f.empleadoId, f.timestamp);
      continue;
    }
    if (f.tipo !== "SALIDA") continue;
    const inicio = abiertos.get(f.empleadoId);
    if (!inicio) continue;
    abiertos.delete(f.empleadoId);
    horas.set(
      f.empleadoId,
      (horas.get(f.empleadoId) ?? 0) + (f.timestamp.getTime() - inicio.getTime()) / 3_600_000
    );
  }
  return horas;
}
