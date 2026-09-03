/** Un día ya resuelto: cuántas horas trabajó, con qué clave (YYYY-MM-DD). */
export type DiaPago = { clave: string; horas: number };

/**
 * Monto a pagar de un período: horas × precio/hora, con el multiplicador de
 * feriado del local aplicado a los días que caen en el calendario nacional.
 *
 * Sin precio/hora cargado, no hay monto — no se inventa un valor.
 */
export function calcularMonto({
  dias,
  precioHora,
  feriados,
  multiplicadorFeriado = 2,
}: {
  dias: DiaPago[];
  precioHora: number | null | undefined;
  feriados: ReadonlySet<string>;
  multiplicadorFeriado?: number;
}): number {
  if (!precioHora) return 0;
  let total = 0;
  for (const d of dias) {
    const factor = feriados.has(d.clave) ? multiplicadorFeriado : 1;
    total += d.horas * precioHora * factor;
  }
  return total;
}
