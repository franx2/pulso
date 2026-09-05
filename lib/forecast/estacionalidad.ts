/**
 * Estacionalidad de ventas: qué parte del movimiento es la época del año y no
 * el negocio.
 *
 * Sin esto, proyectar 30 días era extender la pendiente de las últimas 8
 * semanas. Eso funciona dentro del mes y falla justo cuando importa: en enero
 * en Mendoza, en las fiestas, al arrancar las clases. Con un año completo
 * cargado se puede separar las tres cosas que mueven la venta diaria:
 *
 *     venta ≈ nivel × tendencia(t) × índice del mes × perfil del día de semana
 *
 * Dos decisiones que cambian el resultado y no son obvias:
 *
 * 1. **El índice del mes se calcula sobre la serie DESTENDENCIADA.** En un
 *    país con inflación alta la venta nominal de diciembre es más grande que
 *    la de enero por dos razones distintas: porque diciembre vende más y
 *    porque diciembre viene once meses después. Sacar la tendencia primero es
 *    lo único que separa "temporada" de "los precios subieron".
 *
 * 2. **La tendencia se ajusta en logaritmos.** El crecimiento acá es
 *    multiplicativo (un local que crece "un 8% por mes"), no aditivo. Una
 *    recta sobre los pesos nominales subestima el arranque y se dispara al
 *    final.
 *
 * Todo el módulo es puro: entra una serie de días y salen números. Se testea
 * sin base de datos.
 */

import { diasEntre, sumarDias } from "@/lib/fechaAR";

export type DiaVentas = { fecha: string; ventas: number };

/** Un índice mensual con menos de esto atrás es un dato, no una temporada. */
const MIN_OBSERVACIONES_MES = 20;

/**
 * Recorte del índice mensual. Un mes con un solo año de historia y una semana
 * rara adentro puede dar 1,9; multiplicar la proyección por eso es peor que
 * no haber ajustado nada.
 */
const LIMITES_INDICE = { min: 0.65, max: 1.45 };

/** Meses de historia por debajo de los cuales no se declara estacionalidad. */
export const MIN_MESES_ESTACIONALIDAD = 12;

/** Hueco máximo entre el último día con datos y el arranque de la proyección. */
const MAX_DIAS_SIN_DATOS = 45;

const mesDe = (fecha: string) => Number(fecha.slice(5, 7));
const diaSemanaDe = (fecha: string) => new Date(`${fecha}T12:00:00.000Z`).getUTCDay();
const mediana = (valores: number[]): number => {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio];
};
const recortar = (valor: number, min: number, max: number) => Math.max(min, Math.min(max, valor));

export type Tendencia = {
  /** Nivel ajustado en el día 0 de la serie, en pesos por día. */
  nivel: number;
  /** Crecimiento diario compuesto: 0.002 es +0,2% por día. */
  crecimientoDiario: number;
  /** Ese mismo crecimiento expresado por mes de 30 días, en %. */
  crecimientoMensualPct: number;
  dias: number;
};

/**
 * Ajusta `log(ventas) = a + b·t` por mínimos cuadrados. Los días sin venta
 * quedan afuera: `log(0)` no existe, y un día cerrado no es un día flojo.
 */
export function ajustarTendencia(serie: DiaVentas[]): Tendencia | null {
  const validos = serie.filter((d) => d.ventas > 0);
  if (validos.length < 30) return null;

  const origen = validos[0].fecha;
  const puntos = validos.map((d) => ({ t: diasEntre(origen, d.fecha) - 1, y: Math.log(d.ventas) }));
  const n = puntos.length;
  const mediaT = puntos.reduce((s, p) => s + p.t, 0) / n;
  const mediaY = puntos.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of puntos) {
    num += (p.t - mediaT) * (p.y - mediaY);
    den += (p.t - mediaT) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  const a = mediaY - b * mediaT;

  return {
    nivel: Math.exp(a),
    crecimientoDiario: Math.exp(b) - 1,
    crecimientoMensualPct: (Math.exp(b * 30) - 1) * 100,
    dias: n,
  };
}

/** Valor de la tendencia ajustada en un día cualquiera de la serie. */
function tendenciaEn(tendencia: Tendencia, origen: string, fecha: string): number {
  const t = diasEntre(origen, fecha) - 1;
  return tendencia.nivel * Math.pow(1 + tendencia.crecimientoDiario, t);
}

export type IndiceMes = {
  mes: number;
  indice: number;
  /** Días observados de ese mes en toda la historia disponible. */
  dias: number;
  /**
   * En cuántos años distintos se vio ese mes. Es una advertencia distinta de
   * `dias`: diciembre puede tener 31 días observados y ser un solo diciembre.
   * Un mes visto una sola vez no distingue "así es diciembre" de "así fue ese
   * diciembre" — una promoción, una obra en la vereda o un feriado raro entran
   * al índice como si fueran la temporada.
   */
  anios: number;
  /** Si se apoya en suficientes días como para usarlo. */
  confiable: boolean;
  /** Si además se repitió en más de un año. */
  repetido: boolean;
};

export type PerfilEstacional = {
  meses: IndiceMes[];
  tendencia: Tendencia;
  origen: string;
  /** Meses calendario con suficiente historia. Con pocos, todo esto es débil. */
  mesesConfiables: number;
  /** Meses vistos en más de un año: los únicos que separan temporada de anécdota. */
  mesesRepetidos: number;
  /** Meses de historia que se usaron. */
  mesesDeHistoria: number;
};

/**
 * Índice por mes calendario: cuánto vende un día de ese mes comparado con un
 * día promedio del año, ya descontada la tendencia.
 *
 * Se usa la mediana y no el promedio a propósito: un feriado largo o un día
 * de cierre no tiene que redefinir el mes entero.
 */
export function construirPerfilEstacional(serie: DiaVentas[]): PerfilEstacional | null {
  const validos = serie.filter((d) => d.ventas > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const tendencia = ajustarTendencia(validos);
  if (!tendencia) return null;

  const origen = validos[0].fecha;
  const ratiosPorMes = new Map<number, number[]>();
  const aniosPorMes = new Map<number, Set<string>>();
  for (const dia of validos) {
    const esperado = tendenciaEn(tendencia, origen, dia.fecha);
    if (esperado <= 0) continue;
    const mes = mesDe(dia.fecha);
    const lista = ratiosPorMes.get(mes) ?? [];
    lista.push(dia.ventas / esperado);
    ratiosPorMes.set(mes, lista);
    aniosPorMes.set(mes, (aniosPorMes.get(mes) ?? new Set()).add(dia.fecha.slice(0, 4)));
  }

  const crudos = [...Array(12)].map((_, indice) => {
    const mes = indice + 1;
    const ratios = ratiosPorMes.get(mes) ?? [];
    return {
      mes,
      valor: ratios.length > 0 ? mediana(ratios) : null,
      dias: ratios.length,
      anios: aniosPorMes.get(mes)?.size ?? 0,
    };
  });

  // Se normaliza contra el promedio de los meses observados, no contra 1: si
  // sólo hay medio año cargado, ese medio año es el "normal" disponible.
  const observados = crudos.filter((m) => m.valor != null);
  if (observados.length === 0) return null;
  const promedio = observados.reduce((s, m) => s + (m.valor ?? 0), 0) / observados.length;

  const meses: IndiceMes[] = crudos.map((m) => ({
    mes: m.mes,
    // Un mes sin historia no se inventa: queda neutro y declarado como tal.
    indice: m.valor == null || promedio <= 0 ? 1 : recortar(m.valor / promedio, LIMITES_INDICE.min, LIMITES_INDICE.max),
    dias: m.dias,
    anios: m.anios,
    confiable: m.dias >= MIN_OBSERVACIONES_MES,
    repetido: m.anios >= 2,
  }));

  return {
    meses,
    tendencia,
    origen,
    mesesConfiables: meses.filter((m) => m.confiable).length,
    mesesRepetidos: meses.filter((m) => m.repetido).length,
    mesesDeHistoria: Math.round(diasEntre(origen, validos[validos.length - 1].fecha) / 30.44),
  };
}

/**
 * Perfil de día de semana, normalizado a 1. Se calcula sobre la serie ya sin
 * tendencia por el mismo motivo que el mes: si no, la última semana pesa más
 * que la primera sólo por ser más nueva.
 */
export function perfilDiaSemana(serie: DiaVentas[], tendencia: Tendencia, origen: string): number[] {
  const porDia = new Map<number, number[]>();
  for (const dia of serie) {
    if (dia.ventas <= 0) continue;
    const esperado = tendenciaEn(tendencia, origen, dia.fecha);
    if (esperado <= 0) continue;
    const clave = diaSemanaDe(dia.fecha);
    porDia.set(clave, [...(porDia.get(clave) ?? []), dia.ventas / esperado]);
  }
  const crudos = [...Array(7)].map((_, dia) => mediana(porDia.get(dia) ?? []));
  const observados = crudos.filter((v) => v > 0);
  if (observados.length === 0) return Array(7).fill(1);
  const promedio = observados.reduce((s, v) => s + v, 0) / observados.length;
  return crudos.map((v) => (v > 0 ? v / promedio : 1));
}

export type DiaProyectado = {
  fecha: string;
  ventas: number;
  mes: number;
  indiceMes: number;
};

export type ProyeccionEstacional = {
  dias: DiaProyectado[];
  porMes: { mes: string; ventas: number; dias: number; indice: number; confiable: boolean; repetido: boolean }[];
  total: number;
  /** Lo mismo proyectado sin estacionalidad, para poder comparar. */
  totalSinTemporada: number;
  perfil: PerfilEstacional;
};

/**
 * Proyecta ventas diarias hacia adelante.
 *
 * El nivel de arranque NO es la tendencia ajustada sobre toda la historia:
 * es el promedio de los últimos 28 días desestacionalizado. Ajustar el nivel
 * con un año entero lo ancla a precios viejos; lo que se extrapola del ajuste
 * largo es la FORMA (cuánto crece por día), no el punto de partida.
 *
 * El crecimiento se aplica a la mitad, igual que en la proyección simple:
 * extrapolar la pendiente completa a tres meses es lo que hace que estas
 * cuentas se vayan de escala.
 */
export function proyectarConTemporada(
  serie: DiaVentas[],
  opciones: { desde: string; dias: number; atenuacion?: number }
): ProyeccionEstacional | null {
  const perfil = construirPerfilEstacional(serie);
  if (!perfil) return null;

  const atenuacion = opciones.atenuacion ?? 0.5;
  const indicePorMes = new Map(perfil.meses.map((m) => [m.mes, m.indice]));
  const confiablePorMes = new Map(perfil.meses.map((m) => [m.mes, m.confiable]));
  const repetidoPorMes = new Map(perfil.meses.map((m) => [m.mes, m.repetido]));
  const dow = perfilDiaSemana(serie, perfil.tendencia, perfil.origen);

  // Nivel base: últimos 28 días con venta, desestacionalizados.
  const anteriores = serie
    .filter((d) => d.ventas > 0 && d.fecha < opciones.desde)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const recientes = anteriores.slice(-28);
  if (recientes.length < 14) return null;
  // Y que sean recientes de verdad. Sin este corte, una serie que termina
  // hace meses proyecta igual, tomando como "nivel actual" un promedio viejo
  // — el error más caro posible acá, porque no se nota mirando el gráfico.
  if (diasEntre(anteriores[anteriores.length - 1].fecha, opciones.desde) > MAX_DIAS_SIN_DATOS) return null;
  const nivel =
    recientes.reduce((s, d) => {
      const ajuste = (indicePorMes.get(mesDe(d.fecha)) ?? 1) * (dow[diaSemanaDe(d.fecha)] || 1);
      return s + (ajuste > 0 ? d.ventas / ajuste : d.ventas);
    }, 0) / recientes.length;

  const crecimiento = perfil.tendencia.crecimientoDiario * atenuacion;
  const dias: DiaProyectado[] = [];
  for (let i = 0; i < opciones.dias; i++) {
    const fecha = sumarDias(opciones.desde, i);
    const mes = mesDe(fecha);
    const indiceMes = indicePorMes.get(mes) ?? 1;
    const ventas = nivel * Math.pow(1 + crecimiento, i) * indiceMes * (dow[diaSemanaDe(fecha)] || 1);
    dias.push({ fecha, ventas: Math.max(0, ventas), mes, indiceMes });
  }

  const porMes = new Map<string, { ventas: number; dias: number; mes: number }>();
  for (const dia of dias) {
    const clave = dia.fecha.slice(0, 7);
    const acumulado = porMes.get(clave) ?? { ventas: 0, dias: 0, mes: dia.mes };
    acumulado.ventas += dia.ventas;
    acumulado.dias++;
    porMes.set(clave, acumulado);
  }

  return {
    dias,
    porMes: [...porMes.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, v]) => ({
        mes,
        ventas: v.ventas,
        dias: v.dias,
        indice: indicePorMes.get(v.mes) ?? 1,
        confiable: confiablePorMes.get(v.mes) ?? false,
        repetido: repetidoPorMes.get(v.mes) ?? false,
      })),
    total: dias.reduce((s, d) => s + d.ventas, 0),
    // El contrafáctico: el mismo nivel y la misma tendencia, sin el índice del
    // mes. Es lo que permite decir si la temporada aporta o sólo decora.
    totalSinTemporada: dias.reduce(
      (s, d, i) => s + nivel * Math.pow(1 + crecimiento, i) * (dow[diaSemanaDe(d.fecha)] || 1),
      0
    ),
    perfil,
  };
}

export type Comparacion = {
  /** Error absoluto porcentual ponderado, 0-1. */
  wape: number;
  dias: number;
  /** Cuánto se pasó (+) o se quedó corto (−) el total, en %. */
  sesgoPct: number;
};

function comparar(pares: { real: number; estimado: number }[]): Comparacion {
  const real = pares.reduce((s, p) => s + p.real, 0);
  const error = pares.reduce((s, p) => s + Math.abs(p.estimado - p.real), 0);
  const estimado = pares.reduce((s, p) => s + p.estimado, 0);
  return {
    wape: real > 0 ? error / real : 0,
    dias: pares.length,
    sesgoPct: real > 0 ? ((estimado - real) / real) * 100 : 0,
  };
}

/**
 * Mide la proyección estacional contra lo que realmente pasó, y contra la
 * alternativa boba de repetir el promedio de los últimos 28 días.
 *
 * Existe porque una proyección más sofisticada no es automáticamente mejor:
 * si no le gana al promedio simple, hay que decirlo en la pantalla en vez de
 * mostrar el modelo lindo.
 */
export function backtestEstacional(
  serie: DiaVentas[],
  opciones: { corte: string; horizonte: number }
): { conTemporada: Comparacion; sinTemporada: Comparacion; mejora: number } | null {
  const entrenamiento = serie.filter((d) => d.fecha < opciones.corte);
  const reales = new Map(
    serie
      .filter((d) => d.fecha >= opciones.corte && d.fecha < sumarDias(opciones.corte, opciones.horizonte))
      .map((d) => [d.fecha, d.ventas])
  );
  if (reales.size < 14) return null;

  const proyeccion = proyectarConTemporada(entrenamiento, {
    desde: opciones.corte,
    dias: opciones.horizonte,
  });
  if (!proyeccion) return null;

  const ultimos28 = entrenamiento
    .filter((d) => d.ventas > 0)
    .slice(-28)
    .reduce((s, d, _, lista) => s + d.ventas / lista.length, 0);

  const pares: { real: number; estimado: number }[] = [];
  const paresBase: { real: number; estimado: number }[] = [];
  for (const dia of proyeccion.dias) {
    const real = reales.get(dia.fecha);
    if (real == null || real <= 0) continue;
    pares.push({ real, estimado: dia.ventas });
    paresBase.push({ real, estimado: ultimos28 });
  }
  if (pares.length < 14) return null;

  const conTemporada = comparar(pares);
  const sinTemporada = comparar(paresBase);
  return {
    conTemporada,
    sinTemporada,
    // Positivo = la estacionalidad achicó el error.
    mejora: sinTemporada.wape > 0 ? ((sinTemporada.wape - conTemporada.wape) / sinTemporada.wape) * 100 : 0,
  };
}
