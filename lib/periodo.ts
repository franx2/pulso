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

import { diaDeFechaSql, diasEntre, fechaSql, hoyAR, sumarDias } from "@/lib/fechaAR";

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

// --- El período que elige la persona, compartido por todas las pantallas ---

export type Periodo = "hoy" | "semana" | "mes" | "mtd" | "mes-calendario" | "anio-calendario" | "rango";

export type ValorPeriodo = {
  periodo: Periodo;
  /** "AAAA-MM", sólo con `mes-calendario`. */
  mes: string;
  /** "AAAA", sólo con `anio-calendario`. */
  anio: string;
  /** "AAAA-MM-DD", sólo con `rango`. */
  desde: string;
  hasta: string;
};

const PERIODOS: Periodo[] = ["hoy", "semana", "mes", "mtd", "mes-calendario", "anio-calendario", "rango"];

/** "Este mes" es `mtd` y no un mes fijo: elegido en noviembre, en diciembre
 * tiene que seguir siendo "este mes" y no quedarse clavado en noviembre. */
export function valorPorDefecto(hoy: string): ValorPeriodo {
  return { periodo: "mtd", mes: hoy.slice(0, 7), anio: hoy.slice(0, 4), desde: sumarDias(hoy, -29), hasta: hoy };
}

/** Lo que venga de la URL o del navegador, validado; lo inválido cae al defecto. */
export function normalizarPeriodo(crudo: Partial<Record<keyof ValorPeriodo, unknown>> | null, hoy: string): ValorPeriodo {
  const base = valorPorDefecto(hoy);
  if (!crudo || !PERIODOS.includes(crudo.periodo as Periodo)) return base;
  const v: ValorPeriodo = {
    periodo: crudo.periodo as Periodo,
    mes: typeof crudo.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(crudo.mes) && crudo.mes <= hoy.slice(0, 7) ? crudo.mes : base.mes,
    anio: typeof crudo.anio === "string" && /^\d{4}$/.test(crudo.anio) && crudo.anio <= hoy.slice(0, 4) ? crudo.anio : base.anio,
    desde: fechaValida(crudo.desde as string) ? (crudo.desde as string) : base.desde,
    hasta: fechaValida(crudo.hasta as string) ? (crudo.hasta as string) : base.hasta,
  };
  if (v.hasta > hoy) v.hasta = hoy;
  if (v.desde > v.hasta) v.desde = v.hasta;
  // El mes en curso elegido a mano es "este mes".
  if (v.periodo === "mes-calendario" && v.mes === hoy.slice(0, 7)) v.periodo = "mtd";
  return v;
}

/** Los parámetros de consulta que corresponden al valor elegido. */
export function parametrosDe(valor: ValorPeriodo): URLSearchParams {
  const params = new URLSearchParams({ periodo: valor.periodo });
  if (valor.periodo === "mes-calendario") params.set("mes", valor.mes);
  if (valor.periodo === "anio-calendario") params.set("anio", valor.anio);
  if (valor.periodo === "rango") {
    params.set("desde", valor.desde);
    params.set("hasta", valor.hasta);
  }
  return params;
}

const sumarMeses = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${f.getUTCFullYear()}-${pad(f.getUTCMonth() + 1)}`;
};

/**
 * El período anterior (`-1`) o el siguiente (`1`), del mismo largo que el
 * actual. Null si el siguiente cae en el futuro: no hay datos de mañana.
 *
 * Un mes va al mes de al lado y un año al año de al lado; una ventana de días
 * ("últimos 7") se corre entera, así que la anterior a "últimos 7 días" son
 * los 7 días de antes y no una semana calendario.
 */
export function moverPeriodo(v: ValorPeriodo, dir: -1 | 1, hoy: string): ValorPeriodo | null {
  const mesHoy = hoy.slice(0, 7);
  if (v.periodo === "mtd" || v.periodo === "mes-calendario") {
    const mes = sumarMeses(v.periodo === "mtd" ? mesHoy : v.mes, dir);
    if (mes > mesHoy) return null;
    return { ...v, periodo: mes === mesHoy ? "mtd" : "mes-calendario", mes };
  }
  if (v.periodo === "anio-calendario") {
    const anio = String(Number(v.anio) + dir);
    if (anio > hoy.slice(0, 4)) return null;
    return { ...v, anio };
  }
  const { desde, hasta, dias } = rangoDias(parametrosDe(v), hoy);
  if (dir === 1 && hasta >= hoy) return null;
  let nuevoDesde = sumarDias(desde, dias * dir);
  let nuevoHasta = sumarDias(hasta, dias * dir);
  // Hacia adelante no se pasa de hoy: se apoya en hoy con el mismo largo.
  if (nuevoHasta > hoy) {
    nuevoHasta = hoy;
    nuevoDesde = sumarDias(hoy, -(dias - 1));
  }
  if (nuevoDesde === hoy && nuevoHasta === hoy) return { ...v, periodo: "hoy" };
  return { ...v, periodo: "rango", desde: nuevoDesde, hasta: nuevoHasta };
}

/**
 * El mismo rango pero en días calendario ("AAAA-MM-DD"), que es como lo
 * consumen las pantallas de compras y sectores.
 *
 * Devolver el rango ya resuelto no es decorativo: `rango` se recorta a
 * `MAX_DIAS_RANGO` y un mes en curso se corta hoy, así que lo que se midió
 * no siempre es lo que se pidió. La pantalla tiene que mostrar lo primero.
 */
export function rangoDias(params: URLSearchParams, hoy = hoyAR()) {
  const r = resolverRango(params, hoy);
  return {
    periodo: r.periodo,
    desde: diaDeFechaSql(r.inicioActual),
    hasta: diaDeFechaSql(r.finActual),
    dias: r.dias,
  };
}
