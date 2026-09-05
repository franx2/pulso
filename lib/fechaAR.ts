/**
 * Hora argentina, sin depender del timezone del proceso.
 *
 * Todo el sistema razona en días calendario argentinos: el negocio cierra la
 * caja por día trabajado, no por día UTC. El proceso, en cambio, corre en UTC
 * en Vercel y en `America/Argentina/Buenos_Aires` en la máquina de desarrollo,
 * así que **ningún getter local de `Date` sirve**: `getFullYear`, `getMonth`,
 * `getDate` y `getHours` devuelven cosas distintas según dónde corran.
 *
 * Este módulo es el único lugar donde vive el offset. Antes estaba copiado en
 * siete archivos y eso fue exactamente lo que dejó pasar el bug de
 * `lib/fechas.ts`: no había un lugar al que converger.
 *
 * Argentina no aplica horario de verano desde 2009, así que el offset es fijo.
 * Si algún día vuelve, este archivo es el único que hay que tocar.
 */

export const OFFSET_AR_MS = 3 * 60 * 60 * 1000;

/** Instante absoluto → día calendario argentino, "YYYY-MM-DD". */
export function claveDiaAR(instante: Date | string): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return new Date(d.getTime() - OFFSET_AR_MS).toISOString().slice(0, 10);
}

/** El día argentino de hoy, "YYYY-MM-DD". */
export function hoyAR(): string {
  return claveDiaAR(new Date());
}

/** Corre un día calendario, sin pasar por husos ni por horario de verano. */
export function sumarDias(dia: string, cantidad: number): string {
  const d = new Date(`${dia}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + cantidad);
  return d.toISOString().slice(0, 10);
}

/** Día calendario → el `Date` con el que se consulta un campo `@db.Date`.
 * Prisma guarda el día pelado y lo devuelve como medianoche UTC. */
export function fechaSql(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

/** La vuelta de `fechaSql`: un `@db.Date` que llegó de Prisma → "YYYY-MM-DD". */
export function diaDeFechaSql(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Instante absoluto de las 00:00 argentinas de ese día. */
export function inicioDiaAR(dia: string): Date {
  return new Date(fechaSql(dia).getTime() + OFFSET_AR_MS);
}

/** Último milisegundo del día argentino, para acotar rangos de instantes. */
export function finDiaAR(dia: string): Date {
  return new Date(inicioDiaAR(sumarDias(dia, 1)).getTime() - 1);
}

/** Días entre dos días calendario, inclusive de ambos extremos. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((fechaSql(hasta).getTime() - fechaSql(desde).getTime()) / 86400000) + 1;
}
