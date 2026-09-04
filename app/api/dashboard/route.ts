import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";

/** Ventanas móviles, no meses calendario: así el período anterior siempre
 * tiene la misma cantidad de días y la comparación es pareja. */
const DIAS_POR_PERIODO: Record<string, number> = { hoy: 1, semana: 7, mes: 30, anio: 365 };

type Mapa = Record<string, number>;

type Acumulado = {
  ventas: number;
  tickets: number;
  personas: number;
  descuentos: number;
  anulaciones: number;
  gastos: number;
  costo: number;
  costoIncompleto: boolean;
  porMedioPago: Mapa;
  porCanal: Mapa;
  porCategoria: Mapa;
  productos: Mapa;
};

const vacio = (): Acumulado => ({
  ventas: 0,
  tickets: 0,
  personas: 0,
  descuentos: 0,
  anulaciones: 0,
  gastos: 0,
  costo: 0,
  costoIncompleto: false,
  porMedioPago: {},
  porCanal: {},
  porCategoria: {},
  productos: {},
});

function sumarMapa(destino: Mapa, origen: unknown) {
  if (!origen || typeof origen !== "object") return;
  for (const [k, v] of Object.entries(origen as Record<string, unknown>)) {
    if (typeof v === "number") destino[k] = (destino[k] ?? 0) + v;
  }
}

type FilaDb = {
  ventas: number;
  tickets: number;
  personas: number;
  descuentos: number;
  anulaciones: number;
  gastos: number;
  costo: number;
  costoIncompleto: boolean;
  porMedioPago: unknown;
  porCanal: unknown;
  porCategoria: unknown;
  topProductos: unknown;
};

function acumular(filas: FilaDb[]): Acumulado {
  const a = vacio();
  for (const f of filas) {
    a.ventas += f.ventas;
    a.tickets += f.tickets;
    a.personas += f.personas;
    a.descuentos += f.descuentos;
    a.anulaciones += f.anulaciones;
    a.gastos += f.gastos;
    a.costo += f.costo;
    if (f.costoIncompleto) a.costoIncompleto = true;
    sumarMapa(a.porMedioPago, f.porMedioPago);
    sumarMapa(a.porCanal, f.porCanal);
    sumarMapa(a.porCategoria, f.porCategoria);
    // Los top diarios se suman por nombre: no es el ranking exacto del
    // período (un producto que nunca entró al top 20 de ningún día queda
    // afuera), pero para "qué se vende" alcanza y evita guardar todo.
    for (const p of (Array.isArray(f.topProductos) ? f.topProductos : []) as {
      nombre?: string;
      facturacion?: number;
    }[]) {
      if (typeof p?.nombre === "string" && typeof p.facturacion === "number") {
        a.productos[p.nombre] = (a.productos[p.nombre] ?? 0) + p.facturacion;
      }
    }
  }
  return a;
}

const variacion = (actual: number, previo: number): number | null =>
  previo > 0 ? ((actual - previo) / previo) * 100 : null;

const top = (m: Mapa, n: number) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([nombre, valor]) => ({ nombre, valor }));

/** Medianoche argentina de hace `dias` días, en el formato `@db.Date`. */
function fechaDesdeHoy(dias: number): Date {
  const ahoraAR = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hoy = ahoraAR.toISOString().slice(0, 10);
  const d = new Date(`${hoy}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d;
}

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const periodo = new URL(request.url).searchParams.get("periodo") ?? "semana";
  const dias = DIAS_POR_PERIODO[periodo] ?? 7;

  const inicioActual = fechaDesdeHoy(dias - 1);
  const inicioPrevio = fechaDesdeHoy(dias * 2 - 1);
  const finPrevio = fechaDesdeHoy(dias);

  const [locales, filas] = await Promise.all([
    db.local.findMany({
      select: { id: true, nombre: true, fudoApiKey: true, resumenSincronizadoEn: true },
      orderBy: { nombre: "asc" },
    }),
    db.resumenDiario.findMany({ where: { fecha: { gte: inicioPrevio } }, orderBy: { fecha: "asc" } }),
  ]);

  const porLocal = locales.map((l) => {
    const suyas = filas.filter((f) => f.localId === l.id);
    const actual = acumular(suyas.filter((f) => f.fecha >= inicioActual));
    const previo = acumular(suyas.filter((f) => f.fecha >= inicioPrevio && f.fecha <= finPrevio));

    // Referencia para alertas: promedio diario de los 30 días previos a la
    // ventana actual, que es contra lo que se juzga "está vendiendo poco".
    const historicas = suyas.filter((f) => f.fecha < inicioActual);
    const promedioDiarioHistorico =
      historicas.length > 0 ? historicas.reduce((s, f) => s + f.ventas, 0) / historicas.length : 0;

    return {
      localId: l.id,
      nombre: l.nombre,
      tieneFudo: Boolean(l.fudoApiKey),
      sincronizadoEn: l.resumenSincronizadoEn?.toISOString() ?? null,
      diasConDatos: suyas.filter((f) => f.fecha >= inicioActual).length,
      ventas: actual.ventas,
      ventasPrevio: previo.ventas,
      variacionVentas: variacion(actual.ventas, previo.ventas),
      tickets: actual.tickets,
      ticketPromedio: actual.tickets > 0 ? actual.ventas / actual.tickets : 0,
      ticketPromedioPrevio: previo.tickets > 0 ? previo.ventas / previo.tickets : 0,
      personas: actual.personas,
      descuentos: actual.descuentos,
      porcentajeDescuentos: actual.ventas > 0 ? (actual.descuentos / actual.ventas) * 100 : 0,
      anulaciones: actual.anulaciones,
      gastos: actual.gastos,
      costo: actual.costo,
      costoIncompleto: actual.costoIncompleto,
      foodCost: actual.ventas > 0 ? (actual.costo / actual.ventas) * 100 : 0,
      resultado: actual.ventas - actual.costo - actual.gastos,
      porMedioPago: actual.porMedioPago,
      porCanal: actual.porCanal,
      porCategoria: actual.porCategoria,
      topProductos: top(actual.productos, 10),
      promedioDiarioHistorico,
      promedioDiarioActual: actual.ventas / dias,
    };
  });

  const conDatos = porLocal.filter((l) => l.tieneFudo);
  const cadena = {
    ventas: conDatos.reduce((s, l) => s + l.ventas, 0),
    ventasPrevio: conDatos.reduce((s, l) => s + l.ventasPrevio, 0),
    tickets: conDatos.reduce((s, l) => s + l.tickets, 0),
    descuentos: conDatos.reduce((s, l) => s + l.descuentos, 0),
    anulaciones: conDatos.reduce((s, l) => s + l.anulaciones, 0),
    gastos: conDatos.reduce((s, l) => s + l.gastos, 0),
    costo: conDatos.reduce((s, l) => s + l.costo, 0),
    localesSinFudo: porLocal.filter((l) => !l.tieneFudo).map((l) => l.nombre),
  };

  return NextResponse.json({
    periodo,
    dias,
    cadena: {
      ...cadena,
      variacionVentas: variacion(cadena.ventas, cadena.ventasPrevio),
      ticketPromedio: cadena.tickets > 0 ? cadena.ventas / cadena.tickets : 0,
      resultado: cadena.ventas - cadena.costo - cadena.gastos,
    },
    locales: porLocal,
    alertas: armarAlertas(porLocal, dias),
  });
}

type LocalCalculado = {
  nombre: string;
  tieneFudo: boolean;
  diasConDatos: number;
  ventas: number;
  porcentajeDescuentos: number;
  anulaciones: number;
  foodCost: number;
  costoIncompleto: boolean;
  promedioDiarioActual: number;
  promedioDiarioHistorico: number;
};

/** Umbrales pensados para que el dueño mire pocas alertas y todas signifiquen
 * algo: mejor callar una caída de 6% que gritar por ruido diario. */
const CAIDA_VENTAS = -15;
const DESCUENTOS_ALTOS = 5;
const FOOD_COST_ALTO = 40;

function armarAlertas(locales: LocalCalculado[], dias: number) {
  const alertas: { tono: "rose" | "amber"; texto: string }[] = [];

  for (const l of locales) {
    if (!l.tieneFudo) continue;

    if (l.promedioDiarioHistorico > 0 && l.promedioDiarioActual > 0) {
      const vsHistorico = ((l.promedioDiarioActual - l.promedioDiarioHistorico) / l.promedioDiarioHistorico) * 100;
      if (vsHistorico <= CAIDA_VENTAS) {
        alertas.push({
          tono: "rose",
          texto: `${l.nombre} vende ${Math.abs(vsHistorico).toFixed(0)}% menos que su promedio`,
        });
      }
    }

    if (l.porcentajeDescuentos >= DESCUENTOS_ALTOS) {
      alertas.push({
        tono: "amber",
        texto: `${l.nombre} tiene descuentos altos: ${l.porcentajeDescuentos.toFixed(1)}% de la facturación`,
      });
    }

    if (l.anulaciones > 0 && l.ventas > 0 && (l.anulaciones / l.ventas) * 100 >= DESCUENTOS_ALTOS) {
      alertas.push({
        tono: "amber",
        texto: `${l.nombre} anuló ${((l.anulaciones / l.ventas) * 100).toFixed(1)}% de lo que facturó`,
      });
    }

    if (!l.costoIncompleto && l.foodCost >= FOOD_COST_ALTO) {
      alertas.push({
        tono: "amber",
        texto: `${l.nombre} tiene food cost de ${l.foodCost.toFixed(0)}%, por encima del 40%`,
      });
    }

    if (l.diasConDatos === 0) {
      alertas.push({ tono: "amber", texto: `${l.nombre} no tiene datos sincronizados en el período` });
    } else if (l.diasConDatos < dias && dias > 1) {
      alertas.push({
        tono: "amber",
        texto: `${l.nombre} tiene datos de ${l.diasConDatos} de ${dias} días: sincronizá para completar`,
      });
    }
  }

  return alertas;
}
