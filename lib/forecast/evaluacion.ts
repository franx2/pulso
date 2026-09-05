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
