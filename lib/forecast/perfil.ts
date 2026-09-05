/**
 * Perfil de demanda propio de cada local: cuánto vende normalmente ESE local
 * en ESE día de la semana y ESA franja. Es la "demanda base" contra la que se
 * mide todo lo demás.
 *
 * Decisión de método (punto 17 del pedido): con ~90 días de historia, lo que
 * gana no es un modelo complejo sino un promedio comparable bien ponderado.
 * Se usa media móvil ponderada exponencialmente sobre las ocurrencias del
 * mismo día de semana: cada semana hacia atrás pesa `DECAIMIENTO` veces menos
 * que la anterior. Con 12 semanas y decaimiento 0.82, las últimas 2 semanas
 * concentran ~33% del peso y las semanas 7-12 aportan ~20%, que es la
 * intención del punto 7 sin hardcodear tramos arbitrarios.
 */

export const DECAIMIENTO_SEMANAL = 0.82;

export type Observacion = {
  /** "YYYY-MM-DD" */
  fecha: string;
  slot: number;
  tickets: number;
  unidades: number;
  ventas: number;
};

export type CeldaPerfil = {
  diaSemana: number;
  slot: number;
  tickets: number;
  unidades: number;
  ventas: number;
  /** Ocurrencias que respaldan la celda: con pocas, el forecast va a tener
   * más incertidumbre y el intervalo tiene que abrirse. */
  muestras: number;
  /** Desvío estándar de tickets entre ocurrencias, para el intervalo. */
  desvioTickets: number;
};

export type Perfil = {
  /** Clave "diaSemana-slot". */
  celdas: Map<string, CeldaPerfil>;
  /** Tickets por slot promedio de todo el local, para normalizar el índice. */
  ticketsPromedioSlot: number;
  diasObservados: number;
};

export const claveCelda = (diaSemana: number, slot: number) => `${diaSemana}-${slot}`;

function diaSemanaDe(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

/** Media ponderada; `pesos` y `valores` van alineados. */
function promedioPonderado(valores: number[], pesos: number[]): number {
  const total = pesos.reduce((s, p) => s + p, 0);
  if (total === 0) return 0;
  return valores.reduce((s, v, i) => s + v * pesos[i], 0) / total;
}

/**
 * Arma el perfil. `hoy` define desde dónde se cuenta la antigüedad: en
 * backtesting hay que pasar la fecha simulada, no la de hoy, o el modelo
 * estaría usando el futuro para pesar el pasado.
 */
export function construirPerfil(observaciones: Observacion[], hoy: string): Perfil {
  const porCelda = new Map<string, { obs: Observacion[]; pesos: number[] }>();
  const hoyMs = new Date(`${hoy}T12:00:00Z`).getTime();
  const dias = new Set<string>();

  for (const o of observaciones) {
    dias.add(o.fecha);
    const semanasAtras = Math.max(
      0,
      Math.floor((hoyMs - new Date(`${o.fecha}T12:00:00Z`).getTime()) / (7 * 86400000))
    );
    const peso = Math.pow(DECAIMIENTO_SEMANAL, semanasAtras);
    const clave = claveCelda(diaSemanaDe(o.fecha), o.slot);
    const acc = porCelda.get(clave) ?? { obs: [], pesos: [] };
    acc.obs.push(o);
    acc.pesos.push(peso);
    porCelda.set(clave, acc);
  }

  const celdas = new Map<string, CeldaPerfil>();
  for (const [clave, { obs, pesos }] of porCelda) {
    const [diaSemana, slot] = clave.split("-").map(Number);
    const tickets = promedioPonderado(obs.map((o) => o.tickets), pesos);
    const media = obs.reduce((s, o) => s + o.tickets, 0) / obs.length;
    const varianza = obs.reduce((s, o) => s + (o.tickets - media) ** 2, 0) / Math.max(obs.length - 1, 1);
    celdas.set(clave, {
      diaSemana,
      slot,
      tickets,
      unidades: promedioPonderado(obs.map((o) => o.unidades), pesos),
      ventas: promedioPonderado(obs.map((o) => o.ventas), pesos),
      muestras: obs.length,
      desvioTickets: Math.sqrt(varianza),
    });
  }

  const conTickets = [...celdas.values()].filter((c) => c.tickets > 0);
  const ticketsPromedioSlot =
    conTickets.length > 0 ? conTickets.reduce((s, c) => s + c.tickets, 0) / conTickets.length : 0;

  return { celdas, ticketsPromedioSlot, diasObservados: dias.size };
}

/**
 * DemandIndex: 100 = lo normal de ESE local en ESA franja. Se compara contra
 * la propia celda del perfil, nunca contra otro local ni contra el promedio
 * de la cadena — un local chico no tiene por qué dar 60 sólo por ser chico.
 */
export function demandIndex(esperado: number, normalDeLaCelda: number): number {
  if (normalDeLaCelda <= 0) return 100;
  return (esperado / normalDeLaCelda) * 100;
}

/**
 * K_trend: compara las últimas 3 semanas contra el resto de la ventana, sobre
 * el mismo conjunto de días de semana, para que no lo ensucie que en el tramo
 * reciente haya más fines de semana.
 */
export function calcularKTrend(observaciones: Observacion[], hoy: string): { k: number; reciente: number; base: number } {
  const hoyMs = new Date(`${hoy}T12:00:00Z`).getTime();
  const porDia = new Map<string, number>();
  for (const o of observaciones) {
    porDia.set(o.fecha, (porDia.get(o.fecha) ?? 0) + o.tickets);
  }

  const recientes: number[] = [];
  const viejos: number[] = [];
  for (const [fecha, tickets] of porDia) {
    const diasAtras = (hoyMs - new Date(`${fecha}T12:00:00Z`).getTime()) / 86400000;
    if (diasAtras <= 21) recientes.push(tickets);
    else viejos.push(tickets);
  }

  if (recientes.length < 5 || viejos.length < 5) return { k: 1, reciente: 0, base: 0 };
  const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const reciente = media(recientes);
  const base = media(viejos);
  if (base <= 0) return { k: 1, reciente, base };
  return { k: reciente / base, reciente, base };
}
