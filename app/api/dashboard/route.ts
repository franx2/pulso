import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diaDeFechaSql } from "@/lib/fechaAR";
import { resolverRango } from "@/lib/periodo";
import { requireAdminApi } from "@/lib/session";

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

type FilaSerie = { localId: string; fecha: Date; ventas: number; tickets: number };

function construirSerie(filas: FilaSerie[], inicio: Date, fin: Date, localesEsperados = 1) {
  const porFecha = new Map<string, { ventas: number; tickets: number; locales: Set<string> }>();
  for (const fila of filas) {
    if (fila.fecha < inicio || fila.fecha > fin) continue;
    const fecha = diaDeFechaSql(fila.fecha);
    const acumulado = porFecha.get(fecha) ?? { ventas: 0, tickets: 0, locales: new Set<string>() };
    acumulado.ventas += fila.ventas;
    acumulado.tickets += fila.tickets;
    acumulado.locales.add(fila.localId);
    porFecha.set(fecha, acumulado);
  }

  const puntos: {
    fecha: string;
    ventas: number | null;
    tickets: number | null;
    ticketPromedio: number | null;
    completo: boolean;
  }[] = [];
  const cursor = new Date(inicio);
  while (cursor <= fin) {
    const fecha = diaDeFechaSql(cursor);
    const punto = porFecha.get(fecha);
    puntos.push({
      fecha,
      ventas: punto?.ventas ?? null,
      tickets: punto?.tickets ?? null,
      ticketPromedio: punto && punto.tickets > 0 ? punto.ventas / punto.tickets : null,
      completo: Boolean(punto && punto.locales.size >= localesEsperados),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return puntos;
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
      ticketsPrevio: previo.tickets,
      ticketPromedio: actual.tickets > 0 ? actual.ventas / actual.tickets : 0,
      ticketPromedioPrevio: previo.tickets > 0 ? previo.ventas / previo.tickets : 0,
      personas: actual.personas,
      descuentos: actual.descuentos,
      porcentajeDescuentos: actual.ventas > 0 ? (actual.descuentos / actual.ventas) * 100 : 0,
      anulaciones: actual.anulaciones,
      gastos: actual.gastos,
      gastosPrevio: previo.gastos,
      costo: actual.costo,
      costoPrevio: previo.costo,
      costoIncompleto: actual.costoIncompleto,
      foodCost: actual.ventas > 0 ? (actual.costo / actual.ventas) * 100 : 0,
      resultado: actual.ventas - actual.costo - actual.gastos,
      resultadoPrevio: previo.ventas - previo.costo - previo.gastos,
      porMedioPago: actual.porMedioPago,
      porCanal: actual.porCanal,
      porCategoria: actual.porCategoria,
      descuentosPorCaja: actual.descuentosPorCaja,
      topProductos: top(actual.productos, 10),
      serie: {
        actual: construirSerie(suyas, inicioActual, finActual),
        previo: construirSerie(suyas, inicioPrevio, finPrevio),
      },
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
    ticketsPrevio: conDatos.reduce((s, l) => s + l.ticketsPrevio, 0),
    descuentos: conDatos.reduce((s, l) => s + l.descuentos, 0),
    anulaciones: conDatos.reduce((s, l) => s + l.anulaciones, 0),
    gastos: conDatos.reduce((s, l) => s + l.gastos, 0),
    gastosPrevio: conDatos.reduce((s, l) => s + l.gastosPrevio, 0),
    costo: conDatos.reduce((s, l) => s + l.costo, 0),
    costoPrevio: conDatos.reduce((s, l) => s + l.costoPrevio, 0),
    localesSinFudo: porLocal.filter((l) => !l.tieneFudo).map((l) => l.nombre),
  };
  const idsConFudo = new Set(conDatos.map((local) => local.localId));
  const filasCadena = filas.filter((fila) => idsConFudo.has(fila.localId));

  return NextResponse.json({
    periodo,
    dias,
    rango: { desde: diaDeFechaSql(inicioActual), hasta: diaDeFechaSql(finActual) },
    rangoPrevio: { desde: diaDeFechaSql(inicioPrevio), hasta: diaDeFechaSql(finPrevio) },
    cadena: {
      ...cadena,
      variacionVentas: variacion(ventasComparables, ventasComparablesPrevio),
      localesSinBase: conDatos.filter((l) => !l.baseComparable).map((l) => l.nombre),
      ticketPromedio: cadena.tickets > 0 ? cadena.ventas / cadena.tickets : 0,
      ticketPromedioPrevio: cadena.ticketsPrevio > 0 ? cadena.ventasPrevio / cadena.ticketsPrevio : 0,
      resultado: cadena.ventas - cadena.costo - cadena.gastos,
      resultadoPrevio: cadena.ventasPrevio - cadena.costoPrevio - cadena.gastosPrevio,
      serie: {
        actual: construirSerie(filasCadena, inicioActual, finActual, Math.max(conDatos.length, 1)),
        previo: construirSerie(filasCadena, inicioPrevio, finPrevio, Math.max(conDatos.length, 1)),
      },
    },
    locales: porLocal,
    alertas: [...armarAlertas(porLocal, dias), ...alertasDePrecio(productos, locales)],
  });
}

type LocalCalculado = {
  localId: string;
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
  const alertas: { tono: "rose" | "amber"; texto: string; localId: string }[] = [];

  for (const l of locales) {
    if (!l.tieneFudo) continue;

    if (l.promedioDiarioHistorico > 0 && l.promedioDiarioActual > 0) {
      const vsHistorico = ((l.promedioDiarioActual - l.promedioDiarioHistorico) / l.promedioDiarioHistorico) * 100;
      if (vsHistorico <= CAIDA_VENTAS) {
        alertas.push({
          tono: "rose",
          texto: `${l.nombre} vende ${Math.abs(vsHistorico).toFixed(0)}% menos que su promedio`,
          localId: l.localId,
        });
      }
    }

    if (l.porcentajeDescuentos >= DESCUENTOS_ALTOS) {
      alertas.push({
        tono: "amber",
        texto: `${l.nombre} tiene descuentos altos: ${l.porcentajeDescuentos.toFixed(1)}% de la facturación`,
        localId: l.localId,
      });
    }

    if (l.anulaciones > 0 && l.ventas > 0 && (l.anulaciones / l.ventas) * 100 >= DESCUENTOS_ALTOS) {
      alertas.push({
        tono: "amber",
        texto: `${l.nombre} anuló ${((l.anulaciones / l.ventas) * 100).toFixed(1)}% de lo que facturó`,
        localId: l.localId,
      });
    }

    if (!l.costoIncompleto && l.foodCost >= FOOD_COST_ALTO) {
      alertas.push({
        tono: "amber",
        texto: `${l.nombre} tiene food cost de ${l.foodCost.toFixed(0)}%, por encima del 40%`,
        localId: l.localId,
      });
    }

    if (!l.baseComparable && l.diasConDatos > 0) {
      alertas.push({
        tono: "amber",
        texto: `${l.nombre}: al período anterior le faltan días sincronizados, no se puede comparar el crecimiento`,
        localId: l.localId,
      });
    }

    if (l.diasConDatos === 0) {
      alertas.push({ tono: "amber", texto: `${l.nombre} no tiene datos sincronizados en el período`, localId: l.localId });
    } else if (l.diasConDatos < dias && dias > 1) {
      alertas.push({
        tono: "amber",
        texto: `${l.nombre} tiene datos de ${l.diasConDatos} de ${dias} días: sincronizá para completar`,
        localId: l.localId,
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
): { tono: "rose" | "amber"; texto: string; localId: null }[] {
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
      localId: null,
    }));
}
