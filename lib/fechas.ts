/**
 * Manejo de días calendario.
 *
 * Conviven dos representaciones y mezclarlas corre los resultados un día entero:
 *
 * - `Fichaje.timestamp` es un instante absoluto: se acota con horas locales.
 * - `Turno.fecha` es `@db.Date`: Postgres guarda el día pelado y Prisma lo
 *   devuelve como medianoche UTC, así que se acota con medianoche UTC.
 *
 * "Local" acá significa la zona horaria del proceso, que debe ser la del
 * restaurante: en Railway se fija con la variable de entorno TZ.
 */

/** Medianoche local del día de `d` (para filtrar instantes absolutos). */
export function inicioDelDia(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Último milisegundo local del día de `d`. */
export function finDelDia(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** "2026-08-28" a medianoche local. */
export function desdeISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** El mismo día calendario, pero como medianoche UTC (para campos `@db.Date`). */
export function comoFechaSql(d = new Date()): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Clave YYYY-MM-DD del día local de un instante. */
export function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Clave YYYY-MM-DD de un campo `@db.Date` (llega como medianoche UTC).
 * Usar `claveDia` acá lo correría un día en cualquier zona al oeste de
 * Greenwich, como Argentina.
 */
export function claveFechaSql(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Clave de semana ISO ("2026-W35"), con la semana arrancando el lunes.
 *
 * Necesaria para las horas extra: el tope semanal se compara contra cada
 * semana por separado. Sumar un mes entero y restarle 48 daría un disparate.
 * Se usa el jueves de la semana para decidir el año, como manda ISO 8601: así
 * el 1 de enero que cae domingo pertenece a la última semana del año anterior.
 */
export function claveSemana(d: Date): string {
  const jueves = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diaSemana = (jueves.getDay() + 6) % 7; // lunes = 0
  jueves.setDate(jueves.getDate() - diaSemana + 3);

  const primerJueves = new Date(jueves.getFullYear(), 0, 4);
  const diaPrimero = (primerJueves.getDay() + 6) % 7;
  primerJueves.setDate(primerJueves.getDate() - diaPrimero + 3);

  const semana = 1 + Math.round((jueves.getTime() - primerJueves.getTime()) / (7 * 86_400_000));
  return `${jueves.getFullYear()}-W${String(semana).padStart(2, "0")}`;
}

/**
 * Muestra un campo `@db.Date` que llegó serializado como ISO.
 *
 * Viene como medianoche UTC ("2026-08-28T00:00:00.000Z"); formatearlo directo
 * en una zona al oeste de Greenwich lo corre al día anterior. Se reconstruye
 * con las partes UTC para que el día calendario sea el que se guardó.
 */
export function formatearFechaSql(
  iso: string,
  opciones: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }
): string {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toLocaleDateString(
    "es-AR",
    opciones
  );
}
