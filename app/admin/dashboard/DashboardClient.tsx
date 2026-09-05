"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Building2,
  CalendarRange,
  CheckCircle2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ComparisonChart, type ComparisonPoint } from "@/components/AnalyticsCharts";
import { Badge, Button, EmptyState, Input, Label, PageTitle } from "@/components/ui";
import ProductosPanel from "./ProductosPanel";

type Mapa = Record<string, number>;
type PuntoSerie = {
  fecha: string;
  ventas: number | null;
  tickets: number | null;
  ticketPromedio: number | null;
  completo: boolean;
};
type Serie = { actual: PuntoSerie[]; previo: PuntoSerie[] };
type LocalDash = {
  localId: string;
  nombre: string;
  tieneFudo: boolean;
  sincronizadoEn: string | null;
  diasConDatos: number;
  diasConDatosPrevio: number;
  baseComparable: boolean;
  ventas: number;
  ventasPrevio: number;
  variacionVentas: number | null;
  tickets: number;
  ticketsPrevio: number;
  ticketPromedio: number;
  ticketPromedioPrevio: number;
  personas: number;
  descuentos: number;
  porcentajeDescuentos: number;
  anulaciones: number;
  gastos: number;
  gastosPrevio: number;
  costo: number;
  costoPrevio: number;
  costoIncompleto: boolean;
  foodCost: number;
  resultado: number;
  resultadoPrevio: number;
  porMedioPago: Mapa;
  porCanal: Mapa;
  porCategoria: Mapa;
  descuentosPorCaja: Mapa;
  serie: Serie;
};
type CadenaDash = {
  ventas: number;
  ventasPrevio: number;
  variacionVentas: number | null;
  tickets: number;
  ticketsPrevio: number;
  ticketPromedio: number;
  ticketPromedioPrevio: number;
  descuentos: number;
  anulaciones: number;
  gastos: number;
  gastosPrevio: number;
  costo: number;
  costoPrevio: number;
  resultado: number;
  resultadoPrevio: number;
  localesSinFudo: string[];
  localesSinBase: string[];
  serie: Serie;
};
type Dash = {
  periodo: string;
  dias: number;
  rango: { desde: string; hasta: string };
  rangoPrevio: { desde: string; hasta: string };
  cadena: CadenaDash;
  locales: LocalDash[];
  alertas: { tono: "rose" | "amber"; texto: string; localId: string | null }[];
};

type Vista = "rendimiento" | "locales" | "control";
type Periodo = "semana" | "mes" | "mtd" | "mes-calendario" | "anio-calendario" | "rango";
type MetricaGrafico = "ventas" | "tickets" | "ticketPromedio";

const PERIODOS: { clave: Periodo; label: string }[] = [
  { clave: "semana", label: "7 días" },
  { clave: "mes", label: "30 días" },
  { clave: "mtd", label: "Mes actual" },
  { clave: "mes-calendario", label: "Elegir mes" },
  { clave: "anio-calendario", label: "Elegir año" },
  { clave: "rango", label: "Fechas" },
];

const VISTAS: { clave: Vista; label: string }[] = [
  { clave: "rendimiento", label: "Rendimiento" },
  { clave: "locales", label: "Locales" },
  { clave: "control", label: "Productos y control" },
];

const METRICAS_GRAFICO: { clave: MetricaGrafico; label: string }[] = [
  { clave: "ventas", label: "Ventas" },
  { clave: "tickets", label: "Tickets" },
  { clave: "ticketPromedio", label: "Ticket promedio" },
];

const ETIQUETA_CANAL: Record<string, string> = {
  "EAT-IN": "Salón",
  TAKEAWAY: "Take away",
  DELIVERY: "Delivery",
  "SIN-CANAL": "Sin canal",
};

const hoyAR = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const sumarDias = (fecha: string, cantidad: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + cantidad);
  return d.toISOString().slice(0, 10);
};
const plata = (n: number) => `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("es-AR")}`;
const plataCompacta = (n: number) =>
  `${n < 0 ? "-" : ""}$${new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(n))}`;
const numeroCompacto = (n: number) =>
  new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const fmtFecha = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
const variacion = (actual: number, previo: number) => (previo > 0 ? ((actual - previo) / previo) * 100 : null);

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white dark:border-[#29403b] dark:bg-[#101c19] ${className}`}>
      {children}
    </section>
  );
}

function SelectorSegmentado<T extends string>({
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
    <div
      className="inline-flex min-w-max rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-[#29403b] dark:bg-[#0b1412]"
      role="tablist"
      aria-label={label}
    >
      {opciones.map((opcion) => (
        <button
          key={opcion.clave}
          type="button"
          role="tab"
          aria-selected={valor === opcion.clave}
          onClick={() => onChange(opcion.clave)}
          className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#37e6b0] ${
            valor === opcion.clave
              ? "bg-white text-slate-900 shadow-sm dark:bg-[#1d4e48] dark:text-[#f2f7f4]"
              : "text-slate-500 hover:text-slate-800 dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"
          }`}
        >
          {opcion.label}
        </button>
      ))}
    </div>
  );
}

function Delta({ valor, texto = "vs. período anterior" }: { valor: number | null; texto?: string }) {
  if (valor == null) return <span className="text-xs text-slate-400 dark:text-[#74817b]">sin base comparable</span>;
  const sube = valor >= 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${sube ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>
      <Icono size={13} aria-hidden />
      {sube ? "+" : ""}{valor.toFixed(1)}% {texto}
    </span>
  );
}

function Metrica({
  label,
  valor,
  valorCompleto,
  delta,
  nota,
  tono = "normal",
}: {
  label: string;
  valor: string;
  valorCompleto?: string;
  delta: number | null;
  nota?: string;
  tono?: "normal" | "negativo";
}) {
  return (
    <div className="min-w-0 px-4 py-4 first:pl-0 last:pr-0 md:px-5">
      <p className="text-xs font-medium text-slate-500 dark:text-[#94a19c]">{label}</p>
      <p title={valorCompleto} className={`mt-1 whitespace-nowrap text-xl font-bold tabular-nums md:text-2xl ${tono === "negativo" ? "text-rose-600 dark:text-rose-400" : "text-slate-950 dark:text-[#f2f7f4]"}`}>
        {valor}
      </p>
      <div className="mt-1 min-h-5">{nota ? <span className="text-xs text-slate-400 dark:text-[#74817b]">{nota}</span> : <Delta valor={delta} />}</div>
    </div>
  );
}

function Reparto({ titulo, datos, etiquetas }: { titulo: string; datos: Mapa; etiquetas?: Record<string, string> }) {
  const filas = Object.entries(datos).sort((a, b) => b[1] - a[1]);
  const total = filas.reduce((s, [, valor]) => s + valor, 0);
  if (total <= 0) return <p className="text-sm text-slate-400 dark:text-[#74817b]">Sin datos para este período.</p>;

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-[#e0e7e3]">{titulo}</h3>
      <div className="mt-3 space-y-3">
        {filas.slice(0, 8).map(([nombre, valor]) => {
          const porcentaje = (valor / total) * 100;
          return (
            <div key={nombre}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-slate-600 dark:text-[#c1cbc6]">{etiquetas?.[nombre] ?? nombre}</span>
                <span className="shrink-0 tabular-nums text-slate-500 dark:text-[#94a19c]">{porcentaje.toFixed(0)}% · {plata(valor)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[#18201d]">
                <div className="h-full rounded-full bg-emerald-700 dark:bg-[#37e6b0]" style={{ width: `${Math.max(porcentaje, 1)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Stock = {
  diasEnSerie: number;
  productosSeguidos: number;
  movimientos: { fecha: string; local: string; producto: string; stock: number; vendido: number; movimiento: number }[];
};

function SerieStock({ localNombre }: { localNombre?: string }) {
  const [stock, setStock] = useState<Stock | null>(null);

  useEffect(() => {
    fetch("/api/stock")
      .then((respuesta) => (respuesta.ok ? respuesta.json() : null))
      .then(setStock)
      .catch(() => setStock(null));
  }, []);

  if (!stock || stock.productosSeguidos === 0) return null;
  const movimientos = localNombre
    ? stock.movimientos.filter((movimiento) => movimiento.local === localNombre)
    : stock.movimientos;

  return (
    <Panel>
      <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Movimientos de stock sin explicar</h2>
          <span className="text-xs text-slate-400 dark:text-[#74817b]">{stock.productosSeguidos} productos · {stock.diasEnSerie} días</span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-[#94a19c]">
          Diferencia entre el stock esperado por ventas y la foto diaria. Un valor negativo puede ser faltante o ajuste manual.
        </p>
      </div>
      <div className="divide-y divide-slate-100 px-4 dark:divide-[#1c2521]">
        {movimientos.length === 0 ? (
          <p className="py-5 text-sm text-slate-500 dark:text-[#94a19c]">No hay movimientos para revisar en el alcance seleccionado.</p>
        ) : (
          movimientos.slice(0, 12).map((movimiento) => (
            <div key={`${movimiento.fecha}-${movimiento.local}-${movimiento.producto}`} className="flex items-baseline justify-between gap-3 py-3 text-sm">
              <span className="min-w-0 truncate text-slate-700 dark:text-[#c1cbc6]">
                {movimiento.producto}
                <span className="ml-2 text-xs text-slate-400 dark:text-[#74817b]">{movimiento.local} · {movimiento.fecha}</span>
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${movimiento.movimiento < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-[#c1cbc6]"}`}>
                {movimiento.movimiento > 0 ? "+" : ""}{movimiento.movimiento.toLocaleString("es-AR")}
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function agruparSerie(puntos: PuntoSerie[], dias: number, metrica: MetricaGrafico): ComparisonPoint[] {
  if (puntos.length === 0) return [];
  const grupos = new Map<string, PuntoSerie[]>();
  for (const punto of puntos) {
    const fecha = new Date(`${punto.fecha}T12:00:00Z`);
    let clave = punto.fecha;
    if (dias > 180) clave = punto.fecha.slice(0, 7);
    else if (dias > 60) {
      const dia = fecha.getUTCDay();
      fecha.setUTCDate(fecha.getUTCDate() - (dia === 0 ? 6 : dia - 1));
      clave = fecha.toISOString().slice(0, 10);
    }
    const grupo = grupos.get(clave) ?? [];
    grupo.push(punto);
    grupos.set(clave, grupo);
  }

  return [...grupos.values()].map((grupo) => {
    const validos = grupo.filter((punto) => punto.ventas != null && punto.tickets != null);
    const ventas = validos.reduce((s, punto) => s + (punto.ventas ?? 0), 0);
    const tickets = validos.reduce((s, punto) => s + (punto.tickets ?? 0), 0);
    const valor =
      validos.length === 0
        ? null
        : metrica === "ventas"
          ? ventas
          : metrica === "tickets"
            ? tickets
            : tickets > 0
              ? ventas / tickets
              : null;
    return {
      fecha: grupo[0].fecha,
      valor,
      completo: grupo.every((punto) => punto.completo),
    };
  });
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Cargando tablero">
      <div className="h-28 rounded-lg bg-slate-200/70 dark:bg-[#172724]" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-lg bg-slate-200/70 dark:bg-[#172724]" />)}
      </div>
      <div className="h-80 rounded-lg bg-slate-200/70 dark:bg-[#172724]" />
    </div>
  );
}

export type EstadoInicial = {
  vista?: string;
  periodo?: string;
  mes?: string;
  anio?: string;
  desde?: string;
  hasta?: string;
  local?: string;
};

const esDia = (valor: string | undefined): valor is string => /^\d{4}-\d{2}-\d{2}$/.test(valor ?? "");

export default function DashboardClient({ inicial = {} }: { inicial?: EstadoInicial }) {
  const hoy = useMemo(() => hoyAR(), []);
  const [vista, setVista] = useState<Vista>(
    VISTAS.some((v) => v.clave === inicial.vista) ? (inicial.vista as Vista) : "rendimiento"
  );
  const [periodo, setPeriodo] = useState<Periodo>(
    PERIODOS.some((p) => p.clave === inicial.periodo) ? (inicial.periodo as Periodo) : "mes"
  );
  const [mesElegido, setMesElegido] = useState(
    /^\d{4}-\d{2}$/.test(inicial.mes ?? "") ? inicial.mes! : hoy.slice(0, 7)
  );
  const [anioElegido, setAnioElegido] = useState(
    /^\d{4}$/.test(inicial.anio ?? "") ? inicial.anio! : hoy.slice(0, 4)
  );
  const [desde, setDesde] = useState(esDia(inicial.desde) ? inicial.desde : sumarDias(hoy, -29));
  const [hasta, setHasta] = useState(esDia(inicial.hasta) ? inicial.hasta : hoy);
  const [alcance, setAlcance] = useState(inicial.local ?? "");
  const [metricaGrafico, setMetricaGrafico] = useState<MetricaGrafico>("ventas");
  const [datos, setDatos] = useState<Dash | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [avisoSync, setAvisoSync] = useState("");

  useEffect(() => {
    const controlador = new AbortController();
    const params = new URLSearchParams({ periodo });
    if (periodo === "mes-calendario") params.set("mes", mesElegido);
    if (periodo === "anio-calendario") params.set("anio", anioElegido);
    if (periodo === "rango") {
      params.set("desde", desde);
      params.set("hasta", hasta);
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reactivo sin librería de datos
    setCargando(true);
    setError("");
    fetch(`/api/dashboard?${params}`, { signal: controlador.signal })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error("No se pudo cargar el tablero");
        return respuesta.json();
      })
      .then((respuesta) => setDatos(respuesta))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("No pudimos cargar los datos. Revisá la conexión y volvé a intentar.");
        setDatos(null);
      })
      .finally(() => {
        if (!controlador.signal.aborted) setCargando(false);
      });
    return () => controlador.abort();
  }, [periodo, mesElegido, anioElegido, desde, hasta, revision]);

  // El estado vive también en la URL: recargar no vuelve a la vista por
  // defecto y el link que se manda muestra lo mismo que se está viendo.
  // `replaceState` y no `router.replace` a propósito: los datos ya se piden
  // por fetch, así que no hace falta navegar ni pisar el historial.
  useEffect(() => {
    const params = new URLSearchParams();
    if (vista !== "rendimiento") params.set("vista", vista);
    if (periodo !== "mes") params.set("periodo", periodo);
    if (periodo === "mes-calendario") params.set("mes", mesElegido);
    if (periodo === "anio-calendario") params.set("anio", anioElegido);
    if (periodo === "rango") {
      params.set("desde", desde);
      params.set("hasta", hasta);
    }
    if (alcance) params.set("local", alcance);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [vista, periodo, mesElegido, anioElegido, desde, hasta, alcance]);

  async function sincronizar() {
    if (!datos) return;
    setSincronizando(true);
    setAvisoSync("");
    const conFudo = datos.locales.filter((local) => local.tieneFudo);
    const objetivos = alcance ? conFudo.filter((local) => local.localId === alcance) : conFudo;
    const resultados = await Promise.all(
      objetivos.map(async (local) => (await fetch(`/api/locales/${local.localId}/resumen/sync?dias=7`, { method: "POST" })).ok)
    );
    setAvisoSync(`Actualizados ${resultados.filter(Boolean).length} de ${objetivos.length} locales.`);
    setSincronizando(false);
    setRevision((valor) => valor + 1);
  }

  const locales = datos?.locales.filter((local) => local.tieneFudo) ?? [];
  const localesOrdenados = [...locales].sort((a, b) => b.ventas - a.ventas);
  const localActivo = locales.find((local) => local.localId === alcance);
  const serie = localActivo?.serie ?? datos?.cadena.serie;
  const comparacionValida = localActivo ? localActivo.baseComparable : (datos?.cadena.localesSinBase.length ?? 0) === 0;
  const ventas = localActivo?.ventas ?? datos?.cadena.ventas ?? 0;
  const tickets = localActivo?.tickets ?? datos?.cadena.tickets ?? 0;
  const ticketsPrevio = localActivo?.ticketsPrevio ?? datos?.cadena.ticketsPrevio ?? 0;
  const ticketPromedio = localActivo?.ticketPromedio ?? datos?.cadena.ticketPromedio ?? 0;
  const ticketPromedioPrevio = localActivo?.ticketPromedioPrevio ?? datos?.cadena.ticketPromedioPrevio ?? 0;
  const resultado = localActivo?.resultado ?? datos?.cadena.resultado ?? 0;
  const resultadoPrevio = localActivo?.resultadoPrevio ?? datos?.cadena.resultadoPrevio ?? 0;
  const costoIncompleto = localActivo?.costoIncompleto ?? locales.some((local) => local.costoIncompleto);
  const alertas = (datos?.alertas ?? []).filter((alerta) => !alcance || alerta.localId === alcance || alerta.localId == null);
  const diasCompletos = serie?.actual.filter((punto) => punto.completo).length ?? 0;
  const etiquetaAlcance = localActivo?.nombre ?? "Toda la cadena";
  const formatoGrafico = metricaGrafico === "ventas" || metricaGrafico === "ticketPromedio" ? plataCompacta : numeroCompacto;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        subtitle="Ventas, locales y señales para decidir"
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={sincronizar} disabled={sincronizando || !datos} title="Sincronizar últimos 7 días">
              <RefreshCw size={16} className={sincronizando ? "animate-spin" : ""} aria-hidden />
              <span className="hidden sm:inline">{sincronizando ? "Actualizando" : "Actualizar"}</span>
            </Button>
            <Link
              href={`/admin/pronostico${alcance ? `?localId=${alcance}` : ""}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:bg-[#37e6b0] dark:text-[#062419] dark:hover:bg-[#7bf0ca]"
            >
              <BrainCircuit size={16} aria-hidden />
              <span className="hidden sm:inline">Abrir pronóstico</span>
            </Link>
          </div>
        }
      >
        Centro de comando
      </PageTitle>

      <Panel className="md:sticky md:top-[4.75rem] md:z-[9]">
        <div className="flex flex-col gap-3 p-3.5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="scrollbar-hidden flex min-w-0 items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
              <Building2 size={16} className="shrink-0 text-slate-400" aria-hidden />
              <div className="inline-flex min-w-max rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-[#29403b] dark:bg-[#0b1412]" role="group" aria-label="Alcance del tablero">
                <button
                  type="button"
                  aria-pressed={!alcance}
                  onClick={() => setAlcance("")}
                  className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#37e6b0] ${!alcance ? "bg-white text-slate-900 shadow-sm dark:bg-[#1d4e48] dark:text-[#f2f7f4]" : "text-slate-500 hover:text-slate-800 dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"}`}
                >
                  Cadena
                </button>
                {locales.map((local) => (
                  <button
                    key={local.localId}
                    type="button"
                    aria-pressed={alcance === local.localId}
                    onClick={() => setAlcance(local.localId)}
                    className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#37e6b0] ${alcance === local.localId ? "bg-white text-slate-900 shadow-sm dark:bg-[#1d4e48] dark:text-[#f2f7f4]" : "text-slate-500 hover:text-slate-800 dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"}`}
                  >
                    {local.nombre}
                  </button>
                ))}
              </div>
            </div>
            <div className="scrollbar-hidden flex min-w-0 items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
              <CalendarRange size={16} className="shrink-0 text-slate-400" aria-hidden />
              <SelectorSegmentado opciones={PERIODOS} valor={periodo} onChange={setPeriodo} label="Período del tablero" />
            </div>
          </div>

          {(periodo === "mes-calendario" || periodo === "anio-calendario" || periodo === "rango") && (
            <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3 dark:border-[#1c2521]">
              {periodo === "mes-calendario" && (
                <div className="w-full sm:w-48">
                  <Label>Mes</Label>
                  <Input type="month" max={hoy.slice(0, 7)} value={mesElegido} onChange={(evento) => setMesElegido(evento.target.value)} />
                </div>
              )}
              {periodo === "anio-calendario" && (
                <div className="w-full sm:w-40">
                  <Label>Año</Label>
                  <select
                    value={anioElegido}
                    onChange={(evento) => setAnioElegido(evento.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#f2f7f4]"
                  >
                    {Array.from({ length: 4 }, (_, indice) => String(Number(hoy.slice(0, 4)) - indice)).map((anio) => <option key={anio}>{anio}</option>)}
                  </select>
                </div>
              )}
              {periodo === "rango" && (
                <>
                  <div className="w-[calc(50%-0.375rem)] sm:w-48">
                    <Label>Desde</Label>
                    <Input type="date" max={hasta} value={desde} onChange={(evento) => setDesde(evento.target.value)} />
                  </div>
                  <div className="w-[calc(50%-0.375rem)] sm:w-48">
                    <Label>Hasta</Label>
                    <Input type="date" min={desde} max={hoy} value={hasta} onChange={(evento) => setHasta(evento.target.value)} />
                  </div>
                </>
              )}
            </div>
          )}

          {datos && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs dark:border-[#1c2521]">
              <p className="text-slate-500 dark:text-[#94a19c]">
                <strong className="font-semibold text-slate-700 dark:text-[#c1cbc6]">{etiquetaAlcance}</strong> · {fmtFecha(datos.rango.desde)} a {fmtFecha(datos.rango.hasta)}
              </p>
              <p className="text-slate-400 dark:text-[#74817b]">
                Referencia: {fmtFecha(datos.rangoPrevio.desde)} a {fmtFecha(datos.rangoPrevio.hasta)} · {diasCompletos}/{datos.dias} días completos
              </p>
            </div>
          )}
        </div>
      </Panel>

      <div className="scrollbar-hidden overflow-x-auto">
        <SelectorSegmentado opciones={VISTAS} valor={vista} onChange={setVista} label="Vista del centro de comando" />
      </div>

      {avisoSync && <p className="text-sm font-medium text-emerald-700 dark:text-[#4ee6b0]">{avisoSync}</p>}
      {error ? (
        <EmptyState>
          <span>{error}</span>
          <Button type="button" variant="ghost" className="mx-auto mt-3" onClick={() => setRevision((valor) => valor + 1)}>Reintentar</Button>
        </EmptyState>
      ) : cargando || !datos || !serie ? (
        <DashboardSkeleton />
      ) : (
        <div className={cargando ? "opacity-60" : ""} aria-busy={cargando}>
          {vista === "rendimiento" && (
            <div className="space-y-5">
              <section className="grid grid-cols-2 divide-x divide-y border-y border-slate-200 md:grid-cols-4 md:divide-y-0 dark:border-[#29403b] dark:divide-[#29403b]">
                <Metrica label="Facturación" valor={plataCompacta(ventas)} valorCompleto={plata(ventas)} delta={localActivo ? localActivo.variacionVentas : datos.cadena.variacionVentas} />
                <Metrica label="Tickets" valor={tickets.toLocaleString("es-AR")} delta={comparacionValida ? variacion(tickets, ticketsPrevio) : null} />
                <Metrica label="Ticket promedio" valor={plata(ticketPromedio)} delta={comparacionValida ? variacion(ticketPromedio, ticketPromedioPrevio) : null} />
                <Metrica
                  label="Resultado operativo"
                  valor={plataCompacta(resultado)}
                  valorCompleto={plata(resultado)}
                  delta={comparacionValida ? variacion(resultado, resultadoPrevio) : null}
                  nota={costoIncompleto ? "estimado: faltan costos en Fudo" : undefined}
                  tono={resultado < 0 ? "negativo" : "normal"}
                />
              </section>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,0.72fr)]">
                <Panel>
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between dark:border-[#1c2521]">
                    <div>
                      <h2 className="font-semibold">Evolución de {etiquetaAlcance}</h2>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">La línea punteada alinea la forma del período anterior como referencia.</p>
                    </div>
                    <div className="scrollbar-hidden overflow-x-auto">
                      <SelectorSegmentado opciones={METRICAS_GRAFICO} valor={metricaGrafico} onChange={setMetricaGrafico} label="Métrica del gráfico" />
                    </div>
                  </div>
                  <div className="p-4">
                    <ComparisonChart
                      actual={agruparSerie(serie.actual, datos.dias, metricaGrafico)}
                      referencia={agruparSerie(serie.previo, datos.dias, metricaGrafico)}
                      formato={formatoGrafico}
                    />
                    {diasCompletos < datos.dias && (
                      <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                        Los puntos ámbar son parciales. La facturación los incluye, pero las variaciones excluyen bases incompletas.
                      </p>
                    )}
                  </div>
                </Panel>

                <Panel>
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-semibold">Requiere atención</h2>
                      <Badge tone={alertas.length > 0 ? "amber" : "emerald"}>{alertas.length}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Sólo excepciones del alcance elegido.</p>
                  </div>
                  <div className="divide-y divide-slate-100 px-4 dark:divide-[#1c2521]">
                    {alertas.length === 0 ? (
                      <div className="flex items-start gap-2 py-5 text-sm text-slate-600 dark:text-[#c1cbc6]">
                        <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700 dark:text-[#4ee6b0]" aria-hidden />
                        No hay excepciones relevantes en este período.
                      </div>
                    ) : (
                      alertas.slice(0, 6).map((alerta) => (
                        <div key={alerta.texto} className="flex items-start gap-2 py-3 text-sm">
                          <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${alerta.tono === "rose" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`} aria-hidden />
                          <span className="text-slate-700 dark:text-[#c1cbc6]">{alerta.texto}</span>
                        </div>
                      ))
                    )}
                  </div>
                </Panel>
              </div>

              {!alcance && datos.cadena.localesSinBase.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-[#94a19c]">
                  La variación de cadena deja afuera a {datos.cadena.localesSinBase.join(", ")} porque su período de referencia está incompleto. Sus ventas sí están incluidas en el total.
                </p>
              )}
            </div>
          )}

          {vista === "locales" && (
            <div className="space-y-5">
              {locales.length === 0 ? (
                <EmptyState>Ningún local tiene Fudo configurado todavía.</EmptyState>
              ) : (
                <>
                  <Panel>
                    <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                      <h2 className="font-semibold">Comparación entre locales</h2>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Mismo período y misma referencia para todas las sucursales.</p>
                    </div>
                    <div className="divide-y divide-slate-100 md:hidden dark:divide-[#1c2521]">
                      {localesOrdenados.map((local) => {
                        const participacion = datos.cadena.ventas > 0 ? `${((local.ventas / datos.cadena.ventas) * 100).toFixed(0)}% de la cadena` : "Sin participación calculable";
                        const variacionLocal = local.variacionVentas == null ? "—" : `${local.variacionVentas >= 0 ? "+" : ""}${local.variacionVentas.toFixed(1)}%`;
                        return (
                          <button
                            key={local.localId}
                            type="button"
                            onClick={() => setAlcance(local.localId)}
                            className={`w-full px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${alcance === local.localId ? "bg-emerald-50/70 dark:bg-[#132a25]" : "hover:bg-slate-50 dark:hover:bg-[#13201d]"}`}
                          >
                            <span className="flex items-start justify-between gap-3">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-[#f2f7f4]">{local.nombre}<ArrowRight size={14} aria-hidden /></span>
                              <span className="text-xs tabular-nums text-slate-500 dark:text-[#94a19c]">{local.diasConDatos}/{datos.dias} días</span>
                            </span>
                            <span className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3">
                              <span>
                                <span className="block text-xs text-slate-500 dark:text-[#94a19c]">Facturación</span>
                                <span className="mt-0.5 block font-semibold tabular-nums">{plata(local.ventas)}</span>
                                <span className="block text-xs text-slate-400 dark:text-[#74817b]">{participacion}</span>
                              </span>
                              <span>
                                <span className="block text-xs text-slate-500 dark:text-[#94a19c]">Variación</span>
                                <span className={`mt-0.5 block font-semibold tabular-nums ${local.variacionVentas == null ? "text-slate-400" : local.variacionVentas >= 0 ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>{variacionLocal}</span>
                              </span>
                              <span>
                                <span className="block text-xs text-slate-500 dark:text-[#94a19c]">Tickets · promedio</span>
                                <span className="mt-0.5 block font-semibold tabular-nums">{local.tickets.toLocaleString("es-AR")} · {plata(local.ticketPromedio)}</span>
                              </span>
                              <span>
                                <span className="block text-xs text-slate-500 dark:text-[#94a19c]">Resultado · descuentos</span>
                                <span className={`mt-0.5 block font-semibold tabular-nums ${local.resultado < 0 ? "text-rose-600 dark:text-rose-300" : ""}`}>{plata(local.resultado)} · {local.porcentajeDescuentos.toFixed(1)}%</span>
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="hidden overflow-x-auto md:flex">
                      <table className="w-full min-w-[58rem] text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-[#29403b] dark:text-[#94a19c]">
                            <th className="px-4 py-3 font-semibold">Local</th>
                            <th className="px-3 py-3 text-right font-semibold">Facturación</th>
                            <th className="px-3 py-3 text-right font-semibold">Participación</th>
                            <th className="px-3 py-3 text-right font-semibold">Variación</th>
                            <th className="px-3 py-3 text-right font-semibold">Tickets</th>
                            <th className="px-3 py-3 text-right font-semibold">Ticket promedio</th>
                            <th className="px-3 py-3 text-right font-semibold">Descuentos</th>
                            <th className="px-3 py-3 text-right font-semibold">Resultado</th>
                            <th className="px-4 py-3 text-right font-semibold">Cobertura</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                          {localesOrdenados.map((local) => (
                            <tr key={local.localId} className={alcance === local.localId ? "bg-emerald-50/70 dark:bg-[#132a25]" : "hover:bg-slate-50 dark:hover:bg-[#13201d]"}>
                              <td className="px-4 py-3">
                                <button type="button" onClick={() => setAlcance(local.localId)} className="inline-flex items-center gap-1.5 font-semibold text-slate-900 underline-offset-4 hover:text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-[#f2f7f4] dark:hover:text-[#4ee6b0]">
                                  {local.nombre}<ArrowRight size={13} aria-hidden />
                                </button>
                              </td>
                              <td className="px-3 py-3 text-right font-semibold tabular-nums">{plata(local.ventas)}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">{ventas > 0 ? `${((local.ventas / datos.cadena.ventas) * 100).toFixed(0)}%` : "—"}</td>
                              <td className={`px-3 py-3 text-right font-semibold tabular-nums ${local.variacionVentas == null ? "text-slate-400" : local.variacionVentas >= 0 ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>
                                {local.variacionVentas == null ? "—" : `${local.variacionVentas >= 0 ? "+" : ""}${local.variacionVentas.toFixed(1)}%`}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">{local.tickets.toLocaleString("es-AR")}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{plata(local.ticketPromedio)}</td>
                              <td className={`px-3 py-3 text-right tabular-nums ${local.porcentajeDescuentos >= 5 ? "text-amber-700 dark:text-amber-300" : ""}`}>{local.porcentajeDescuentos.toFixed(1)}%</td>
                              <td className={`px-3 py-3 text-right font-semibold tabular-nums ${local.resultado < 0 ? "text-rose-600 dark:text-rose-300" : ""}`}>
                                {plata(local.resultado)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">{local.diasConDatos}/{datos.dias} días</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>

                  {localActivo ? (
                    <Panel>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                        <div>
                          <h2 className="font-semibold">Cómo se compone {localActivo.nombre}</h2>
                          <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Canales, cobros y categorías dentro del período seleccionado.</p>
                        </div>
                        <Link href={`/admin/pronostico?localId=${localActivo.localId}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-[#29403b] dark:text-[#e0e7e3] dark:hover:bg-[#172724]">
                          <BrainCircuit size={15} aria-hidden /> Ver pronóstico
                        </Link>
                      </div>
                      <div className="grid gap-8 p-4 lg:grid-cols-3">
                        <Reparto titulo="Canal" datos={localActivo.porCanal} etiquetas={ETIQUETA_CANAL} />
                        <Reparto titulo="Medio de pago" datos={localActivo.porMedioPago} />
                        <Reparto titulo="Categoría" datos={localActivo.porCategoria} />
                      </div>
                      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                        <Badge tone="slate">{localActivo.personas.toLocaleString("es-AR")} comensales declarados</Badge>
                        <Badge tone={localActivo.porcentajeDescuentos >= 5 ? "amber" : "slate"}>{plata(localActivo.descuentos)} en descuentos</Badge>
                        {localActivo.anulaciones > 0 && <Badge tone="amber">{plata(localActivo.anulaciones)} anulado</Badge>}
                        {localActivo.sincronizadoEn && <Badge tone="slate">Sync {new Date(localActivo.sincronizadoEn).toLocaleString("es-AR")}</Badge>}
                      </div>
                    </Panel>
                  ) : (
                    <Panel className="p-5">
                      <p className="text-sm text-slate-600 dark:text-[#c1cbc6]">Elegí un local en la tabla o en la barra superior para abrir su composición sin perder el período.</p>
                    </Panel>
                  )}
                </>
              )}
            </div>
          )}

          {vista === "control" && (
            <div className="space-y-5">
              <ProductosPanel desde={datos.rango.desde} hasta={datos.rango.hasta} localId={alcance} />
              <SerieStock localNombre={localActivo?.nombre} />
              {datos.cadena.localesSinFudo.length > 0 && (
                <Panel className="p-4">
                  <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                    Sin datos de Fudo: {datos.cadena.localesSinFudo.join(", ")}. Configurá esas credenciales para incluirlos en el tablero.
                  </p>
                </Panel>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
