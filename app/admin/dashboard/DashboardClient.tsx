"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { ComparisonChart, type ComparisonPoint } from "@/components/AnalyticsCharts";
import PeriodoSelector, { usePeriodo } from "@/components/PeriodoSelector";
import { BarraContexto, SelectorLocal } from "@/components/BarraContexto";
import { Badge, Button, EmptyState, Input, Metrica, PageTitle, Panel, SelectorSegmentado } from "@/components/ui";
import ProductosPanel from "./ProductosPanel";
import { fechaCompleta, fechaLarga, numeroCompacto, plata, plataCompacta, numero } from "@/lib/formato";
import { sumarDias } from "@/lib/fechaAR";

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
  topProductos: { nombre: string; valor: number }[];
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
  alertasPersonal: {
    id: string;
    tipo: string;
    fecha: string;
    detalle: string;
    localId: string;
    empleado: string;
    local: string;
  }[];
};

type MetricaGrafico = "ventas" | "tickets" | "ticketPromedio";
type Vista = "rendimiento" | "locales" | "control" | "alertas";

const VISTAS: { clave: Vista; label: string }[] = [
  { clave: "rendimiento", label: "Rendimiento" },
  { clave: "locales", label: "Locales" },
  { clave: "control", label: "Productos y control" },
  { clave: "alertas", label: "Alertas" },
];

/**
 * Qué dice cada tipo de alerta de personal en castellano.
 *
 * El enum de la base es para el código; a nadie le sirve leer
 * "SALIDA_OLVIDADA" en una pantalla.
 */
const TIPO_ALERTA: Record<string, string> = {
  NO_FICHO: "No fichó",
  LLEGADA_TARDE: "Llegó tarde",
  SALIDA_OLVIDADA: "Salida olvidada",
  EXCESO_HORARIO: "Exceso de horario",
};

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
const fmtFechaLarga = (iso: string) => {
  const texto = fechaCompleta(iso);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const variacion = (actual: number, previo: number) => (previo > 0 ? ((actual - previo) / previo) * 100 : null);

function Reparto({ titulo, datos, etiquetas }: { titulo: string; datos: Mapa; etiquetas?: Record<string, string> }) {
  const filas = Object.entries(datos).sort((a, b) => b[1] - a[1]);
  const total = filas.reduce((s, [, valor]) => s + valor, 0);
  if (total <= 0) return <p className="text-sm text-slate-500 dark:text-[#7a8882]">Sin datos para este período.</p>;

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
  desde: string;
  hasta: string;
  diasEnSerie: number;
  productosSeguidos: number;
  movimientos: { fecha: string; local: string; producto: string; stock: number; vendido: number; movimiento: number }[];
};

/**
 * Movimientos de stock que las ventas no explican, en el mismo alcance que el
 * resto de "Productos y control": período y local elegidos arriba. Distingue
 * cuatro situaciones que antes se veían igual (nada en pantalla): cargando,
 * error de red, todavía no hay fotos de stock en ese rango, y hay fotos pero
 * las diferencias son cero.
 */
function SerieStock({ desde, hasta, localId }: { desde: string; hasta: string; localId: string }) {
  const [stock, setStock] = useState<Stock | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    // Una respuesta vieja no puede pisar a una nueva: cambiar de período dos
    // veces seguidas dejaba en pantalla el que tardó más en volver, no el último.
    const controlador = new AbortController();
    const params = new URLSearchParams({ desde, hasta, ...(localId ? { localId } : {}) });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reactivo sin librería de datos
    setCargando(true);
    setError(false);
    fetch(`/api/stock?${params}`, { signal: controlador.signal })
      .then((respuesta) => (respuesta.ok ? respuesta.json() : Promise.reject(new Error("fallo"))))
      .then((d: Stock) => setStock(d))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(true);
      })
      .finally(() => {
        if (!controlador.signal.aborted) setCargando(false);
      });
    return () => controlador.abort();
  }, [desde, hasta, localId, intento]);

  const encabezado = (
    <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Movimientos de stock sin explicar</h2>
        {stock && stock.productosSeguidos > 0 && (
          <span className="text-xs text-slate-500 dark:text-[#94a19c]">
            {stock.productosSeguidos} productos · {stock.diasEnSerie} {stock.diasEnSerie === 1 ? "día" : "días"} con foto
          </span>
        )}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-[#94a19c]">
        Diferencia entre el stock esperado por ventas y la foto diaria, del período elegido. Un valor negativo puede ser
        faltante o ajuste manual.
      </p>
    </div>
  );

  let cuerpo: React.ReactNode;
  if (cargando && !stock) {
    cuerpo = <div className="my-4 h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-[#172724]" aria-label="Cargando stock" />;
  } else if (error) {
    cuerpo = (
      <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
        <span className="text-rose-600 dark:text-rose-400">No pudimos cargar el stock. Revisá la conexión.</span>
        <Button type="button" variant="ghost" onClick={() => setIntento((v) => v + 1)}>
          Reintentar
        </Button>
      </div>
    );
  } else if (!stock || stock.productosSeguidos === 0) {
    cuerpo = (
      <p className="py-5 text-sm text-slate-500 dark:text-[#94a19c]">
        Todavía no hay fotos de stock en este período. La foto se toma sola a las 3 de la mañana: si el rango es anterior
        a que se empezara a tomar, no hay nada que comparar.
      </p>
    );
  } else if (stock.movimientos.length === 0) {
    cuerpo = (
      <p className="flex items-start gap-2 py-5 text-sm text-slate-600 dark:text-[#c1cbc6]">
        <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700 dark:text-[#4ee6b0]" aria-hidden />
        Hay fotos de stock y todas coinciden con lo vendido: no hay movimientos para revisar.
      </p>
    );
  } else {
    cuerpo = (
      <>
        {stock.movimientos.slice(0, 12).map((movimiento) => (
          <div
            key={`${movimiento.fecha}-${movimiento.local}-${movimiento.producto}`}
            className="flex items-baseline justify-between gap-3 py-3 text-sm"
          >
            <span className="min-w-0 text-slate-700 dark:text-[#c1cbc6]">
              <span className="block truncate">{movimiento.producto}</span>
              <span className="text-xs text-slate-500 dark:text-[#94a19c]">
                {movimiento.local} · {fechaLarga(movimiento.fecha)}
              </span>
            </span>
            <span
              className={`shrink-0 font-semibold tabular-nums ${
                movimiento.movimiento < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-[#c1cbc6]"
              }`}
            >
              {movimiento.movimiento > 0 ? "+" : ""}
              {numero(movimiento.movimiento)}
            </span>
          </div>
        ))}
      </>
    );
  }

  return (
    <Panel>
      {encabezado}
      <div className="divide-y divide-slate-100 px-4 dark:divide-[#1c2521]">{cuerpo}</div>
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

function DetalleDiario({
  local,
  fecha,
  referencia,
}: {
  local: LocalDash;
  fecha: string;
  referencia: string;
}) {
  const comparable = local.diasConDatos === 1 && local.baseComparable;

  if (local.diasConDatos === 0) {
    return (
      <Panel>
        <EmptyState>
          <strong className="block text-slate-800 dark:text-[#f2f7f4]">Sin ventas registradas</strong>
          <span className="mt-1 block">No hay un cierre de Fudo sincronizado para {local.nombre} el {fechaLarga(fecha)}.</span>
        </EmptyState>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
          <div>
            <h2 className="font-semibold">{fmtFechaLarga(fecha)}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Ventas registradas en {local.nombre}.</p>
          </div>
          <Badge tone="emerald">Día sincronizado</Badge>
        </div>
        <section className="grid grid-cols-2 divide-x divide-y divide-slate-200 md:grid-cols-4 md:divide-y-0 dark:divide-[#29403b]">
          <Metrica
            label="Ventas del día"
            valor={plataCompacta(local.ventas)}
            valorCompleto={plata(local.ventas)}
            delta={comparable ? local.variacionVentas : null}
            textoDelta="vs. día anterior"
          />
          <Metrica
            label="Tickets"
            valor={numero(local.tickets)}
            delta={comparable ? variacion(local.tickets, local.ticketsPrevio) : null}
            textoDelta="vs. día anterior"
          />
          <Metrica
            label="Ticket promedio"
            valor={plata(local.ticketPromedio)}
            delta={comparable ? variacion(local.ticketPromedio, local.ticketPromedioPrevio) : null}
            textoDelta="vs. día anterior"
          />
          <Metrica
            label="Resultado del día"
            valor={plataCompacta(local.resultado)}
            valorCompleto={plata(local.resultado)}
            delta={comparable ? variacion(local.resultado, local.resultadoPrevio) : null}
            textoDelta="vs. día anterior"
            nota={local.costoIncompleto ? "estimado: faltan costos en Fudo" : undefined}
            tono={local.resultado < 0 ? "negativo" : "normal"}
          />
        </section>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3 dark:border-[#1c2521]">
          <Badge tone="slate">Referencia: {fechaLarga(referencia)}</Badge>
          <Badge tone="slate">{numero(local.personas)} comensales</Badge>
          <Badge tone={local.porcentajeDescuentos >= 5 ? "amber" : "slate"}>
            {plata(local.descuentos)} en descuentos
          </Badge>
          {local.anulaciones > 0 && <Badge tone="amber">{plata(local.anulaciones)} anulado</Badge>}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.55fr)]">
        <Panel>
          <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
            <h2 className="font-semibold">Cómo se vendió</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Canales, cobros y categorías de la fecha elegida.</p>
          </div>
          <div className="grid gap-8 p-4 lg:grid-cols-3">
            <Reparto titulo="Canal" datos={local.porCanal} etiquetas={ETIQUETA_CANAL} />
            <Reparto titulo="Medio de pago" datos={local.porMedioPago} />
            <Reparto titulo="Categoría" datos={local.porCategoria} />
          </div>
        </Panel>

        <Panel>
          <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
            <h2 className="font-semibold">Productos con más facturación</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Ranking del día según el cierre de Fudo.</p>
          </div>
          {local.topProductos.length === 0 ? (
            <p className="px-4 py-5 text-sm text-slate-500 dark:text-[#94a19c]">No hay detalle por producto para esta fecha.</p>
          ) : (
            <ol className="divide-y divide-slate-100 px-4 dark:divide-[#1c2521]">
              {local.topProductos.slice(0, 8).map((producto, indice) => (
                <li key={producto.nombre} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-2 py-3 text-sm">
                  <span className="text-xs tabular-nums text-slate-500 dark:text-[#7a8882]">{indice + 1}</span>
                  <span className="truncate font-medium text-slate-700 dark:text-[#c1cbc6]" title={producto.nombre}>{producto.nombre}</span>
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-[#f2f7f4]">{plata(producto.valor)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
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
  dia?: string;
  local?: string;
};

const esDia = (valor: string | undefined): valor is string => /^\d{4}-\d{2}-\d{2}$/.test(valor ?? "");

export default function DashboardClient({ inicial = {} }: { inicial?: EstadoInicial }) {
  const hoy = useMemo(() => hoyAR(), []);
  const [vista, setVista] = useState<Vista>(
    VISTAS.some((v) => v.clave === inicial.vista) ? (inicial.vista as Vista) : "rendimiento"
  );
  // El período es el mismo de todas las pantallas: lo elegido en Compras o
  // Resultado se ve acá, y al revés.
  const { valor: periodo, setValor: setPeriodo, params: paramsPeriodo } = usePeriodo();
  const [fechaLocal, setFechaLocal] = useState(esDia(inicial.dia) ? inicial.dia : hoy);
  const [alcance, setAlcance] = useState(inicial.local ?? "");
  const [metricaGrafico, setMetricaGrafico] = useState<MetricaGrafico>("ventas");
  const [datos, setDatos] = useState<Dash | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [avisoSync, setAvisoSync] = useState("");
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [datosDia, setDatosDia] = useState<Dash | null>(null);
  const [cargandoDia, setCargandoDia] = useState(false);
  const [errorDia, setErrorDia] = useState("");

  useEffect(() => {
    const controlador = new AbortController();
    const params = new URLSearchParams(paramsPeriodo);

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
  }, [paramsPeriodo, revision]);

  useEffect(() => {
    if (vista !== "locales" || !alcance) return;
    const controlador = new AbortController();
    const params = new URLSearchParams({ periodo: "rango", desde: fechaLocal, hasta: fechaLocal });

    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reactivo sin librería de datos
    setCargandoDia(true);
    setErrorDia("");
    fetch(`/api/dashboard?${params}`, { signal: controlador.signal })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error("No se pudo cargar el día");
        return respuesta.json();
      })
      .then((respuesta) => setDatosDia(respuesta))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setErrorDia("No pudimos cargar las ventas de ese día. Revisá la conexión y volvé a intentar.");
        setDatosDia(null);
      })
      .finally(() => {
        if (!controlador.signal.aborted) setCargandoDia(false);
      });
    return () => controlador.abort();
  }, [vista, alcance, fechaLocal, revision]);

  // El estado vive también en la URL: recargar no vuelve a la vista por
  // defecto y el link que se manda muestra lo mismo que se está viendo.
  // `replaceState` y no `router.replace` a propósito: los datos ya se piden
  // por fetch, así que no hace falta navegar ni pisar el historial. El
  // período lo escribe `usePeriodo`; acá sólo lo propio de esta pantalla.
  useEffect(() => {
    const url = new URL(window.location.href);
    const poner = (clave: string, valor: string | null) =>
      valor ? url.searchParams.set(clave, valor) : url.searchParams.delete(clave);
    poner("vista", vista !== "rendimiento" ? vista : null);
    poner("local", alcance || null);
    poner("dia", vista === "locales" && alcance ? fechaLocal : null);
    window.history.replaceState(window.history.state, "", url);
  }, [vista, alcance, fechaLocal]);

  /** El encargado la vio y la da por atendida; deja de aparecer. */
  async function resolverAlerta(id: string) {
    setResolviendo(id);
    const respuesta = await fetch(`/api/alertas/${id}`, { method: "PATCH" });
    setResolviendo(null);
    if (respuesta.ok) setRevision((actual) => actual + 1);
  }

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
  // Las rojas primero: si hay diez, las dos que importan tienen que estar arriba.
  const alertasOrdenadas = [...alertas].sort((a, b) => (a.tono === b.tono ? 0 : a.tono === "rose" ? -1 : 1));
  const alertasPersonal = (datos?.alertasPersonal ?? []).filter((a) => !alcance || a.localId === alcance);
  const totalAlertas = alertas.length + alertasPersonal.length;
  // Las del negocio (rojas primero) y detrás las de personal, que son las que
  // alguien tiene que resolver. Es la lista que resume el panel de Rendimiento.
  const resumenAlertas: { clave: string; tono: "rose" | "amber"; texto: string }[] = [
    ...alertasOrdenadas.map((a) => ({ clave: `n-${a.texto}`, tono: a.tono, texto: a.texto })),
    ...alertasPersonal.map((a) => ({
      clave: `p-${a.id}`,
      tono: "amber" as const,
      texto: `${a.empleado}: ${(TIPO_ALERTA[a.tipo] ?? a.tipo).toLowerCase()} · ${fechaLarga(a.fecha)}`,
    })),
  ];
  const diasCompletos = serie?.actual.filter((punto) => punto.completo).length ?? 0;
  const etiquetaAlcance = localActivo?.nombre ?? "Toda la cadena";
  const modoDetalleDiario = vista === "locales" && Boolean(localActivo);
  const localDia = datosDia?.locales.find((local) => local.localId === alcance);
  const referenciaDia = datosDia?.rangoPrevio.desde ?? sumarDias(fechaLocal, -1);
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

      <BarraContexto
        className="md:sticky md:top-[4.75rem] md:z-[9]"
        campos={[
          {
            etiqueta: "Local",
            contenido: (
              <SelectorLocal
                locales={locales.map((local) => ({ id: local.localId, nombre: local.nombre }))}
                valor={alcance}
                onChange={setAlcance}
              />
            ),
          },
        ]}
        derecha={
          modoDetalleDiario
            ? {
                etiqueta: "Día",
                contenido: (
              <div className="scrollbar-hidden flex min-w-0 items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
                <div className="flex min-w-max items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-[#29403b] dark:bg-[#0b1412]">
                  <button
                    type="button"
                    onClick={() => setFechaLocal((fecha) => sumarDias(fecha, -1))}
                    className="grid h-9 w-9 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-[#94a19c] dark:hover:bg-[#1d4e48] dark:hover:text-[#f2f7f4] dark:focus-visible:ring-[#37e6b0]"
                    aria-label="Día anterior"
                    title="Día anterior"
                  >
                    <ChevronLeft size={17} aria-hidden />
                  </button>
                  <Input
                    type="date"
                    max={hoy}
                    value={fechaLocal}
                    onChange={(evento) => {
                      if (evento.target.value) setFechaLocal(evento.target.value);
                    }}
                    aria-label="Fecha de ventas"
                    required
                    className="h-9 w-[10.5rem] rounded-md border-0 bg-white px-2 py-1 text-sm shadow-sm dark:bg-[#1d4e48]"
                  />
                  <button
                    type="button"
                    onClick={() => setFechaLocal((fecha) => sumarDias(fecha, 1))}
                    disabled={fechaLocal >= hoy}
                    className="grid h-9 w-9 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-35 dark:text-[#94a19c] dark:hover:bg-[#1d4e48] dark:hover:text-[#f2f7f4] dark:focus-visible:ring-[#37e6b0]"
                    aria-label="Día siguiente"
                    title="Día siguiente"
                  >
                    <ChevronRight size={17} aria-hidden />
                  </button>
                  {fechaLocal !== hoy && (
                    <button
                      type="button"
                      onClick={() => setFechaLocal(hoy)}
                      className="h-9 rounded-md px-3 text-xs font-semibold text-emerald-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-[#4ee6b0] dark:hover:bg-[#1d4e48] dark:focus-visible:ring-[#37e6b0]"
                    >
                      Hoy
                    </button>
                  )}
                </div>
              </div>
                ),
              }
            : { etiqueta: "Período", contenido: <PeriodoSelector valor={periodo} onChange={setPeriodo} hoy={hoy} rango={datos?.rango} /> }
        }
        pie={
          modoDetalleDiario
            ? {
                alcance: <>{etiquetaAlcance} · {fmtFechaLarga(fechaLocal)}</>,
                detalle: `Referencia: día anterior · ${fechaLarga(referenciaDia)}`,
              }
            : datos
              ? {
                  alcance: <>{etiquetaAlcance} · {fechaLarga(datos.rango.desde)} a {fechaLarga(datos.rango.hasta)}</>,
                  detalle: `Referencia: ${fechaLarga(datos.rangoPrevio.desde)} a ${fechaLarga(datos.rangoPrevio.hasta)} · ${diasCompletos}/${datos.dias} días completos`,
                }
              : undefined
        }
      />

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
                <Metrica label="Tickets" valor={numero(tickets)} delta={comparacionValida ? variacion(tickets, ticketsPrevio) : null} />
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
                      <Badge tone={totalAlertas > 0 ? "amber" : "emerald"}>{totalAlertas}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Sólo excepciones del alcance elegido.</p>
                  </div>
                  <div className="divide-y divide-slate-100 px-4 dark:divide-[#1c2521]">
                    {totalAlertas === 0 ? (
                      <div className="flex items-start gap-2 py-5 text-sm text-slate-600 dark:text-[#c1cbc6]">
                        <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700 dark:text-[#4ee6b0]" aria-hidden />
                        No hay excepciones relevantes en este período.
                      </div>
                    ) : (
                      <>
                        {/* Una sola lista con las dos fuentes: el número del badge
                            es la suma de negocio y personal, así que el detalle
                            tiene que serlo también. Antes, con 1 a 4 alertas sólo de
                            personal, el panel mostraba "2" y ninguna fila. */}
                        {resumenAlertas.slice(0, 4).map((alerta) => (
                          <div key={alerta.clave} className="flex items-start gap-2 py-3 text-sm">
                            <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${alerta.tono === "rose" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`} aria-hidden />
                            <span className="text-slate-700 dark:text-[#c1cbc6]">{alerta.texto}</span>
                          </div>
                        ))}
                        {(totalAlertas > 4 || alertasPersonal.length > 0) && (
                          <button
                            type="button"
                            onClick={() => setVista("alertas")}
                            className="w-full py-3 text-left text-sm font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-[#4ee6b0] dark:focus-visible:ring-[#37e6b0]"
                          >
                            {totalAlertas > 4 ? `Ver las ${totalAlertas} en Alertas` : "Revisar y dar por vistas en Alertas"}
                          </button>
                        )}
                      </>
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
              ) : !localActivo ? (
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
                                <span className="block text-xs text-slate-500 dark:text-[#7a8882]">{participacion}</span>
                              </span>
                              <span>
                                <span className="block text-xs text-slate-500 dark:text-[#94a19c]">Variación</span>
                                <span className={`mt-0.5 block font-semibold tabular-nums ${local.variacionVentas == null ? "text-slate-500" : local.variacionVentas >= 0 ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>{variacionLocal}</span>
                              </span>
                              <span>
                                <span className="block text-xs text-slate-500 dark:text-[#94a19c]">Tickets · promedio</span>
                                <span className="mt-0.5 block font-semibold tabular-nums">{numero(local.tickets)} · {plata(local.ticketPromedio)}</span>
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
                              <td className={`px-3 py-3 text-right font-semibold tabular-nums ${local.variacionVentas == null ? "text-slate-500" : local.variacionVentas >= 0 ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>
                                {local.variacionVentas == null ? "—" : `${local.variacionVentas >= 0 ? "+" : ""}${local.variacionVentas.toFixed(1)}%`}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">{numero(local.tickets)}</td>
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
              ) : errorDia ? (
                <EmptyState>
                  <span>{errorDia}</span>
                  <Button type="button" variant="ghost" className="mx-auto mt-3" onClick={() => setRevision((valor) => valor + 1)}>Reintentar</Button>
                </EmptyState>
              ) : cargandoDia || !datosDia || !localDia ? (
                <DashboardSkeleton />
              ) : (
                <DetalleDiario local={localDia} fecha={fechaLocal} referencia={referenciaDia} />
              )}
            </div>
          )}

          {vista === "control" && (
            <div className="space-y-5">
              <ProductosPanel desde={datos.rango.desde} hasta={datos.rango.hasta} localId={alcance} />
              <SerieStock desde={datos.rango.desde} hasta={datos.rango.hasta} localId={alcance} />
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

          {vista === "alertas" && (
            <div className="space-y-5">
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                  <div>
                    <h2 className="font-semibold">Qué está fuera de lugar</h2>
                    <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500 dark:text-[#94a19c]">
                      Del negocio, sobre {etiquetaAlcance.toLowerCase()} en el período elegido. Estas
                      no se marcan como vistas: aparecen mientras el número esté fuera de rango y se
                      van solas cuando vuelve.
                    </p>
                  </div>
                  <Badge tone={alertas.length > 0 ? "amber" : "emerald"}>{alertas.length}</Badge>
                </div>
                {alertas.length === 0 ? (
                  <p className="flex items-start gap-2 px-4 py-6 text-sm text-slate-600 dark:text-[#c1cbc6]">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700 dark:text-[#4ee6b0]" aria-hidden />
                    Ningún indicador del negocio está fuera de rango en este período.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 px-4 dark:divide-[#1c2521]">
                    {alertasOrdenadas.map((alerta) => (
                      <div key={alerta.texto} className="flex items-start gap-2.5 py-3 text-sm">
                        <AlertTriangle
                          size={16}
                          className={`mt-0.5 shrink-0 ${
                            alerta.tono === "rose"
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                          aria-hidden
                        />
                        <span className="text-slate-700 dark:text-[#c1cbc6]">{alerta.texto}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                  <div>
                    <h2 className="font-semibold">Personal</h2>
                    <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500 dark:text-[#94a19c]">
                      Fichajes que no cierran. Estas sí se resuelven: alguien las mira, decide qué
                      pasó y las da por vistas.
                    </p>
                  </div>
                  <Badge tone={alertasPersonal.length > 0 ? "amber" : "emerald"}>
                    {alertasPersonal.length}
                  </Badge>
                </div>
                {alertasPersonal.length === 0 ? (
                  <p className="flex items-start gap-2 px-4 py-6 text-sm text-slate-600 dark:text-[#c1cbc6]">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700 dark:text-[#4ee6b0]" aria-hidden />
                    No quedan alertas de personal sin resolver en este período.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 px-4 dark:divide-[#1c2521]">
                    {alertasPersonal.map((alerta) => (
                      <div key={alerta.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            {alerta.empleado}
                            <Badge tone="amber">{TIPO_ALERTA[alerta.tipo] ?? alerta.tipo}</Badge>
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-[#94a19c]">
                            {fechaLarga(alerta.fecha)} · {alerta.local}
                            {alerta.detalle && ` · ${alerta.detalle}`}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={resolviendo === alerta.id}
                          onClick={() => resolverAlerta(alerta.id)}
                        >
                          {resolviendo === alerta.id ? "Marcando…" : "Dar por vista"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
