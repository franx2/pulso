/**
 * Métricas de error y backtesting (puntos 14 y 15).
 *
 * WAPE es la métrica principal y no MAPE: con franjas de 30 minutos hay
 * muchos ceros y valores chicos, y MAPE explota o se indefine ahí. WAPE
 * (error absoluto total / volumen total) es estable y se lee directo como
 * "erramos un 18% del volumen".
 */

export type Par = { pronosticado: number; real: number };

export type Metricas = {
  n: number;
  mae: number;
  rmse: number;
  /** 0..1 */
  wape: number;
  /** Sesgo: >0 el modelo pronostica de más. */
  sesgo: number;
  volumenReal: number;
};

export function calcularMetricas(pares: Par[]): Metricas {
  if (pares.length === 0) {
    return { n: 0, mae: 0, rmse: 0, wape: 0, sesgo: 0, volumenReal: 0 };
  }
  let sumaAbs = 0;
  let sumaCuad = 0;
  let sumaDif = 0;
  let volumen = 0;

  for (const p of pares) {
    const dif = p.pronosticado - p.real;
    sumaAbs += Math.abs(dif);
    sumaCuad += dif * dif;
    sumaDif += dif;
    volumen += Math.abs(p.real);
  }

  return {
    n: pares.length,
    mae: sumaAbs / pares.length,
    rmse: Math.sqrt(sumaCuad / pares.length),
    wape: volumen > 0 ? sumaAbs / volumen : 0,
    sesgo: sumaDif / pares.length,
    volumenReal: volumen,
  };
}

/**
 * Intervalo de confianza. La incertidumbre sale del desvío observado en esa
 * celda del perfil, ensanchado cuando hay pocas muestras: con 2 ocurrencias
 * de un martes 21:00 el rango tiene que ser mucho más ancho que con 12.
 */
export function intervalo(
  esperado: number,
  desvio: number,
  muestras: number
): { min: number; max: number; confianza: number } {
  // Con n chico el error estándar de la media crece; el factor 1.96 sería el
  // 95% normal, pero se penaliza además por muestra escasa.
  const penalizacion = muestras >= 8 ? 1 : muestras >= 4 ? 1.4 : 2;
  const margen = 1.96 * (desvio / Math.sqrt(Math.max(muestras, 1))) * penalizacion;

  // La confianza reportada baja con la muestra y con la dispersión relativa.
  const dispersion = esperado > 0 ? desvio / esperado : 1;
  const confianza = Math.max(
    0.4,
    Math.min(0.92, (muestras >= 8 ? 0.85 : muestras >= 4 ? 0.7 : 0.55) - Math.min(dispersion, 1) * 0.2)
  );

  return {
    min: Math.max(0, esperado - margen),
    max: esperado + margen,
    confianza,
  };
}

/**
 * Compara métodos sobre los mismos datos y devuelve el mejor por WAPE. Es la
 * forma de cumplir el punto 17 (elegir por backtesting, no por preferencia).
 */
export function elegirMejorMetodo<T extends string>(
  resultados: Record<T, Par[]>
): { metodo: T; metricas: Metricas; ranking: { metodo: T; wape: number }[] } {
  const ranking = (Object.keys(resultados) as T[])
    .map((metodo) => ({ metodo, wape: calcularMetricas(resultados[metodo]).wape }))
    .sort((a, b) => a.wape - b.wape);

  const metodo = ranking[0].metodo;
  return { metodo, metricas: calcularMetricas(resultados[metodo]), ranking };
}
