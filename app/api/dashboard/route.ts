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
  descuentosPorCaja: Mapa;
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
  descuentosPorCaja: {},
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
  descuentosPorCaja: unknown;
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
    sumarMapa(a.descuentosPorCaja, f.descuentosPorCaja);
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
  const d = new Date(`${hoyAR()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d;
}

function hoyAR(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const fechaSql = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const diasEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000) + 1;

/**
 * Resuelve qué se compara contra qué.
 *
 * - `mtd`: del 1 del mes hasta hoy, contra los mismos días del mes pasado
 *   (al 4 de septiembre compara 1-4/9 contra 1-4/8). Es la lectura de "cómo
 *   venimos este mes", que no sirve contra el mes cerrado entero.
 * - rango a medida (`desde`/`hasta`): el período previo es la misma cantidad
 *   de días, pegado antes.
 * - presets: ventana móvil terminando hoy.
 */
function resolverRango(params: URLSearchParams) {
  const periodo = params.get("periodo") ?? "semana";
  const desdeParam = params.get("desde");
  const hastaParam = params.get("hasta");

  if (periodo === "mtd") {
    const hoy = hoyAR();
    const [anio, mes, dia] = hoy.split("-").map(Number);
    const inicioActual = fechaSql(`${hoy.slice(0, 8)}01`);
    const finActual = fechaSql(hoy);
    const mesPrevio = mes === 1 ? 12 : mes - 1;
    const anioPrevio = mes === 1 ? anio - 1 : anio;
    const pad = (n: number) => String(n).padStart(2, "0");
    const inicioPrevio = fechaSql(`${anioPrevio}-${pad(mesPrevio)}-01`);
    // El mes pasado puede tener menos días (31/3 vs. febrero): se recorta al
    // último día que exista, en vez de saltar de mes.
    const ultimoDiaMesPrevio = new Date(Date.UTC(anioPrevio, mesPrevio, 0)).getUTCDate();
    const finPrevio = fechaSql(`${anioPrevio}-${pad(mesPrevio)}-${pad(Math.min(dia, ultimoDiaMesPrevio))}`);
    return { periodo, inicioActual, finActual, inicioPrevio, finPrevio, dias: dia };
  }

  if (desdeParam && hastaParam) {
    const inicioActual = fechaSql(desdeParam);
    const finActual = fechaSql(hastaParam);
    const dias = Math.max(diasEntre(inicioActual, finActual), 1);
    const finPrevio = new Date(inicioActual);
    finPrevio.setUTCDate(finPrevio.getUTCDate() - 1);
    const inicioPrevio = new Date(finPrevio);
    inicioPrevio.setUTCDate(inicioPrevio.getUTCDate() - (dias - 1));
    return { periodo: "rango", inicioActual, finActual, inicioPrevio, finPrevio, dias };
  }

  const dias = DIAS_POR_PERIODO[periodo] ?? 7;
  return {
    periodo,
    inicioActual: fechaDesdeHoy(dias - 1),
    finActual: fechaSql(hoyAR()),
    inicioPrevio: fechaDesdeHoy(dias * 2 - 1),
    finPrevio: fechaDesdeHoy(dias),
    dias,
  };
}

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { periodo, inicioActual, finActual, inicioPrevio, finPrevio, dias } = resolverRango(
    new URL(request.url).searchParams
  );

  const [locales, filas, productos] = await Promise.all([
    db.local.findMany({
      select: { id: true, nombre: true, fudoApiKey: true, resumenSincronizadoEn: true },
      orderBy: { nombre: "asc" },
    }),
    db.resumenDiario.findMany({ where: { fecha: { gte: inicioPrevio } }, orderBy: { fecha: "asc" } }),
    db.productoDiario.findMany({
      where: { fecha: { gte: inicioActual, lte: finActual } },
      select: { localId: true, producto: true, cantidad: true, facturacion: true },
    }),
  ]);

  const porLocal = locales.map((l) => {
    const suyas = filas.filter((f) => f.localId === l.id);
    const actual = acumular(suyas.filter((f) => f.fecha >= inicioActual && f.fecha <= finActual));
    const previo = acumular(suyas.filter((f) => f.fecha >= inicioPrevio && f.fecha <= finPrevio));

    // Referencia para alertas: promedio diario de los 30 días previos a la
    // ventana actual, que es contra lo que se juzga "está vendiendo poco".
    const historicas = suyas.filter((f) => f.fecha < inicioActual);
    const promedioDiarioHistorico =
      historicas.length > 0 ? historicas.reduce((s, f) => s + f.ventas, 0) / historicas.length : 0;

    // Comparar contra un período al que le faltan días da un crecimiento
    // inventado (un local con 6 días sin sincronizar mostró "+922%"). Si la
    // base no está completa, no se muestra variación: mejor un guion que un
    // número que nadie puede creer.
    const diasConDatos = suyas.filter((f) => f.fecha >= inicioActual && f.fecha <= finActual).length;
    const diasConDatosPrevio = suyas.filter((f) => f.fecha >= inicioPrevio && f.fecha <= finPrevio).length;
    const baseComparable = diasConDatosPrevio >= Math.max(diasConDatos * 0.8, 1);

    return {
      localId: l.id,
      nombre: l.nombre,
      tieneFudo: Boolean(l.fudoApiKey),
      sincronizadoEn: l.resumenSincronizadoEn?.toISOString() ?? null,
      diasConDatos,
      diasConDatosPrevio,
      baseComparable,
      ventas: actual.ventas,
      ventasPrevio: previo.ventas,
      variacionVentas: baseComparable ? variacion(actual.ventas, previo.ventas) : null,
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
      descuentosPorCaja: actual.descuentosPorCaja,
      topProductos: top(actual.productos, 10),
      promedioDiarioHistorico,
      promedioDiarioActual: actual.ventas / dias,
    };
  });

  const conDatos = porLocal.filter((l) => l.tieneFudo);
  // La variación de la cadena sólo suma locales con base comparable: si a uno
  // le faltan días en el período previo, su "crecimiento" contaminaría el total.
  const comparables = conDatos.filter((l) => l.baseComparable);
  const ventasComparables = comparables.reduce((s, l) => s + l.ventas, 0);
  const ventasComparablesPrevio = comparables.reduce((s, l) => s + l.ventasPrevio, 0);
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
    rango: { desde: inicioActual.toISOString().slice(0, 10), hasta: finActual.toISOString().slice(0, 10) },
    rangoPrevio: { desde: inicioPrevio.toISOString().slice(0, 10), hasta: finPrevio.toISOString().slice(0, 10) },
    cadena: {
      ...cadena,
      variacionVentas: variacion(ventasComparables, ventasComparablesPrevio),
      localesSinBase: conDatos.filter((l) => !l.baseComparable).map((l) => l.nombre),
      ticketPromedio: cadena.tickets > 0 ? cadena.ventas / cadena.tickets : 0,
      resultado: cadena.ventas - cadena.costo - cadena.gastos,
    },
    locales: porLocal,
    alertas: [...armarAlertas(porLocal, dias), ...alertasDePrecio(productos, locales)],
  });
}

type LocalCalculado = {
  nombre: string;
  tieneFudo: boolean;
  diasConDatos: number;
  baseComparable: boolean;
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

    if (!l.baseComparable && l.diasConDatos > 0) {
      alertas.push({
        tono: "amber",
        texto: `${l.nombre}: al período anterior le faltan días sincronizados, no se puede comparar el crecimiento`,
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

/** Un mismo producto cobrado muy distinto según la sucursal casi siempre es
 * una lista de precios desactualizada, no una decisión comercial. Se avisan
 * sólo los tres peores: la lista completa vive en el panel de productos. */
const DIF_PRECIO_ALERTA = 25;

function alertasDePrecio(
  productos: { localId: string; producto: string; cantidad: number; facturacion: number }[],
  locales: { id: string; nombre: string }[]
): { tono: "rose" | "amber"; texto: string }[] {
  const nombreLocal = new Map(locales.map((l) => [l.id, l.nombre]));
  const porProducto = new Map<string, { nombre: string; porLocal: Map<string, { c: number; f: number }> }>();

  for (const p of productos) {
    const clave = p.producto.trim().toUpperCase();
    const acc = porProducto.get(clave) ?? { nombre: p.producto, porLocal: new Map() };
    const l = acc.porLocal.get(p.localId) ?? { c: 0, f: 0 };
    l.c += p.cantidad;
    l.f += p.facturacion;
    acc.porLocal.set(p.localId, l);
    porProducto.set(clave, acc);
  }

  return [...porProducto.values()]
    .filter((p) => p.porLocal.size >= 2)
    .map((p) => {
      const precios = [...p.porLocal.entries()]
        .map(([id, v]) => ({ local: nombreLocal.get(id) ?? "—", precio: v.c > 0 ? v.f / v.c : 0 }))
        .filter((x) => x.precio > 0);
      // Un producto puede quedarse sin precios válidos (cantidad 0, o
      // facturación 0 por estar 100% bonificado): sin esta guarda, el reduce
      // sobre un array vacío tira y se cae toda la respuesta del dashboard.
      if (precios.length < 2) return null;
      const caro = precios.reduce((a, b) => (b.precio > a.precio ? b : a));
      const barato = precios.reduce((a, b) => (b.precio < a.precio ? b : a));
      return { nombre: p.nombre, caro, barato, dif: ((caro.precio - barato.precio) / barato.precio) * 100 };
    })
    .filter((p): p is { nombre: string; caro: { local: string; precio: number }; barato: { local: string; precio: number }; dif: number } => p !== null)
    .filter((p) => p.dif >= DIF_PRECIO_ALERTA)
    .sort((a, b) => b.dif - a.dif)
    .slice(0, 3)
    .map((p) => ({
      tono: "amber" as const,
      texto: `"${p.nombre}" se cobra ${p.dif.toFixed(0)}% más caro en ${p.caro.local} ($${Math.round(
        p.caro.precio
      ).toLocaleString("es-AR")}) que en ${p.barato.local} ($${Math.round(p.barato.precio).toLocaleString("es-AR")})`,
    }));
}
