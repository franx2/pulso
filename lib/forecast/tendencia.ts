import { db } from "@/lib/db";

/**
 * Tendencia de ventas: hacia dónde va cada local en plata, que es la pregunta
 * que importa para decidir. Se apoya en `ResumenDiario`, no en la serie de 30
 * minutos: para "cuánto se va a vender" el día es la unidad natural y evita
 * arrastrar el ruido de las franjas.
 *
 * Con un año de historia se puede además comparar contra el mismo período del
 * año pasado, que separa "creció" de "es la temporada".
 */

const fechaSql = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hoyAR = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

export type PuntoSemana = {
  /** Lunes de la semana, "YYYY-MM-DD". */
  semana: string;
  ventas: number;
  tickets: number;
  ticketPromedio: number;
  dias: number;
};

export type TendenciaLocal = {
  localId: string;
  local: string;
  semanas: PuntoSemana[];
  /** Pendiente en $ por semana, por mínimos cuadrados sobre las últimas 8. */
  pendienteSemanal: number;
  /** Esa pendiente como % del promedio semanal: comparable entre locales. */
  crecimientoSemanalPct: number;
  ventasUltimas4: number;
  ventasPrevias4: number;
  variacion4v4: number | null;
  /** Mismo período del año pasado, si hay historia. */
  ventasAnioAnterior: number | null;
  variacionInteranual: number | null;
  /** Proyección simple a 30 días, sólo desde la tendencia de ventas. */
  proyeccion30Dias: number;
  diasConDatos: number;
};

/** Lunes de la semana a la que pertenece una fecha. */
function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  const dia = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dia === 0 ? 6 : dia - 1));
  return d.toISOString().slice(0, 10);
}

/** Pendiente por mínimos cuadrados de una serie (x = 0,1,2…). */
function pendiente(valores: number[]): number {
  const n = valores.length;
  if (n < 2) return 0;
  const mediaX = (n - 1) / 2;
  const mediaY = valores.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  valores.forEach((y, x) => {
    num += (x - mediaX) * (y - mediaY);
    den += (x - mediaX) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

export async function tendenciaDeVentas(opciones: { semanas?: number } = {}): Promise<TendenciaLocal[]> {
  const semanasPedidas = opciones.semanas ?? 26;
  const hoy = hoyAR();
  const desde = sumarDias(hoy, -(semanasPedidas * 7 + 7));

  const [locales, filas] = await Promise.all([
    db.local.findMany({ where: { fudoApiKey: { not: null } }, orderBy: { nombre: "asc" } }),
    db.resumenDiario.findMany({
      where: { fecha: { gte: fechaSql(sumarDias(hoy, -400)) } },
      orderBy: { fecha: "asc" },
    }),
  ]);

  return locales.map((local) => {
    const suyas = filas.filter((f) => f.localId === local.id);

    // Semanas completas dentro de la ventana. La semana en curso se deja
    // fuera del ajuste: está incompleta y tiraría la pendiente para abajo.
    const porSemana = new Map<string, { ventas: number; tickets: number; dias: number }>();
    for (const f of suyas) {
      const fecha = f.fecha.toISOString().slice(0, 10);
      if (fecha < desde) continue;
      const semana = lunesDe(fecha);
      const acc = porSemana.get(semana) ?? { ventas: 0, tickets: 0, dias: 0 };
      acc.ventas += f.ventas;
      acc.tickets += f.tickets;
      acc.dias++;
      porSemana.set(semana, acc);
    }

    const semanaEnCurso = lunesDe(hoy);
    const semanas: PuntoSemana[] = [...porSemana.entries()]
      .filter(([semana]) => semana !== semanaEnCurso)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([semana, v]) => ({
        semana,
        ventas: v.ventas,
        tickets: v.tickets,
        ticketPromedio: v.tickets > 0 ? v.ventas / v.tickets : 0,
        dias: v.dias,
      }));

    const ultimas8 = semanas.slice(-8);
    const pend = pendiente(ultimas8.map((s) => s.ventas));
    const promedioSemanal = ultimas8.length > 0 ? ultimas8.reduce((s, x) => s + x.ventas, 0) / ultimas8.length : 0;

    const suma = (xs: PuntoSemana[]) => xs.reduce((s, x) => s + x.ventas, 0);
    const ultimas4 = suma(semanas.slice(-4));
    const previas4 = suma(semanas.slice(-8, -4));

    // Mismo período, un año atrás.
    const desdeAnio = sumarDias(hoy, -365 - 27);
    const hastaAnio = sumarDias(hoy, -365);
    const delAnioPasado = suyas.filter((f) => {
      const d = f.fecha.toISOString().slice(0, 10);
      return d >= desdeAnio && d <= hastaAnio;
    });
    const ventasAnioAnterior = delAnioPasado.length >= 14 ? delAnioPasado.reduce((s, f) => s + f.ventas, 0) : null;

    const promedioDiarioReciente = ultimas4 > 0 ? ultimas4 / 28 : 0;
    // Proyección a 30 días: nivel reciente + la mitad de la pendiente por
    // semana. Se atenúa a propósito — extrapolar la pendiente completa a un
    // mes es lo que hace que estas proyecciones se vayan de escala.
    const proyeccion30Dias = promedioDiarioReciente * 30 + (pend / 7) * 30 * 0.5;

    return {
      localId: local.id,
      local: local.nombre,
      semanas,
      pendienteSemanal: pend,
      crecimientoSemanalPct: promedioSemanal > 0 ? (pend / promedioSemanal) * 100 : 0,
      ventasUltimas4: ultimas4,
      ventasPrevias4: previas4,
      variacion4v4: previas4 > 0 ? ((ultimas4 - previas4) / previas4) * 100 : null,
      ventasAnioAnterior,
      variacionInteranual:
        ventasAnioAnterior && ventasAnioAnterior > 0 ? ((ultimas4 - ventasAnioAnterior) / ventasAnioAnterior) * 100 : null,
      proyeccion30Dias: Math.max(0, proyeccion30Dias),
      diasConDatos: suyas.length,
    };
  });
}
