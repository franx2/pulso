/**
 * Agrega ventas cerradas en un patrón día×hora, promediado sobre las semanas
 * de la muestra. Misma lógica que se usó a mano para la primera carga (ver
 * HANDOFF), ahora reutilizable desde el sync con Fudo.
 */

export type VentaSimple = { createdAt: string };

export type FranjaDemanda = { diaSemana: number; hora: number; ventasProm: number };

/**
 * `desde`/`hasta` son instantes UTC exactos (el borde derecho es exclusivo).
 * `createdAt` de cada venta se interpreta como el instante UTC real: día de
 * semana y hora salen de los getters UTC, no de la timezone del proceso.
 */
export function agregarPorDiaHora(
  ventas: VentaSimple[],
  desde: Date,
  hasta: Date
): FranjaDemanda[] {
  const conteo = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const v of ventas) {
    const d = new Date(v.createdAt);
    if (d < desde || d >= hasta) continue;
    conteo[d.getUTCDay()][d.getUTCHours()]++;
  }

  const ocurrencias = Array(7).fill(0);
  for (let t = desde.getTime(); t < hasta.getTime(); t += 86_400_000) {
    ocurrencias[new Date(t).getUTCDay()]++;
  }

  const franjas: FranjaDemanda[] = [];
  for (let dia = 0; dia < 7; dia++) {
    if (ocurrencias[dia] === 0) continue;
    for (let hora = 0; hora < 24; hora++) {
      if (conteo[dia][hora] === 0) continue;
      franjas.push({ diaSemana: dia, hora, ventasProm: conteo[dia][hora] / ocurrencias[dia] });
    }
  }
  return franjas;
}
