/**
 * Qué período se mira y contra qué se compara.
 *
 * Vive acá y no dentro de la ruta porque es la parte del tablero que más
 * fácil miente: comparar contra una ventana incompleta inventa variaciones.
 * Ya pasó tres veces (un local con 6 días sin sincronizar reportó +922%), así
 * que esta cuenta necesita poder testearse sola. Una ruta de Next sólo puede
 * exportar handlers, así que no alcanzaba con exportarla de ahí.
 *
 * Todo se resuelve en días calendario argentinos y se devuelve como
 * medianoche UTC, que es como Prisma guarda y devuelve los campos `@db.Date`.
 */

import { diasEntre, fechaSql, hoyAR, sumarDias } from "@/lib/fechaAR";

/** Presets rápidos: ventanas móviles que terminan hoy. Mes y año calendario
 * se resuelven aparte, para poder navegar historia sin mezclar criterios. */
const DIAS_POR_PERIODO: Record<string, number> = { hoy: 1, semana: 7, mes: 30, anio: 365 };

/** Tope del rango a medida. Dos años ya es más de lo que hay cargado y evita
 * que un rango tipeado a mano barra la tabla entera. */
export const MAX_DIAS_RANGO = 730;

export type RangoResuelto = {
  periodo: string;
  inicioActual: Date;
  finActual: Date;
  inicioPrevio: Date;
  finPrevio: Date;
  dias: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Cuántos días tiene un mes (mes va de 1 a 12). */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function fechaValida(valor: string | null | undefined): valor is string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = fechaSql(valor);
  // Rechaza el 31 de febrero: `Date` lo acepta y lo corre a marzo.
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

/**
 * `hoy` se puede inyectar para testear; en producción sale de `hoyAR()`.
 */
export function resolverRango(params: URLSearchParams, hoy = hoyAR()): RangoResuelto {
  const periodo = params.get("periodo") ?? "semana";

  if (periodo === "mes-calendario" && /^\d{4}-\d{2}$/.test(params.get("mes") ?? "")) {
    const [anio, mes] = params.get("mes")!.split("-").map(Number);
    if (mes >= 1 && mes <= 12) {
      // Un mes en curso se compara sólo hasta el día de hoy: contra el mes
      // pasado entero siempre daría una caída que no existe.
      const esMesActual = hoy.startsWith(`${anio}-${pad(mes)}`);
      const diaFin = esMesActual ? Number(hoy.slice(8, 10)) : ultimoDiaDelMes(anio, mes);
      const fechaMesPrevio = new Date(Date.UTC(anio, mes - 2, 1));
      const anioPrevio = fechaMesPrevio.getUTCFullYear();
      const mesPrevio = fechaMesPrevio.getUTCMonth() + 1;
      // El mes pasado puede tener menos días (31/3 contra febrero): se recorta
      // al último que exista en vez de saltar de mes.
      const diaFinPrevio = Math.min(diaFin, ultimoDiaDelMes(anioPrevio, mesPrevio));
      const inicioActual = fechaSql(`${anio}-${pad(mes)}-01`);
      const finActual = fechaSql(`${anio}-${pad(mes)}-${pad(diaFin)}`);
      return {
        periodo,
        inicioActual,
        finActual,
        inicioPrevio: fechaSql(`${anioPrevio}-${pad(mesPrevio)}-01`),
        finPrevio: fechaSql(`${anioPrevio}-${pad(mesPrevio)}-${pad(diaFinPrevio)}`),
        dias: diasEntre(`${anio}-${pad(mes)}-01`, `${anio}-${pad(mes)}-${pad(diaFin)}`),
      };
    }
  }

  if (periodo === "anio-calendario" && /^\d{4}$/.test(params.get("anio") ?? "")) {
    const anio = Number(params.get("anio"));
    const anioActual = Number(hoy.slice(0, 4));
    // El año en curso se corta hoy; uno cerrado va completo.
    const fin = anio === anioActual ? hoy.slice(5) : "12-31";
    // Los bisiestos van de cuatro en cuatro, así que el año anterior a uno
    // bisiesto nunca lo es: si acá estamos parados un 29 de febrero, del otro
    // lado hay 28 sí o sí.
    const finPrevio = fin === "02-29" ? "02-28" : fin;
    return {
      periodo,
      inicioActual: fechaSql(`${anio}-01-01`),
      finActual: fechaSql(`${anio}-${fin}`),
      inicioPrevio: fechaSql(`${anio - 1}-01-01`),
      finPrevio: fechaSql(`${anio - 1}-${finPrevio}`),
      dias: diasEntre(`${anio}-01-01`, `${anio}-${fin}`),
    };
  }

  if (periodo === "mtd") {
    const [anio, mes, dia] = hoy.split("-").map(Number);
    const mesPrevio = mes === 1 ? 12 : mes - 1;
    const anioPrevio = mes === 1 ? anio - 1 : anio;
    const diaFinPrevio = Math.min(dia, ultimoDiaDelMes(anioPrevio, mesPrevio));
    return {
      periodo,
      inicioActual: fechaSql(`${hoy.slice(0, 8)}01`),
      finActual: fechaSql(hoy),
      inicioPrevio: fechaSql(`${anioPrevio}-${pad(mesPrevio)}-01`),
      finPrevio: fechaSql(`${anioPrevio}-${pad(mesPrevio)}-${pad(diaFinPrevio)}`),
      dias: dia,
    };
  }

  const desdeParam = params.get("desde");
  const hastaParam = params.get("hasta");
  if (fechaValida(desdeParam) && fechaValida(hastaParam) && desdeParam <= hastaParam) {
    const dias = Math.min(diasEntre(desdeParam, hastaParam), MAX_DIAS_RANGO);
    // Si el rango pedido se pasa del tope se recorta el final, no el arranque:
    // la respuesta devuelve el rango ya resuelto para que la pantalla muestre
    // el que realmente se midió y no el que se pidió.
    const hastaReal = sumarDias(desdeParam, dias - 1);
    const finPrevio = sumarDias(desdeParam, -1);
    return {
      periodo: "rango",
      inicioActual: fechaSql(desdeParam),
      finActual: fechaSql(hastaReal),
      inicioPrevio: fechaSql(sumarDias(finPrevio, -(dias - 1))),
      finPrevio: fechaSql(finPrevio),
      dias,
    };
  }

  const dias = DIAS_POR_PERIODO[periodo] ?? 7;
  return {
    periodo,
    inicioActual: fechaSql(sumarDias(hoy, -(dias - 1))),
    finActual: fechaSql(hoy),
    inicioPrevio: fechaSql(sumarDias(hoy, -(dias * 2 - 1))),
    finPrevio: fechaSql(sumarDias(hoy, -dias)),
    dias,
  };
}
