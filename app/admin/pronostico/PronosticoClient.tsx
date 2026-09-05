"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CloudRain,
  Info,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ForecastChart } from "@/components/AnalyticsCharts";
import { Badge, Button, EmptyState, PageTitle } from "@/components/ui";
import TemporadaPanel from "./TemporadaPanel";
import TendenciaPanel from "./TendenciaPanel";

type DiaPronostico = {
  fecha: string;
  diaSemana: number;
  tickets: number;
  ticketsMin: number;
  ticketsMax: number;
  ventas: number;
  demandIndex: number;
  kAuto: number;
  kManual: number;
  confianza: number;
  motivos: string[];
  horaPico: string | null;
};
type LocalPronostico = {
  id: string;
  nombre: string;
  tipoLocal: "INDOOR_MALL" | "OPEN_AIR";
  ventanaForecastDias: number;
};
type Correlacion = {
  id: string;
  etiqueta: string;
  r: number | null;
  n: number;
  detalle: string;
};
type Respuesta = {
  locales: LocalPronostico[];
  local: LocalPronostico;
  diagnostico: {
    diasObservados?: number;
    celdasPerfil?: number;
    kTrend?: number;
    ticketsPromedioSlot?: number;
    capacidadEsMedida?: boolean;
  };
  historial: { fecha: string; ventas: number; tickets: number }[];
  pronostico: DiaPronostico[];
  modelo: {
    nombre: string;
    ventanaDias: number;
    decaimientoSemanal: number;
    limitesFactor: { min: number; max: number };
    factores: {
      baseTickets: number;
      finalTickets: number;
      factorFinal: number;
      tendencia: number;
      clima: number;
      calendario: number;
      manual: number;
    };
    backtest: {
      desde: string;
      hasta: string;
      diasEvaluados: number;
      wapeDia: number | null;
      sesgoPct: number | null;
    };
  };
  correlaciones: Correlacion[];
  sensibilidadClima: {
    condicion: string;
    factor: number;
    confianza: number;
    dias: number;
    origen: string;
  }[];
};

type Vista = "proyeccion" | "temporada" | "modelo";
type SemanaPronostico = {
  clave: string;
  desde: string;
  hasta: string;
  ventas: number;
  tickets: number;
  ticketsMin: number;
  ticketsMax: number;
  motivos: string[];
};

const VISTAS: { clave: Vista; label: string }[] = [
  { clave: "proyeccion", label: "Proyección" },
  { clave: "temporada", label: "Temporada" },
  { clave: "modelo", label: "Modelo y evidencia" },
];
const HORIZONTES = [7, 15, 30];
const plata = (n: number) => `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("es-AR")}`;
const plataCompacta = (n: number) =>
  `${n < 0 ? "-" : ""}$${new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(n))}`;
const numero = (n: number) => Math.round(n).toLocaleString("es-AR");
const fechaCorta = (fecha: string) =>
  new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
const fechaLarga = (fecha: string) =>
  new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
const capitalizar = (texto: string) => texto ? texto[0].toUpperCase() + texto.slice(1) : texto;
const pctFactor = (factor: number) => `${factor >= 1 ? "+" : ""}${((factor - 1) * 100).toFixed(1)}%`;

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white dark:border-[#29403b] dark:bg-[#101c19] ${className}`}>{children}</section>;
}

function SelectorSegmentado<T extends string | number>({
  opciones,
  valor,
  onChange,
  label,
}: {
  opciones: { clave: T; label: string }[];
  valor: T;
  onChange: (valor: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex min-w-max rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-[#29403b] dark:bg-[#0b1412]" role="tablist" aria-label={label}>
      {opciones.map((opcion) => (
        <button
          key={String(opcion.clave)}
          type="button"
          role="tab"
          aria-selected={valor === opcion.clave}
          onClick={() => onChange(opcion.clave)}
          className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#37e6b0] ${valor === opcion.clave ? "bg-white text-slate-900 shadow-sm dark:bg-[#1d4e48] dark:text-[#f2f7f4]" : "text-slate-500 hover:text-slate-800 dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"}`}
        >
          {opcion.label}
        </button>
      ))}
    </div>
  );
}

function Metrica({ label, valor, nota, tono = "normal" }: { label: string; valor: string; nota: string; tono?: "normal" | "positivo" | "advertencia" }) {
  const color = tono === "positivo" ? "text-emerald-700 dark:text-[#4ee6b0]" : tono === "advertencia" ? "text-amber-700 dark:text-amber-300" : "text-slate-950 dark:text-[#f2f7f4]";
  return (
    <div className="min-w-0 px-4 py-4 first:pl-0 last:pr-0 md:px-5">
      <p className="text-xs font-medium text-slate-500 dark:text-[#94a19c]">{label}</p>
      <p className={`mt-1 whitespace-nowrap text-lg font-bold tabular-nums xl:text-2xl ${color}`}>{valor}</p>
      <p className="mt-1 text-xs text-slate-400 dark:text-[#74817b]">{nota}</p>
    </div>
  );
}

function lunesDe(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dia = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dia === 0 ? 6 : dia - 1));
  return d.toISOString().slice(0, 10);
}

function agruparSemanas(dias: DiaPronostico[]): SemanaPronostico[] {
  const grupos = new Map<string, DiaPronostico[]>();
  for (const dia of dias) {
    const clave = lunesDe(dia.fecha);
    const grupo = grupos.get(clave) ?? [];
    grupo.push(dia);
    grupos.set(clave, grupo);
  }
  return [...grupos.entries()].map(([clave, grupo]) => {
    const conteo = new Map<string, number>();
    grupo.flatMap((dia) => dia.motivos).forEach((motivo) => conteo.set(motivo, (conteo.get(motivo) ?? 0) + 1));
    const motivos = [...conteo].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([motivo]) => motivo);
    return {
      clave,
      desde: grupo[0].fecha,
      hasta: grupo[grupo.length - 1].fecha,
      ventas: grupo.reduce((s, dia) => s + dia.ventas, 0),
      tickets: grupo.reduce((s, dia) => s + dia.tickets, 0),
      ticketsMin: grupo.reduce((s, dia) => s + dia.ticketsMin, 0),
      ticketsMax: grupo.reduce((s, dia) => s + dia.ticketsMax, 0),
      motivos,
    };
  });
}

function lecturaCorrelacion(r: number | null) {
  if (r == null) return "sin variación suficiente";
  const magnitud = Math.abs(r);
  const fuerza = magnitud >= 0.7 ? "fuerte" : magnitud >= 0.4 ? "moderada" : magnitud >= 0.2 ? "débil" : "muy débil";
  return `${fuerza} ${r >= 0 ? "directa" : "inversa"}`;
}

function CorrelacionFila({ correlacion }: { correlacion: Correlacion }) {
  const posicion = correlacion.r == null ? 50 : ((correlacion.r + 1) / 2) * 100;
  const inicio = correlacion.r == null ? 50 : Math.min(posicion, 50);
  const ancho = correlacion.r == null ? 0 : Math.abs(posicion - 50);
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-[#e0e7e3]">{correlacion.etiqueta}</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-[#94a19c]">{correlacion.detalle}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums">{correlacion.r == null ? "—" : `r ${correlacion.r.toFixed(2)}`}</p>
          <p className="text-xs text-slate-400 dark:text-[#74817b]">{lecturaCorrelacion(correlacion.r)} · n={correlacion.n}</p>
        </div>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-slate-100 dark:bg-[#18201d]" aria-hidden>
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-slate-300 dark:bg-[#53615c]" />
        <span className={`absolute inset-y-0 rounded-full ${correlacion.r != null && correlacion.r < 0 ? "bg-rose-500" : "bg-emerald-600 dark:bg-[#37e6b0]"}`} style={{ left: `${inicio}%`, width: `${ancho}%` }} />
        {correlacion.r != null && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-800 shadow-sm dark:border-[#101c19] dark:bg-[#f2f7f4]" style={{ left: `${posicion}%` }} />}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400 dark:text-[#74817b]"><span>−1 inversa</span><span>0</span><span>+1 directa</span></div>
    </div>
  );
}

function PronosticoSkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Cargando pronóstico">
      <div className="h-20 rounded-lg bg-slate-200/70 dark:bg-[#172724]" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-lg bg-slate-200/70 dark:bg-[#172724]" />)}</div>
      <div className="h-96 rounded-lg bg-slate-200/70 dark:bg-[#172724]" />
    </div>
  );
}

export default function PronosticoClient({ initialLocalId = "" }: { initialLocalId?: string }) {
  const [vista, setVista] = useState<Vista>("proyeccion");
  const [localId, setLocalId] = useState(initialLocalId);
  const [horizonte, setHorizonte] = useState(15);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controlador = new AbortController();
    const params = new URLSearchParams({ dias: String(horizonte) });
    if (localId) params.set("localId", localId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reactivo sin librería de datos
    setCargando(true);
    setError("");
    fetch(`/api/pronostico?${params}`, { signal: controlador.signal })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error("No se pudo cargar el pronóstico");
        return respuesta.json();
      })
      .then((respuesta) => setDatos(respuesta))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("No pudimos calcular el pronóstico. Volvé a intentar o revisá la sincronización de Fudo.");
        setDatos(null);
      })
      .finally(() => {
        if (!controlador.signal.aborted) setCargando(false);
      });
    return () => controlador.abort();
  }, [localId, horizonte, revision]);

  const resumen = useMemo(() => {
    if (!datos) return null;
    const ventas = datos.pronostico.reduce((s, dia) => s + dia.ventas, 0);
    const tickets = datos.pronostico.reduce((s, dia) => s + dia.tickets, 0);
    const min = datos.pronostico.reduce((s, dia) => s + dia.ticketsMin, 0);
    const max = datos.pronostico.reduce((s, dia) => s + dia.ticketsMax, 0);
    const confianza = datos.pronostico.reduce((s, dia) => s + dia.confianza, 0) / Math.max(datos.pronostico.length, 1);
    const pico = datos.pronostico.reduce<DiaPronostico | null>((mayor, dia) => !mayor || dia.tickets > mayor.tickets ? dia : mayor, null);
    return { ventas, tickets, min, max, confianza, pico, semanas: agruparSemanas(datos.pronostico) };
  }, [datos]);

  const seleccionado = datos?.local.id ?? localId;
  const wape = datos?.modelo.backtest.wapeDia;
  const factores = datos?.modelo.factores;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        subtitle="Demanda futura, rango esperado y evidencia del modelo"
        actions={
          <Link href="/admin/pronostico/ajustes" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#e0e7e3] dark:hover:bg-[#172724]">
            <SlidersHorizontal size={16} aria-hidden /><span className="hidden sm:inline">Parámetros</span>
          </Link>
        }
      >
        Pronóstico de demanda
      </PageTitle>

      {datos && datos.locales.length > 0 && (
        <Panel className="md:sticky md:top-[4.75rem] md:z-[9]">
          <div className="flex flex-col gap-3 p-3.5 xl:flex-row xl:items-center xl:justify-between">
            <div className="scrollbar-hidden flex min-w-0 items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
              <BarChart3 size={16} className="shrink-0 text-slate-400" aria-hidden />
              <div className="inline-flex min-w-max rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-[#29403b] dark:bg-[#0b1412]" role="group" aria-label="Local del pronóstico">
                {datos.locales.map((local) => (
                  <button
                    key={local.id}
                    type="button"
                    aria-pressed={seleccionado === local.id}
                    onClick={() => setLocalId(local.id)}
                    className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#37e6b0] ${seleccionado === local.id ? "bg-white text-slate-900 shadow-sm dark:bg-[#1d4e48] dark:text-[#f2f7f4]" : "text-slate-500 hover:text-slate-800 dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"}`}
                  >
                    {local.nombre}
                  </button>
                ))}
              </div>
            </div>
            <div className="scrollbar-hidden flex items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
              <CalendarClock size={16} className="shrink-0 text-slate-400" aria-hidden />
              <SelectorSegmentado
                opciones={HORIZONTES.map((dias) => ({ clave: dias, label: `${dias} días` }))}
                valor={horizonte}
                onChange={setHorizonte}
                label="Horizonte del pronóstico"
              />
            </div>
          </div>
        </Panel>
      )}

      <div className="scrollbar-hidden overflow-x-auto"><SelectorSegmentado opciones={VISTAS} valor={vista} onChange={setVista} label="Vista del pronóstico" /></div>

      {error ? (
        <EmptyState>
          <span>{error}</span>
          <Button type="button" variant="ghost" className="mx-auto mt-3" onClick={() => setRevision((valor) => valor + 1)}>Reintentar</Button>
        </EmptyState>
      ) : cargando || !datos || !resumen ? (
        <PronosticoSkeleton />
      ) : datos.locales.length === 0 ? (
        <EmptyState>Todavía no hay locales con Fudo configurado para pronosticar.</EmptyState>
      ) : vista === "proyeccion" ? (
        <div className="space-y-5">
          <section className="grid grid-cols-2 divide-x divide-y border-y border-slate-200 md:grid-cols-4 md:divide-y-0 dark:border-[#29403b] dark:divide-[#29403b]">
            <Metrica label={`Ventas previstas · ${horizonte} días`} valor={plataCompacta(resumen.ventas)} nota={`${datos.local.nombre} · escenario central`} tono="positivo" />
            <Metrica label="Tickets previstos" valor={numero(resumen.tickets)} nota={`Promedio ${numero(resumen.tickets / Math.max(horizonte, 1))} por día`} />
            <Metrica
              label="Tickets · intervalo"
              valor={`${numero(resumen.min)}–${numero(resumen.max)}`}
              nota={`Total de ${horizonte} días · ${Math.round(resumen.confianza * 100)}% de confianza media`}
            />
            <Metrica
              label="Error histórico · WAPE"
              valor={wape == null ? "Sin base" : `${(wape * 100).toFixed(1)}%`}
              nota={wape == null ? "Faltan al menos 5 días comparables" : `${datos.modelo.backtest.diasEvaluados} días reservados para prueba`}
              tono={wape != null && wape > 0.18 ? "advertencia" : "normal"}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,0.72fr)]">
            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <h2 className="font-semibold">Tickets reales y proyectados</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">El área menta es incertidumbre, no una segunda proyección.</p>
              </div>
              <div className="p-4">
                <ForecastChart
                  historial={datos.historial.slice(-35).map((punto) => ({ fecha: punto.fecha, valor: punto.tickets }))}
                  pronostico={datos.pronostico.map((dia) => ({ fecha: dia.fecha, valor: dia.tickets, minimo: dia.ticketsMin, maximo: dia.ticketsMax }))}
                />
              </div>
            </Panel>

            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <h2 className="font-semibold">Lectura operativa</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Qué explica el escenario central.</p>
              </div>
              <div className="divide-y divide-slate-100 px-4 dark:divide-[#1c2521]">
                {resumen.pico && (
                  <div className="py-4">
                    <p className="text-xs text-slate-400 dark:text-[#74817b]">Día de mayor demanda</p>
                    <p className="mt-1 font-semibold">{capitalizar(fechaLarga(resumen.pico.fecha))}</p>
                    <p className="mt-1 text-sm tabular-nums text-slate-500 dark:text-[#94a19c]">{numero(resumen.pico.tickets)} tickets · rango {numero(resumen.pico.ticketsMin)}–{numero(resumen.pico.ticketsMax)}</p>
                  </div>
                )}
                <div className="py-4">
                  <p className="text-xs text-slate-400 dark:text-[#74817b]">Cambio contra la base</p>
                  <p className={`mt-1 inline-flex items-center gap-1.5 font-semibold ${factores && factores.factorFinal >= 1 ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>
                    {factores && factores.factorFinal >= 1 ? <TrendingUp size={16} aria-hidden /> : <TrendingDown size={16} aria-hidden />}
                    {factores ? pctFactor(factores.factorFinal) : "—"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-[#94a19c]">Promedio ponderado de tendencia, clima, calendario y ajustes.</p>
                </div>
                <div className="py-4">
                  <p className="text-xs text-slate-400 dark:text-[#74817b]">Señales activas</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...new Set(datos.pronostico.flatMap((dia) => dia.motivos))].slice(0, 5).map((motivo) => <Badge key={motivo} tone="slate">{motivo}</Badge>)}
                    {datos.pronostico.every((dia) => dia.motivos.length === 0) && <span className="text-sm text-slate-500 dark:text-[#94a19c]">Sin desvíos relevantes del patrón habitual.</span>}
                  </div>
                </div>
                <div className="flex items-start gap-2 py-4 text-xs text-slate-500 dark:text-[#94a19c]">
                  <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
                  El tablero ya no muestra dotación diaria: esa conversión sigue siendo experimental hasta que haya suficientes fichajes reales.
                </div>
              </div>
            </Panel>
          </div>

          <Panel>
            <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
              <h2 className="font-semibold">Plan semanal</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Resumen para decidir; el detalle de 30 minutos queda fuera de la vista principal.</p>
            </div>
            <div className="divide-y divide-slate-100 md:hidden dark:divide-[#1c2521]">
              {resumen.semanas.map((semana) => (
                <div key={semana.clave} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{fechaCorta(semana.desde)} – {fechaCorta(semana.hasta)}</p>
                    <p className="font-semibold tabular-nums">{plata(semana.ventas)}</p>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-[#94a19c]">Tickets</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{numero(semana.tickets)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-[#94a19c]">Intervalo</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{numero(semana.ticketsMin)}–{numero(semana.ticketsMax)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-slate-500 dark:text-[#94a19c]">Señal principal</dt>
                      <dd className="mt-0.5 text-slate-700 dark:text-[#c1cbc6]">{semana.motivos.length > 0 ? semana.motivos.join(" · ") : "Patrón habitual"}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:flex">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-[#29403b] dark:text-[#94a19c]">
                    <th className="px-4 py-3 font-semibold">Semana</th>
                    <th className="px-3 py-3 text-right font-semibold">Ventas previstas</th>
                    <th className="px-3 py-3 text-right font-semibold">Tickets</th>
                    <th className="px-3 py-3 text-right font-semibold">Rango</th>
                    <th className="px-4 py-3 font-semibold">Señal principal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                  {resumen.semanas.map((semana) => (
                    <tr key={semana.clave}>
                      <td className="px-4 py-3 font-semibold">{fechaCorta(semana.desde)} – {fechaCorta(semana.hasta)}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{plata(semana.ventas)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{numero(semana.tickets)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">{numero(semana.ticketsMin)}–{numero(semana.ticketsMax)}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-[#94a19c]">{semana.motivos.length > 0 ? semana.motivos.join(" · ") : "Patrón habitual"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <TendenciaPanel seleccionado={seleccionado} onSeleccionar={setLocalId} />
        </div>
      ) : vista === "temporada" ? (
        <TemporadaPanel seleccionado={seleccionado} onSeleccionar={setLocalId} />
      ) : (
        <div className="space-y-5">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
              <div>
                <h2 className="font-semibold">Cómo se calcula</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Todos los factores son visibles; ninguno reemplaza el rango de incertidumbre.</p>
              </div>
              <Badge tone={datos.local.tipoLocal === "INDOOR_MALL" ? "slate" : "emerald"}>{datos.local.tipoLocal === "INDOOR_MALL" ? "Local en shopping" : "Local a la calle"}</Badge>
            </div>
            <div className="grid divide-y divide-slate-100 md:grid-cols-6 md:divide-x md:divide-y-0 dark:divide-[#1c2521]">
              {[
                ["Base histórica", numero(datos.modelo.factores.baseTickets), `${datos.modelo.ventanaDias} días`],
                ["Tendencia", `×${datos.modelo.factores.tendencia.toFixed(2)}`, pctFactor(datos.modelo.factores.tendencia)],
                ["Clima", `×${datos.modelo.factores.clima.toFixed(2)}`, pctFactor(datos.modelo.factores.clima)],
                ["Calendario", `×${datos.modelo.factores.calendario.toFixed(2)}`, pctFactor(datos.modelo.factores.calendario)],
                ["Ajuste manual", `×${datos.modelo.factores.manual.toFixed(2)}`, pctFactor(datos.modelo.factores.manual)],
                ["Resultado", numero(datos.modelo.factores.finalTickets), `${horizonte} días`],
              ].map(([label, valor, nota]) => (
                <div key={label} className="px-4 py-4">
                  <p className="text-xs text-slate-500 dark:text-[#94a19c]">{label}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{valor}</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-[#74817b]">{nota}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-5 border-t border-slate-100 p-4 md:grid-cols-3 dark:border-[#1c2521]">
              <div>
                <h3 className="text-sm font-semibold">Patrón comparable</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-[#94a19c]">Promedia el mismo día de semana y la misma franja. Cada semana anterior pesa {Math.round(datos.modelo.decaimientoSemanal * 100)}% de la siguiente.</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Factores acotados</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-[#94a19c]">Tendencia, clima y calendario ajustan la base. El automático se recorta entre ×{datos.modelo.limitesFactor.min.toFixed(2)} y ×{datos.modelo.limitesFactor.max.toFixed(2)}.</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Intervalo, no certeza</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-[#94a19c]">La dispersión histórica y la cantidad de muestras abren o cierran el rango esperado de tickets.</p>
              </div>
            </div>
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-[#1c2521] dark:text-[#94a19c]">Los factores mostrados son promedios ponderados del horizonte. El resultado exacto se calcula día por día y puede diferir por redondeo y por el recorte de seguridad.</p>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <h2 className="font-semibold">Prueba contra datos reales</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">El período de prueba no entra al entrenamiento.</p>
              </div>
              <div className="p-4">
                {wape == null ? (
                  <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />Faltan al menos 5 días comparables para publicar un error.</div>
                ) : (
                  <>
                    <p className="text-3xl font-bold tabular-nums">{(wape * 100).toFixed(1)}% <span className="text-base font-medium text-slate-500 dark:text-[#94a19c]">WAPE día</span></p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-[#c1cbc6]">En la prueba reciente, el error absoluto equivale a {(wape * 100).toFixed(1)} tickets por cada 100 observados.</p>
                    <dl className="mt-5 divide-y divide-slate-100 text-sm dark:divide-[#1c2521]">
                      <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500 dark:text-[#94a19c]">Período</dt><dd className="text-right tabular-nums">{fechaCorta(datos.modelo.backtest.desde)} – {fechaCorta(datos.modelo.backtest.hasta)}</dd></div>
                      <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500 dark:text-[#94a19c]">Días evaluados</dt><dd className="tabular-nums">{datos.modelo.backtest.diasEvaluados}</dd></div>
                      <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500 dark:text-[#94a19c]">Sesgo</dt><dd className="tabular-nums">{datos.modelo.backtest.sesgoPct == null ? "—" : `${datos.modelo.backtest.sesgoPct >= 0 ? "+" : ""}${datos.modelo.backtest.sesgoPct.toFixed(1)}%`}</dd></div>
                      <div className="flex justify-between gap-3 py-2.5"><dt className="text-slate-500 dark:text-[#94a19c]">Ventana elegida</dt><dd>{datos.modelo.ventanaDias} días</dd></div>
                    </dl>
                  </>
                )}
              </div>
            </Panel>

            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <h2 className="font-semibold">Correlaciones observadas</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">r va de −1 a +1. Describe relación histórica; no demuestra causa.</p>
              </div>
              <div className="divide-y divide-slate-100 p-4 dark:divide-[#1c2521]">{datos.correlaciones.map((correlacion) => <CorrelacionFila key={correlacion.id} correlacion={correlacion} />)}</div>
            </Panel>
          </div>

          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
              <div>
                <h2 className="font-semibold">Efecto climático medido</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Compara contra el mismo día de semana y atenúa el factor cuando hay poca evidencia.</p>
              </div>
              <CloudRain size={19} className="text-slate-400" aria-hidden />
            </div>
            {datos.sensibilidadClima.length === 0 ? (
              <p className="p-4 text-sm text-slate-500 dark:text-[#94a19c]">Todavía no hay suficiente historia climática para este tipo de local.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-sm">
                  <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-[#29403b] dark:text-[#94a19c]"><th className="px-4 py-3 font-semibold">Condición</th><th className="px-3 py-3 text-right font-semibold">Efecto observado</th><th className="px-3 py-3 text-right font-semibold">Factor aplicado</th><th className="px-3 py-3 text-right font-semibold">Confianza</th><th className="px-4 py-3 text-right font-semibold">Días</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                    {datos.sensibilidadClima.map((sensibilidad) => (
                      <tr key={sensibilidad.condicion}>
                        <td className="px-4 py-3 font-semibold">{sensibilidad.condicion === "LLUVIA" ? "Lluvia ≥ 1 mm" : sensibilidad.condicion === "CALOR" ? "Calor ≥ 32°" : "Frío ≤ 14°"}</td>
                        <td className={`px-3 py-3 text-right font-semibold tabular-nums ${sensibilidad.factor >= 1 ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>{pctFactor(sensibilidad.factor)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">×{(1 + (sensibilidad.factor - 1) * sensibilidad.confianza).toFixed(2)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{Math.round(sensibilidad.confianza * 100)}%</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">{sensibilidad.dias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
