/**
 * Manejo de días calendario.
 *
 * Conviven dos representaciones y mezclarlas corre los resultados un día entero:
 *
 * - `Fichaje.timestamp` es un instante absoluto: se acota con el arranque y el
 *   cierre del día ARGENTINO, que en UTC son las 03:00 y las 02:59:59.999 del
 *   día siguiente.
 * - `Turno.fecha` es `@db.Date`: Postgres guarda el día pelado y Prisma lo
 *   devuelve como medianoche UTC, así que se acota con medianoche UTC.
 *
 * Nada de acá usa los getters locales de `Date`. Los usó hasta 2026-09 y eso
 * fue un bug de 21 horas en producción: Vercel corre en UTC, así que entre las
 * 21:00 y las 24:00 argentinas el proceso ya estaba en el día siguiente y los
 * fichajes, los reportes y los turnos se iban de día. Vercel además rechaza
 * `TZ` como nombre de variable de entorno, así que no había forma de arreglarlo
 * seteando la zona: la aritmética tiene que ser explícita. El offset vive en
 * `lib/fechaAR.ts`.
 */

import { claveDiaAR, finDiaAR, inicioDiaAR, fechaSql, sumarDias } from "@/lib/fechaAR";

/** Medianoche argentina del día de `d` (para filtrar instantes absolutos). */
export function inicioDelDia(d = new Date()): Date {
  return inicioDiaAR(claveDiaAR(d));
}

/** Último milisegundo del día argentino de `d`. */
export function finDelDia(d = new Date()): Date {
  return finDiaAR(claveDiaAR(d));
}

/** "2026-08-28" a medianoche argentina. */
export function desdeISO(iso: string): Date {
  return inicioDiaAR(iso);
}

/** El mismo día calendario argentino, pero como medianoche UTC (`@db.Date`). */
export function comoFechaSql(d = new Date()): Date {
  return fechaSql(claveDiaAR(d));
}

/** Clave YYYY-MM-DD del día argentino de un instante. */
export function claveDia(d: Date): string {
  return claveDiaAR(d);
}

/**
 * Clave YYYY-MM-DD de un campo `@db.Date` (llega como medianoche UTC).
 * Usar `claveDia` acá lo correría un día: un `@db.Date` no es un instante
 * argentino, es un día pelado.
 */
export function claveFechaSql(d: Date): string {
  return d.toISOString().slice(0, 10);
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
  const dia = claveDiaAR(d);
  const fecha = fechaSql(dia);
  const diaSemana = (fecha.getUTCDay() + 6) % 7; // lunes = 0
  const jueves = fechaSql(sumarDias(dia, 3 - diaSemana));

  const anio = jueves.getUTCFullYear();
  const cuatroDeEnero = fechaSql(`${anio}-01-04`);
  const primerJueves = fechaSql(
    sumarDias(`${anio}-01-04`, 3 - ((cuatroDeEnero.getUTCDay() + 6) % 7))
  );

  const semana = 1 + Math.round((jueves.getTime() - primerJueves.getTime()) / (7 * 86_400_000));
  return `${anio}-W${String(semana).padStart(2, "0")}`;
}

/**
 * Muestra un campo `@db.Date` que llegó serializado como ISO.
 *
 * Viene como medianoche UTC ("2026-08-28T00:00:00.000Z"); formatearlo directo
 * en una zona al oeste de Greenwich lo corre al día anterior. Se formatea con
 * `timeZone: "UTC"` para que el día calendario sea el que se guardó, sin
 * depender de dónde corra el proceso.
 */
export function formatearFechaSql(
  iso: string,
  opciones: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }
): string {
  return new Date(iso).toLocaleDateString("es-AR", { ...opciones, timeZone: "UTC" });
}
