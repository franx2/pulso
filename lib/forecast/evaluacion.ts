import { db } from "@/lib/db";
import { calcularMetricas, elegirMejorMetodo, type Metricas, type Par } from "./backtest";
import { calcularKTrend, claveCelda, construirPerfil, type Observacion } from "./perfil";

/**
 * Backtesting (punto 15): se corta la historia en una fecha, se pronostica lo
 * que sigue y se compara contra lo que realmente pasó. Nada del período
 * evaluado entra al modelo — ni para el perfil, ni para la tendencia.
 *
 * Se comparan cuatro métodos (punto 17), del más tonto al menos tonto, para
 * elegir por evidencia y no por preferencia:
 *  - `ingenuo`: la última semana igual (mismo día, misma franja).
 *  - `promedioSimple`: promedio del mismo día/franja, sin ponderar.
 *  - `ponderado`: promedio con decaimiento temporal (el del motor).
 *  - `ponderadoTrend`: el anterior × K_trend.
 */

export type Metodo = "ingenuo" | "promedioSimple" | "ponderado" | "ponderadoTrend";

const fechaSql = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaSemanaDe = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();

export async function backtestLocal(
  localId: string,
  opciones: { corte: string; horizonte?: number; ventana?: number }
): Promise<{
  local: string;
  n: number;
  porMetodo: Record<Metodo, Metricas>;
  mejor: Metodo;
  porDia: { fecha: string; wape: number; realTickets: number; pronosticado: number }[];
}> {
  const horizonte = opciones.horizonte ?? 15;
  const ventana = opciones.ventana ?? 90;
  const { corte } = opciones;

  const local = await db.local.findUniqueOrThrow({ where: { id: localId } });

  const [entrenamiento, evaluacion] = await Promise.all([
    db.demandaSlot.findMany({
      where: { localId, fecha: { gte: fechaSql(sumarDias(corte, -ventana)), lt: fechaSql(corte) } },
    }),
    db.demandaSlot.findMany({
      where: { localId, fecha: { gte: fechaSql(corte), lt: fechaSql(sumarDias(corte, horizonte)) } },
    }),
  ]);

  const obs: Observacion[] = entrenamiento.map((f) => ({
    fecha: f.fecha.toISOString().slice(0, 10),
    slot: f.slot,
    tickets: f.tickets,
    unidades: f.unidades,
    ventas: f.ventas,
  }));

  const perfilPonderado = construirPerfil(obs, corte);
  // Promedio simple = el mismo perfil con decaimiento neutro; se arma a mano
  // para no tocar la firma del constructor.
  const simplePorCelda = new Map<string, { suma: number; n: number }>();
  const ultimaSemana = new Map<string, number>();
  for (const o of obs) {
    const clave = claveCelda(diaSemanaDe(o.fecha), o.slot);
    const acc = simplePorCelda.get(clave) ?? { suma: 0, n: 0 };
    acc.suma += o.tickets;
    acc.n++;
    simplePorCelda.set(clave, acc);
    // La ocurrencia más reciente de esa celda es el método ingenuo.
    ultimaSemana.set(clave, o.tickets);
  }

  const trend = calcularKTrend(obs, corte);

  const pares: Record<Metodo, Par[]> = {
    ingenuo: [],
    promedioSimple: [],
    ponderado: [],
    ponderadoTrend: [],
  };
  const porDiaAcc = new Map<string, { real: number; pron: number; absErr: number }>();

  for (const f of evaluacion) {
    const fecha = f.fecha.toISOString().slice(0, 10);
    const clave = claveCelda(diaSemanaDe(fecha), f.slot);
    const real = f.tickets;

    const ponderado = perfilPonderado.celdas.get(clave)?.tickets ?? 0;
    const simple = simplePorCelda.has(clave)
      ? simplePorCelda.get(clave)!.suma / simplePorCelda.get(clave)!.n
      : 0;

    pares.ingenuo.push({ pronosticado: ultimaSemana.get(clave) ?? 0, real });
    pares.promedioSimple.push({ pronosticado: simple, real });
    pares.ponderado.push({ pronosticado: ponderado, real });
    pares.ponderadoTrend.push({ pronosticado: ponderado * trend.k, real });

    const acc = porDiaAcc.get(fecha) ?? { real: 0, pron: 0, absErr: 0 };
    acc.real += real;
    acc.pron += ponderado * trend.k;
    acc.absErr += Math.abs(ponderado * trend.k - real);
    porDiaAcc.set(fecha, acc);
  }

  const elegido = elegirMejorMetodo(pares);

  return {
    local: local.nombre,
    n: evaluacion.length,
    porMetodo: {
      ingenuo: calcularMetricas(pares.ingenuo),
      promedioSimple: calcularMetricas(pares.promedioSimple),
      ponderado: calcularMetricas(pares.ponderado),
      ponderadoTrend: calcularMetricas(pares.ponderadoTrend),
    },
    mejor: elegido.metodo,
    porDia: [...porDiaAcc.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, v]) => ({
        fecha,
        wape: v.real > 0 ? v.absErr / v.real : 0,
        realTickets: v.real,
        pronosticado: v.pron,
      })),
  };
}

/** Ventanas candidatas. Un año está incluido a propósito para que el propio
 * backtest muestre si conviene, no para descartarlo por prejuicio. */
export const VENTANAS_CANDIDATAS = [45, 90, 180, 365];

/**
 * Elige, por local, cuánta historia conviene usar para el perfil, midiendo
 * cada candidata contra lo que realmente pasó.
 *
 * Hace falta porque la respuesta NO es la misma para todos: en la primera
 * medición dio 45 días para dos locales, 90 para otro y 180 para el cuarto.
 * Un año perdió en los cuatro — arrastra estacionalidad vieja que corre el
 * nivel actual. Con más historia acumulada esto puede cambiar, y por eso se
 * recalcula en vez de quedar fijo.
 */
export async function calibrarVentana(
  localId: string,
  opciones: { corte: string; horizonte?: number } = { corte: "" }
): Promise<{
  ventana: number;
  wape: number;
  /** Cuánto tira el modelo para arriba (+) o para abajo (−), en %. */
  sesgoPct: number | null;
  diasEvaluados: number;
  ranking: { ventana: number; wape: number }[];
}> {
  const resultados: { ventana: number; wape: number; sesgoPct: number | null; dias: number }[] = [];

  for (const ventana of VENTANAS_CANDIDATAS) {
    const r = await backtestLocal(localId, {
      corte: opciones.corte,
      horizonte: opciones.horizonte ?? 15,
      ventana,
    });
    // Se calibra contra el error del DÍA, no de la franja: es el nivel en el
    // que se decide, y el de la franja está dominado por ruido de conteo.
    const pares = r.porDia
      .filter((d) => d.realTickets > 0)
      .map((d) => ({ pronosticado: d.pronosticado, real: d.realTickets }));
    const real = pares.reduce((s, p) => s + p.real, 0);
    const pron = pares.reduce((s, p) => s + p.pronosticado, 0);
    resultados.push({
      ventana,
      wape: calcularMetricas(pares).wape,
      // El WAPE no distingue pasarse de quedarse corto; el sesgo sí, y para
      // decidir dotación o compras no es lo mismo.
      sesgoPct: real > 0 ? ((pron - real) / real) * 100 : null,
      dias: pares.length,
    });
  }

  const ranking = [...resultados].sort((a, b) => a.wape - b.wape);
  const mejor = ranking[0];
  return {
    ventana: mejor.ventana,
    wape: mejor.wape,
    sesgoPct: mejor.sesgoPct,
    diasEvaluados: mejor.dias,
    ranking: ranking.map(({ ventana, wape }) => ({ ventana, wape })),
  };
}

/**
 * Guarda la ventana elegida y lo que costó medirla.
 *
 * Lo medido se persiste porque calcularlo son cuatro backtests completos. La
 * pantalla del modelo lo lee de acá en vez de repetirlos en cada carga.
 */
export async function guardarCalibracion(
  localId: string,
  calibracion: Awaited<ReturnType<typeof calibrarVentana>>,
  contexto: { corte: string; horizonte: number }
) {
  await db.local.update({
    where: { id: localId },
    data: {
      ventanaForecastDias: calibracion.ventana,
      ventanaCalibracion: {
        wape: calibracion.wape,
        sesgoPct: calibracion.sesgoPct,
        diasEvaluados: calibracion.diasEvaluados,
        corte: contexto.corte,
        horizonte: contexto.horizonte,
        medidaEn: new Date().toISOString(),
        ranking: calibracion.ranking,
      },
    },
  });
}

/** Calibra todos los locales y guarda lo medido en cada uno. */
export async function calibrarVentanaTodos(corte: string, horizonte = 15) {
  const locales = await db.local.findMany({ where: { fudoApiKey: { not: null } }, orderBy: { nombre: "asc" } });
  const out: { local: string; ventana: number; wape: number }[] = [];
  for (const l of locales) {
    const r = await calibrarVentana(l.id, { corte, horizonte });
    await guardarCalibracion(l.id, r, { corte, horizonte });
    out.push({ local: l.nombre, ventana: r.ventana, wape: r.wape });
  }
  return out;
}
