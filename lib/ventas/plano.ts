/**
 * El plano de un salón: una grilla donde cada mesa ocupa una fila y una o dos
 * columnas (las grandes son rectangulares, como en Fudo). Puro, para que la
 * pantalla y el servidor decidan lo mismo sobre si una mesa entra o pisa otra.
 */

export type MesaPlano = { id: string; fila: number; columna: number; tamano: "CHICA" | "GRANDE" };

export const ancho = (m: Pick<MesaPlano, "tamano">) => (m.tamano === "GRANDE" ? 2 : 1);

/** Las celdas "fila:columna" que ocupa una mesa. */
export function celdas(m: Pick<MesaPlano, "fila" | "columna" | "tamano">): string[] {
  return Array.from({ length: ancho(m) }, (_, k) => `${m.fila}:${m.columna + k}`);
}

/** Si la mesa, puesta ahí, pisa a otra del salón (ella misma no cuenta). */
export function choca(mesas: MesaPlano[], candidata: MesaPlano): boolean {
  if (candidata.fila < 0 || candidata.columna < 0) return true;
  const ocupadas = new Set(mesas.filter((m) => m.id !== candidata.id).flatMap(celdas));
  return celdas(candidata).some((c) => ocupadas.has(c));
}

/** El primer lugar libre recorriendo la grilla por filas, para una mesa nueva. */
export function primerLugarLibre(mesas: MesaPlano[], tamano: MesaPlano["tamano"], columnas: number) {
  for (let fila = 0; ; fila++) {
    for (let columna = 0; columna + ancho({ tamano }) <= Math.max(columnas, ancho({ tamano })); columna++) {
      if (!choca(mesas, { id: "", fila, columna, tamano })) return { fila, columna };
    }
  }
}

/** Filas y columnas que necesita el plano para mostrar todas las mesas. */
export function tamanoGrilla(mesas: MesaPlano[]) {
  return {
    filas: mesas.length ? Math.max(...mesas.map((m) => m.fila)) + 1 : 1,
    columnas: mesas.length ? Math.max(...mesas.map((m) => m.columna + ancho(m))) : 1,
  };
}
