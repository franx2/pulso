/**
 * Motor de Factor K (puntos 5, 6 y 12 del pedido).
 *
 * `FinalDemand = BaseDemand × K_auto × K_manual`, con
 * `K_auto = K_calendar × K_weather × K_location × K_event × K_promotion × K_trend`.
 *
 * Dos reglas que hacen que esto no sea una caja negra:
 * 1. cada factor se devuelve por separado, con su motivo en texto;
 * 2. K_auto se recorta a un rango configurable, así un factor mal aprendido
 *    no puede destruir el pronóstico.
 */

export type FactoresK = {
  K_calendar: number;
  K_weather: number;
  K_location: number;
  K_event: number;
  K_promotion: number;
  K_trend: number;
};

export type ExplicacionK = {
  kAuto: number;
  kAutoSinRecorte: number;
  recortado: boolean;
  kManual: number;
  kFinal: number;
  factores: FactoresK;
  /** Frases listas para mostrar, ordenadas por impacto. */
  motivos: string[];
};

export const LIMITES_K = { min: 0.6, max: 1.6 };

export const K_NEUTRO: FactoresK = {
  K_calendar: 1,
  K_weather: 1,
  K_location: 1,
  K_event: 1,
  K_promotion: 1,
  K_trend: 1,
};

const ETIQUETA: Record<keyof FactoresK, string> = {
  K_calendar: "calendario",
  K_weather: "clima",
  K_location: "tipo de local",
  K_event: "evento",
  K_promotion: "promoción",
  K_trend: "tendencia reciente",
};

/** Un factor que no se pudo calcular vale 1: neutro, nunca inventado. */
function sano(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 1;
}

export function componerK(
  parciales: Partial<FactoresK>,
  kManual = 1,
  limites = LIMITES_K,
  motivosExtra: string[] = []
): ExplicacionK {
  const factores: FactoresK = {
    K_calendar: sano(parciales.K_calendar),
    K_weather: sano(parciales.K_weather),
    K_location: sano(parciales.K_location),
    K_event: sano(parciales.K_event),
    K_promotion: sano(parciales.K_promotion),
    K_trend: sano(parciales.K_trend),
  };

  const kAutoSinRecorte = Object.values(factores).reduce((a, b) => a * b, 1);
  const kAuto = Math.min(Math.max(kAutoSinRecorte, limites.min), limites.max);

  const motivos = (Object.keys(factores) as (keyof FactoresK)[])
    .filter((k) => Math.abs(factores[k] - 1) >= 0.01)
    .sort((a, b) => Math.abs(factores[b] - 1) - Math.abs(factores[a] - 1))
    .map((k) => {
      const pct = (factores[k] - 1) * 100;
      return `${ETIQUETA[k]}: ${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
    });

  if (kAutoSinRecorte !== kAuto) {
    motivos.push(
      `ajuste recortado a ${kAuto.toFixed(2)} (el cálculo daba ${kAutoSinRecorte.toFixed(2)}, fuera del rango permitido)`
    );
  }

  return {
    kAuto,
    kAutoSinRecorte,
    recortado: kAutoSinRecorte !== kAuto,
    kManual: sano(kManual),
    kFinal: kAuto * sano(kManual),
    factores,
    motivos: [...motivos, ...motivosExtra],
  };
}

/**
 * K_calendar de efectos que no están ya dentro del perfil.
 *
 * Ojo: el perfil YA captura el día de la semana (cada celda es día × franja),
 * así que meter acá un "+21% porque es viernes" contaría el viernes dos
 * veces. Lo que sí falta en el perfil es lo que no se repite semana a semana:
 * feriados, vísperas y la posición en el mes.
 */
export function calcularKCalendar(opciones: {
  esFeriado: boolean;
  esVisperaFeriado: boolean;
  diaDelMes: number;
  /** Factores aprendidos; si no hay historia, quedan en 1. */
  factorFeriado?: number;
  factorVispera?: number;
  factorQuincena?: number;
}): { k: number; motivos: string[] } {
  const motivos: string[] = [];
  let k = 1;

  if (opciones.esFeriado) {
    const f = sano(opciones.factorFeriado);
    k *= f;
    if (Math.abs(f - 1) >= 0.01) motivos.push("feriado");
  }
  if (opciones.esVisperaFeriado) {
    const f = sano(opciones.factorVispera);
    k *= f;
    if (Math.abs(f - 1) >= 0.01) motivos.push("víspera de feriado");
  }
  // Principio de mes (cobro) suele mover más que el final.
  if (opciones.diaDelMes <= 5) {
    const f = sano(opciones.factorQuincena);
    k *= f;
    if (Math.abs(f - 1) >= 0.01) motivos.push("principio de mes");
  }

  return { k, motivos };
}
