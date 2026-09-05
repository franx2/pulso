import { db } from "@/lib/db";

/**
 * Clima por local, desde Open-Meteo (gratis, sin API key, con histórico y
 * pronóstico en el mismo formato).
 *
 * Sirve para dos cosas distintas:
 *  - histórico: aprender cuánto mueve la lluvia a un local a la calle contra
 *    uno en shopping (punto 19), en vez de asumir un coeficiente;
 *  - pronóstico: alimentar K_weather de los próximos 15 días.
 */

const HISTORICO = "https://archive-api.open-meteo.com/v1/archive";
const PRONOSTICO = "https://api.open-meteo.com/v1/forecast";
const CAMPOS = "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max";

type RespuestaClima = {
  daily?: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_sum: (number | null)[];
    wind_speed_10m_max: (number | null)[];
  };
};

async function traer(url: string): Promise<RespuestaClima["daily"] | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as RespuestaClima;
  return data.daily ?? null;
}

/** Descarga histórico + pronóstico de un local y los guarda. */
export async function sincronizarClimaLocal(
  localId: string,
  diasAtras = 365
): Promise<{ dias: number } | { error: string }> {
  const local = await db.local.findUnique({ where: { id: localId } });
  if (!local) return { error: "Local no encontrado" };
  if (local.lat == null || local.lng == null) {
    // Sin coordenadas no se inventa clima: K_weather queda neutro.
    return { error: "El local no tiene coordenadas cargadas" };
  }

  const hoy = new Date();
  const desde = new Date(hoy.getTime() - diasAtras * 86400000).toISOString().slice(0, 10);
  // El archivo histórico va con unos días de retraso; el pronóstico cubre
  // desde hoy hacia adelante. Se piden los dos y se unen.
  const hastaHistorico = new Date(hoy.getTime() - 3 * 86400000).toISOString().slice(0, 10);
  const base = `latitude=${local.lat}&longitude=${local.lng}&daily=${CAMPOS}&timezone=America%2FArgentina%2FBuenos_Aires`;

  const [hist, pron] = await Promise.all([
    traer(`${HISTORICO}?${base}&start_date=${desde}&end_date=${hastaHistorico}`),
    traer(`${PRONOSTICO}?${base}&past_days=7&forecast_days=16`),
  ]);

  const filas = new Map<string, { tempMax: number | null; tempMin: number | null; lluviaMm: number | null; vientoKmh: number | null; esPronostico: boolean }>();

  const volcar = (d: RespuestaClima["daily"] | null, esPronostico: boolean) => {
    if (!d) return;
    d.time.forEach((fecha, i) => {
      filas.set(fecha, {
        tempMax: d.temperature_2m_max[i],
        tempMin: d.temperature_2m_min[i],
        lluviaMm: d.precipitation_sum[i],
        vientoKmh: d.wind_speed_10m_max[i],
        esPronostico,
      });
    });
  };
  volcar(hist, false);
  // El pronóstico se vuelca después: para los días que se pisan, gana el dato
  // más fresco, y para los futuros es la única fuente.
  volcar(pron, true);

  for (const [fecha, v] of filas) {
    const datos = { ...v, esPronostico: v.esPronostico && new Date(fecha) >= new Date(hoy.toISOString().slice(0, 10)) };
    await db.climaDia.upsert({
      where: { localId_fecha: { localId, fecha: new Date(`${fecha}T00:00:00.000Z`) } },
      create: { localId, fecha: new Date(`${fecha}T00:00:00.000Z`), ...datos },
      update: datos,
    });
  }

  return { dias: filas.size };
}

export async function sincronizarClimaTodos(diasAtras = 365) {
  const locales = await db.local.findMany({ select: { id: true, nombre: true } });
  const out: { local: string; detalle: string }[] = [];
  for (const l of locales) {
    const r = await sincronizarClimaLocal(l.id, diasAtras);
    out.push({ local: l.nombre, detalle: "error" in r ? r.error : `${r.dias} días` });
  }
  return out;
}

/** Un día se considera lluvioso a partir de 1 mm: por debajo es una llovizna
 * que no cambia la decisión de nadie de salir. */
export const LLUVIA_MM = 1;

/**
 * Mide, con el histórico, cuánto mueve cada condición climática a cada tipo
 * de local (punto 19). Devuelve un multiplicador contra los días normales
 * comparables, junto con cuántos días lo respaldan.
 *
 * Se compara SÓLO contra el mismo día de semana, porque si los sábados llueve
 * más seguido, un promedio crudo confundiría "llueve" con "es sábado".
 */
export async function medirSensibilidadClima(): Promise<
  { tipoLocal: "INDOOR_MALL" | "OPEN_AIR"; condicion: string; factor: number; dias: number; confianza: number }[]
> {
  const locales = await db.local.findMany({ select: { id: true, tipoLocal: true } });
  const [resumenes, climas] = await Promise.all([
    db.resumenDiario.findMany({ select: { localId: true, fecha: true, ventas: true } }),
    db.climaDia.findMany({ where: { esPronostico: false } }),
  ]);

  const climaPorClave = new Map(
    climas.map((c) => [`${c.localId}|${c.fecha.toISOString().slice(0, 10)}`, c])
  );
  const tipoPorLocal = new Map(locales.map((l) => [l.id, l.tipoLocal]));

  // Agrupa por tipo de local × día de semana: llueve / no llueve.
  type Grupo = { conCondicion: number[]; sinCondicion: number[] };
  const grupos = new Map<string, Grupo>();

  for (const r of resumenes) {
    if (r.ventas <= 0) continue;
    const fecha = r.fecha.toISOString().slice(0, 10);
    const clima = climaPorClave.get(`${r.localId}|${fecha}`);
    if (!clima) continue;
    const tipo = tipoPorLocal.get(r.localId);
    if (!tipo) continue;

    const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    const registrar = (condicion: string, cumple: boolean) => {
      const clave = `${tipo}|${condicion}|${diaSemana}`;
      const g = grupos.get(clave) ?? { conCondicion: [], sinCondicion: [] };
      (cumple ? g.conCondicion : g.sinCondicion).push(r.ventas);
      grupos.set(clave, g);
    };

    registrar("LLUVIA", (clima.lluviaMm ?? 0) >= LLUVIA_MM);
    if (clima.tempMax != null) {
      registrar("CALOR", clima.tempMax >= 32);
      registrar("FRIO", clima.tempMax <= 14);
    }
  }

  // Se promedia el efecto relativo de cada día de semana, no el crudo.
  const acumulado = new Map<string, { ratios: number[]; dias: number }>();
  for (const [clave, g] of grupos) {
    const [tipo, condicion] = clave.split("|");
    if (g.conCondicion.length < 2 || g.sinCondicion.length < 2) continue;
    const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const ratio = media(g.conCondicion) / media(g.sinCondicion);
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const k = `${tipo}|${condicion}`;
    const acc = acumulado.get(k) ?? { ratios: [], dias: 0 };
    acc.ratios.push(ratio);
    acc.dias += g.conCondicion.length;
    acumulado.set(k, acc);
  }

  return [...acumulado.entries()].map(([clave, acc]) => {
    const [tipoLocal, condicion] = clave.split("|");
    const factor = acc.ratios.reduce((s, r) => s + r, 0) / acc.ratios.length;
    // Con pocos días la medición no vale: la confianza lo dice y el motor la
    // usa para atenuar el factor hacia 1 en vez de aplicarlo entero.
    const confianza = Math.min(0.85, acc.dias / 40);
    return {
      tipoLocal: tipoLocal as "INDOOR_MALL" | "OPEN_AIR",
      condicion,
      factor,
      dias: acc.dias,
      confianza,
    };
  });
}

/** Guarda lo medido para que el motor lo use y la pantalla lo muestre. */
export async function guardarSensibilidad() {
  const medidas = await medirSensibilidadClima();
  for (const m of medidas) {
    await db.sensibilidadClima.upsert({
      where: { tipoLocal_condicion: { tipoLocal: m.tipoLocal, condicion: m.condicion } },
      create: { ...m, origen: "APRENDIDO" },
      update: { factor: m.factor, dias: m.dias, confianza: m.confianza, origen: "APRENDIDO" },
    });
  }
  return medidas;
}

/**
 * K_weather del día. El factor medido se atenúa por su confianza: con poca
 * evidencia se acerca a 1 en vez de aplicarse entero. Así el modelo no pega
 * un volantazo por una medición hecha con seis días de lluvia.
 */
export function kWeather(
  clima: { lluviaMm: number | null; tempMax: number | null } | null,
  sensibilidades: { condicion: string; factor: number; confianza: number }[]
): { k: number; motivo: string | null } {
  if (!clima) return { k: 1, motivo: null };

  const buscar = (condicion: string) => sensibilidades.find((s) => s.condicion === condicion);
  const aplicar = (s: { factor: number; confianza: number } | undefined) =>
    s ? 1 + (s.factor - 1) * s.confianza : 1;

  if ((clima.lluviaMm ?? 0) >= LLUVIA_MM) {
    const s = buscar("LLUVIA");
    const k = aplicar(s);
    return { k, motivo: Math.abs(k - 1) >= 0.01 ? "lluvia" : null };
  }
  if (clima.tempMax != null && clima.tempMax >= 32) {
    const k = aplicar(buscar("CALOR"));
    return { k, motivo: Math.abs(k - 1) >= 0.01 ? "calor" : null };
  }
  if (clima.tempMax != null && clima.tempMax <= 14) {
    const k = aplicar(buscar("FRIO"));
    return { k, motivo: Math.abs(k - 1) >= 0.01 ? "frío" : null };
  }
  return { k: 1, motivo: null };
}
