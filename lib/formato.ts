/**
 * Cómo se escriben los números y las fechas en toda la app.
 *
 * Estaba copiado en ocho pantallas y había divergido: cinco archivos escribían
 * `$-629.415` y tres `-$629.415`. El primero es incorrecto —el signo va antes
 * del símbolo, como fija la regla de alineación numérica de DESIGN.md— y
 * aparecía en pantalla en la tabla de sectores.
 *
 * Una copia sola no puede divergir. Todo lo que muestre plata, cantidades,
 * porcentajes o fechas importa de acá.
 */

const AR = "es-AR";

/**
 * Plata. **El signo va antes del símbolo**: `-$1.234`, nunca `$-1.234`.
 *
 * Se redondea a peso entero porque en esta operación los centavos no deciden
 * nada y las columnas se leen mejor sin ellos.
 */
export function plata(n: number): string {
  // El signo se decide DESPUÉS de redondear: si no, una diferencia de −0,4
  // aparece como "-$0", que en pantalla no significa nada.
  const entero = Math.round(Math.abs(n));
  const signo = n < 0 && entero > 0 ? "-" : "";
  return `${signo}$${entero.toLocaleString(AR)}`;
}

/**
 * Plata abreviada para cuando el ancho manda: `$1,2M`, `-$340k`.
 *
 * Sólo para tarjetas y ejes. Una tabla comparable siempre lleva la cifra
 * completa: abreviar dos columnas que se restan entre sí impide verificarlas.
 */
export function plataCompacta(n: number): string {
  const signo = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${signo}$${(abs / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${signo}$${Math.round(abs / 1_000).toLocaleString(AR)}k`;
  return `${signo}$${Math.round(abs).toLocaleString(AR)}`;
}

/** Cantidades: unidades, tickets, productos. */
export function numero(n: number, decimales = 0): string {
  return n.toLocaleString(AR, { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}

export function numeroCompacto(n: number): string {
  return new Intl.NumberFormat(AR, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/**
 * Porcentaje con signo explícito cuando es una variación.
 *
 * `null` se escribe como guion largo y no como `0%`: no es lo mismo "no
 * cambió" que "no se puede comparar", y confundirlos fue el bug que ya
 * apareció tres veces en este proyecto.
 */
export function porcentaje(n: number | null | undefined, opciones: { signo?: boolean; decimales?: number } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const { signo = false, decimales = 1 } = opciones;
  const prefijo = signo && n >= 0 ? "+" : "";
  return `${prefijo}${n.toFixed(decimales)}%`;
}

export function kilos(n: number): string {
  return `${numero(n, 1)} kg`;
}

/**
 * Las fechas de este sistema son días calendario argentinos guardados como
 * "YYYY-MM-DD" o como medianoche UTC. Se formatean al mediodía UTC para que
 * ningún huso las corra un día: es el mismo cuidado que `lib/fechaAR.ts`.
 */
const alMediodia = (dia: string) => new Date(`${dia.slice(0, 10)}T12:00:00.000Z`);

/**
 * Un `Date` se lee por sus campos locales, no por su ISO.
 *
 * Las pantallas que arman fechas con `new Date(...)` — el Gantt de la semana,
 * presencia, mis solicitudes — trabajan en calendario local. Pasarlas por
 * `toISOString()` las correría un día en cualquier huso al oeste de Greenwich.
 */
const claveLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const clave = (dia: string | Date) => (typeof dia === "string" ? dia : claveLocal(dia));

/**
 * Se arma por partes en vez de usar el formato corto del locale porque
 * `es-AR` devuelve "28-ago", con guion. El guion lee como un rango y en una
 * tabla de fechas confunde; el resto de la app ya escribe "28 ago".
 */
function partes(dia: string, opciones: Intl.DateTimeFormatOptions): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat(AR, { timeZone: "UTC", ...opciones }).formatToParts(alMediodia(dia))) {
    if (p.type !== "literal") salida[p.type] = p.value;
  }
  return salida;
}

/** "28 ago" — para ejes, chips y celdas apretadas. */
export function fechaCorta(dia: string | Date): string {
  const p = partes(clave(dia), { day: "2-digit", month: "short" });
  return `${p.day} ${p.month.replace(".", "")}`;
}

/** "28 ago 2026" — cuando el año importa, como en un rango que cruza enero. */
export function fechaLarga(dia: string): string {
  const p = partes(dia, { day: "2-digit", month: "short", year: "numeric" });
  return `${p.day} ${p.month.replace(".", "")} ${p.year}`;
}

/** "viernes 28 de agosto de 2026" — encabezados de un día concreto. */
export function fechaCompleta(dia: string): string {
  return alMediodia(dia).toLocaleDateString(AR, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "agosto 2026", de una clave "2026-08". */
export function mesLargo(mes: string): string {
  return alMediodia(`${mes}-15`).toLocaleDateString(AR, { timeZone: "UTC", month: "long", year: "numeric" });
}

/** "28 ago – 5 sep": un rango, sin repetir el mes cuando es el mismo. */
export function rango(desde: string, hasta: string): string {
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  const inicio = mismoMes ? partes(desde, { day: "2-digit" }).day : fechaCorta(desde);
  return `${inicio} – ${fechaCorta(hasta)}`;
}
