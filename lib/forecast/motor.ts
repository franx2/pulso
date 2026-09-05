import type { Sector } from "@prisma/client";
import { db } from "@/lib/db";
import { fechaSql, hoyAR, sumarDias } from "@/lib/fechaAR";
import { intervalo } from "./backtest";
import { calcularCarga, cargaPorHora, COEFICIENTES_CANAL_INICIALES, COEFICIENTES_INICIALES } from "./carga";
import { recomendarDotacion, type CapacidadSectorial } from "./dotacion";
import { componerK, calcularKCalendar } from "./k";
import { kWeather } from "./clima";
import { calcularKTrend, claveCelda, construirPerfil, demandIndex, type Observacion } from "./perfil";
import { SLOTS_POR_DIA } from "./slots";

/**
 * Orquesta el pronóstico. Cada pieza (perfil, K, carga, dotación) vive en su
 * propio archivo y se testea sola; acá sólo se las combina y se persiste.
 */

/** Capacidades por defecto, en puntos de carga por hora y por persona.
 * NO están medidas: hoy hay 34 fichajes en total, así que no hay contra qué
 * calibrar. Son un punto de partida explícito, marcado DEFECTO, para que la
 * dotación se pueda usar y corregir desde el primer día. */
export const CAPACIDAD_INICIAL: Record<Sector, CapacidadSectorial> = {
  COCINA: { capacidadPorEmpleado: 90, minPersonas: 1, maxPersonas: 8 },
  SALON: { capacidadPorEmpleado: 70, minPersonas: 1, maxPersonas: 8 },
  CAJA: { capacidadPorEmpleado: 120, minPersonas: 1, maxPersonas: 3 },
  DESPACHO: { capacidadPorEmpleado: 100, minPersonas: 0, maxPersonas: 4 },
  ENCARGADO: { capacidadPorEmpleado: 999, minPersonas: 1, maxPersonas: 1 },
};

export type PronosticoSlot = {
  fecha: string;
  slot: number;
  demandaBase: number;
  demandIndex: number;
  kAuto: number;
  kManual: number;
  demandaFinal: number;
  tickets: number;
  ticketsMin: number;
  ticketsMax: number;
  confianza: number;
  unidades: number;
  ventas: number;
  carga: Record<Sector, number>;
  dotacion: Record<Sector, number>;
  motivos: string[];
  kDetalle: Record<string, number>;
};

export type PronosticoDia = {
  fecha: string;
  diaSemana: number;
  tickets: number;
  ticketsMin: number;
  ticketsMax: number;
  unidades: number;
  ventas: number;
  demandIndex: number;
  kAuto: number;
  kManual: number;
  confianza: number;
  motivos: string[];
  horaPico: string | null;
  dotacionPico: Record<Sector, number>;
  slots: PronosticoSlot[];
};


/** Observaciones de la ventana histórica, desde la serie de 30 minutos. */
export async function cargarObservaciones(localId: string, hasta: string, dias = 90): Promise<Observacion[]> {
  const desde = sumarDias(hasta, -dias);
  const filas = await db.demandaSlot.findMany({
    where: { localId, fecha: { gte: fechaSql(desde), lt: fechaSql(hasta) } },
    orderBy: { fecha: "asc" },
  });
  return filas.map((f) => ({
    fecha: f.fecha.toISOString().slice(0, 10),
    slot: f.slot,
    tickets: f.tickets,
    unidades: f.unidades,
    ventas: f.ventas,
  }));
}

/** Mezcla de categorías por franja: se usa la del perfil histórico, porque
 * lo que se vende a las 9 de la mañana no es lo que se vende a las 21. */
async function mezclaPorSlot(localId: string, hasta: string, dias = 90) {
  const desde = sumarDias(hasta, -dias);
  const filas = await db.demandaSlot.findMany({
    where: { localId, fecha: { gte: fechaSql(desde), lt: fechaSql(hasta) } },
    select: { slot: true, porCategoria: true, porCanal: true, tickets: true },
  });

  const porSlot = new Map<number, { categorias: Record<string, number>; canales: Record<string, number>; tickets: number }>();
  for (const f of filas) {
    const acc = porSlot.get(f.slot) ?? { categorias: {}, canales: {}, tickets: 0 };
    for (const [k, v] of Object.entries((f.porCategoria ?? {}) as Record<string, number>)) {
      acc.categorias[k] = (acc.categorias[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries((f.porCanal ?? {}) as Record<string, number>)) {
      acc.canales[k] = (acc.canales[k] ?? 0) + v;
    }
    acc.tickets += f.tickets;
    porSlot.set(f.slot, acc);
  }
  return porSlot;
}

export async function pronosticar(
  localId: string,
  opciones: { desde?: string; dias?: number; ventanaHistorica?: number; persistir?: boolean } = {}
): Promise<{ dias: PronosticoDia[]; diagnostico: Record<string, unknown> }> {
  const desde = opciones.desde ?? hoyAR();
  const horizonte = opciones.dias ?? 15;
  // La ventana la elige el backtest por local (Local.ventanaForecastDias):
  // un año dilata el nivel actual con estacionalidad vieja y empeora el error.
  const localBase = await db.local.findUniqueOrThrow({ where: { id: localId }, select: { ventanaForecastDias: true } });
  const ventana = opciones.ventanaHistorica ?? localBase.ventanaForecastDias;

  const [local, observaciones, mezcla, feriados, ajustes, capacidadesDb] = await Promise.all([
    db.local.findUniqueOrThrow({ where: { id: localId } }),
    cargarObservaciones(localId, desde, ventana),
    mezclaPorSlot(localId, desde, ventana),
    db.feriado.findMany(),
    db.ajusteK.findMany({ where: { OR: [{ localId }, { localId: null }] } }),
    db.capacidadSector.findMany({ where: { localId } }),
  ]);

  // Clima del horizonte y sensibilidad medida para este tipo de local. Sin
  // coordenadas o sin historia suficiente, K_weather queda neutro solo.
  const [climas, sensibilidades] = await Promise.all([
    db.climaDia.findMany({
      where: { localId, fecha: { gte: fechaSql(desde), lte: fechaSql(sumarDias(desde, horizonte)) } },
    }),
    db.sensibilidadClima.findMany({ where: { tipoLocal: local.tipoLocal } }),
  ]);
  const climaPorFecha = new Map(climas.map((c) => [c.fecha.toISOString().slice(0, 10), c]));

  const perfil = construirPerfil(observaciones, desde);
  const trend = calcularKTrend(observaciones, desde);
  const feriadosSet = new Set(feriados.map((f) => f.fecha.toISOString().slice(0, 10)));

  const capacidades: Partial<Record<Sector, CapacidadSectorial>> = { ...CAPACIDAD_INICIAL };
  for (const c of capacidadesDb) {
    capacidades[c.sector] = {
      capacidadPorEmpleado: c.capacidadPorEmpleado,
      minPersonas: c.minPersonas,
      maxPersonas: c.maxPersonas,
    };
  }

  const dias: PronosticoDia[] = [];

  for (let i = 0; i < horizonte; i++) {
    const fecha = sumarDias(desde, i);
    const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    const diaDelMes = Number(fecha.slice(8, 10));

    const cal = calcularKCalendar({
      esFeriado: feriadosSet.has(fecha),
      esVisperaFeriado: feriadosSet.has(sumarDias(fecha, 1)),
      diaDelMes,
      // Sin historia propia de feriados todavía: se deja neutro en vez de
      // inventar un multiplicador (el índice ya lo va a mostrar como sorpresa
      // cuando pase, y ahí se aprende).
      factorFeriado: 1,
      factorVispera: 1,
      factorQuincena: 1,
    });

    // K_manual: gana el ajuste más específico que aplique a esta fecha.
    const aplicables = ajustes.filter(
      (a) =>
        (a.localId === localId || a.localId === null) &&
        (a.fecha == null || a.fecha.toISOString().slice(0, 10) === fecha) &&
        (a.diaSemana == null || a.diaSemana === diaSemana)
    );
    const kManualDia = aplicables
      .filter((a) => a.slot == null)
      .reduce((acc, a) => acc * a.valor, 1);

    const clima = climaPorFecha.get(fecha) ?? null;
    const meteo = kWeather(clima, sensibilidades);

    const slots: PronosticoSlot[] = [];

    for (let slot = 0; slot < SLOTS_POR_DIA; slot++) {
      const celda = perfil.celdas.get(claveCelda(diaSemana, slot));
      if (!celda || celda.tickets <= 0) continue;

      const kSlot = aplicables
        .filter((a) => a.slot === slot)
        .reduce((acc, a) => acc * a.valor, 1);
      const kManual = kManualDia * kSlot;

      const explicacion = componerK(
        { K_calendar: cal.k, K_trend: trend.k, K_weather: meteo.k },
        kManual,
        undefined,
        [...cal.motivos, ...(meteo.motivo ? [meteo.motivo] : [])]
      );

      const base = celda.tickets;
      const tickets = base * explicacion.kFinal;
      const rango = intervalo(tickets, celda.desvioTickets, celda.muestras);

      // La mezcla de productos de esa franja escala con la demanda: si se
      // esperan 20% más tickets, se esperan 20% más unidades de lo mismo.
      const m = mezcla.get(slot);
      const factorMezcla = m && m.tickets > 0 ? tickets / m.tickets : 0;
      const unidadesPorCategoria: Record<string, number> = {};
      for (const [cat, u] of Object.entries(m?.categorias ?? {})) {
        unidadesPorCategoria[cat] = u * factorMezcla;
      }
      const ticketsPorCanal: Record<string, number> = {};
      for (const [canal, t] of Object.entries(m?.canales ?? {})) {
        ticketsPorCanal[canal] = t * factorMezcla;
      }

      const carga = calcularCarga(
        unidadesPorCategoria,
        ticketsPorCanal,
        COEFICIENTES_INICIALES,
        COEFICIENTES_CANAL_INICIALES
      );
      const porHora = cargaPorHora(carga);

      slots.push({
        fecha,
        slot,
        demandaBase: base,
        demandIndex: demandIndex(tickets, perfil.ticketsPromedioSlot),
        kAuto: explicacion.kAuto,
        kManual: explicacion.kManual,
        demandaFinal: tickets,
        tickets,
        ticketsMin: rango.min,
        ticketsMax: rango.max,
        confianza: rango.confianza,
        unidades: celda.unidades * explicacion.kFinal,
        ventas: celda.ventas * explicacion.kFinal,
        carga: porHora,
        dotacion: recomendarDotacion(porHora, capacidades),
        motivos: explicacion.motivos,
        kDetalle: explicacion.factores as unknown as Record<string, number>,
      });
    }

    const tickets = slots.reduce((s, x) => s + x.tickets, 0);
    const pico = slots.reduce<PronosticoSlot | null>((max, x) => (!max || x.tickets > max.tickets ? x : max), null);
    const normalDelDia = [...perfil.celdas.values()]
      .filter((c) => c.diaSemana === diaSemana)
      .reduce((s, c) => s + c.tickets, 0);

    dias.push({
      fecha,
      diaSemana,
      tickets,
      ticketsMin: slots.reduce((s, x) => s + x.ticketsMin, 0),
      ticketsMax: slots.reduce((s, x) => s + x.ticketsMax, 0),
      unidades: slots.reduce((s, x) => s + x.unidades, 0),
      ventas: slots.reduce((s, x) => s + x.ventas, 0),
      demandIndex: demandIndex(tickets, normalDelDia),
      kAuto: slots[0]?.kAuto ?? 1,
      kManual: slots[0]?.kManual ?? 1,
      confianza: slots.length > 0 ? slots.reduce((s, x) => s + x.confianza, 0) / slots.length : 0,
      motivos: slots[0]?.motivos ?? [],
      horaPico: pico ? `${String(Math.floor(pico.slot / 2)).padStart(2, "0")}:${pico.slot % 2 ? "30" : "00"}` : null,
      dotacionPico: pico?.dotacion ?? { COCINA: 0, SALON: 0, CAJA: 0, DESPACHO: 0, ENCARGADO: 0 },
      slots,
    });
  }

  if (opciones.persistir) await persistir(localId, dias);

  return {
    dias,
    diagnostico: {
      local: local.nombre,
      tipoLocal: local.tipoLocal,
      diasObservados: perfil.diasObservados,
      celdasPerfil: perfil.celdas.size,
      kTrend: trend.k,
      ticketsPromedioSlot: perfil.ticketsPromedioSlot,
      capacidadEsMedida: capacidadesDb.some((c) => c.origen === "APRENDIDO"),
    },
  };
}

/** Guarda el pronóstico. Se conserva `emitidoEn` porque el mismo día
 * pronosticado desde dos momentos distintos son dos pronósticos distintos, y
 * sin eso no se puede medir si el modelo mejora (punto 16). */
async function persistir(localId: string, dias: PronosticoDia[]) {
  const emitidoEn = new Date();
  await db.pronostico.createMany({
    data: dias.map((d) => ({
      localId,
      fecha: fechaSql(d.fecha),
      slot: null,
      emitidoEn,
      demandaBase: d.tickets / (d.kAuto * d.kManual || 1),
      kAuto: d.kAuto,
      kManual: d.kManual,
      demandaFinal: d.tickets,
      kDetalle: { motivos: d.motivos } as object,
      ticketsPronosticados: d.tickets,
      unidadesPronosticadas: d.unidades,
      ventasPronosticadas: d.ventas,
      demandIndex: d.demandIndex,
      ticketsMin: d.ticketsMin,
      ticketsMax: d.ticketsMax,
      confianza: d.confianza,
      dotacionPorSector: d.dotacionPico as object,
    })),
    skipDuplicates: true,
  });
}
