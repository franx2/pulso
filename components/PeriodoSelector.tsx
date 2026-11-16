"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { fechaCorta, fechaLarga, rango as rangoCorto } from "@/lib/formato";
import { diasEntre, hoyAR } from "@/lib/fechaAR";
import {
  moverPeriodo,
  normalizarPeriodo,
  parametrosDe,
  rangoDias,
  valorPorDefecto,
  type Periodo,
  type ValorPeriodo,
} from "@/lib/periodo";

export { parametrosDe, type Periodo, type ValorPeriodo };

/**
 * El selector de período de toda la app, y un solo período para todas las
 * pantallas.
 *
 * Antes cada pestaña guardaba el suyo: Comando arrancaba en 30 días,
 * Resultado en el mes, Reportes en la semana, y pasar de una a otra obligaba
 * a volver a elegir. Ahora se elige una vez: queda guardado en el navegador
 * y viaja en la URL, así que un link muestra lo mismo que se está viendo.
 *
 * El control es un solo botón con el período a la vista y flechas para ir al
 * anterior o al siguiente, que es lo que más se hace ("¿y el mes pasado?").
 * Al tocarlo se abre el panel con atajos, meses y fechas a medida.
 */

// --- Estado compartido -------------------------------------------------------

const CLAVE = "pulso.periodo";
const oyentes = new Set<() => void>();
let actual: string | null = null;

function leer(): ValorPeriodo {
  const hoy = hoyAR();
  const url = new URLSearchParams(window.location.search);
  // Un link con período manda: es "mirá esto", y lo que se mira se comparte.
  if (url.get("periodo")) return normalizarPeriodo(Object.fromEntries(url), hoy);
  try {
    const guardado = window.localStorage.getItem(CLAVE);
    if (guardado) return normalizarPeriodo(JSON.parse(guardado), hoy);
  } catch {
    // Navegador sin almacenamiento (modo privado estricto): queda el defecto.
  }
  return valorPorDefecto(hoy);
}

function instantanea(): string {
  if (actual == null) {
    actual = JSON.stringify(leer());
    try {
      window.localStorage.setItem(CLAVE, actual);
    } catch {}
  }
  return actual;
}

function guardar(valor: ValorPeriodo) {
  actual = JSON.stringify(normalizarPeriodo(valor, hoyAR()));
  try {
    window.localStorage.setItem(CLAVE, actual);
  } catch {}
  for (const avisar of oyentes) avisar();
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  // Otra pestaña del navegador cambió el período: se sigue.
  const otraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE || !e.newValue) return;
    try {
      actual = JSON.stringify(normalizarPeriodo(JSON.parse(e.newValue), hoyAR()));
      avisar();
    } catch {}
  };
  window.addEventListener("storage", otraPestana);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", otraPestana);
  };
}

/**
 * El período compartido. Todas las pantallas leen y escriben el mismo, y lo
 * reflejan en la URL con `replaceState` para que F5 y los links lo conserven
 * sin apilar historial.
 */
export function usePeriodo(): {
  valor: ValorPeriodo;
  setValor: (v: ValorPeriodo) => void;
  params: URLSearchParams;
  hoy: string;
} {
  const hoy = hoyAR();
  const crudo = useSyncExternalStore(suscribir, instantanea, () => JSON.stringify(valorPorDefecto(hoy)));
  const valor = useMemo(() => JSON.parse(crudo) as ValorPeriodo, [crudo]);
  const params = useMemo(() => parametrosDe(valor), [valor]);

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const clave of ["periodo", "mes", "anio", "desde", "hasta"]) url.searchParams.delete(clave);
    for (const [clave, v] of params) url.searchParams.set(clave, v);
    window.history.replaceState(window.history.state, "", url);
  }, [params]);

  return { valor, setValor: guardar, params, hoy };
}

// --- Cómo se nombra cada período --------------------------------------------

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const sumarMeses = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`;
};

function diaDeSemana(dia: string) {
  const texto = new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-AR", { timeZone: "UTC", weekday: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Título grande y la línea de fechas exactas que va debajo. */
function nombrar(valor: ValorPeriodo, medido: { desde: string; hasta: string }, hoy: string) {
  const fechas =
    medido.desde === medido.hasta
      ? fechaLarga(medido.desde)
      : medido.desde.slice(0, 4) === medido.hasta.slice(0, 4)
        ? `${rangoCorto(medido.desde, medido.hasta)} ${medido.hasta.slice(0, 4)}`
        : `${fechaLarga(medido.desde)} – ${fechaLarga(medido.hasta)}`;
  switch (valor.periodo) {
    case "hoy":
      return { titulo: "Hoy", detalle: fechas };
    case "semana":
      return { titulo: "Últimos 7 días", detalle: fechas };
    case "mes":
      return { titulo: "Últimos 30 días", detalle: fechas };
    case "mtd":
      return { titulo: nombreMes(hoy.slice(0, 7)), detalle: `Este mes · ${fechas}` };
    case "mes-calendario":
      return { titulo: nombreMes(valor.mes), detalle: fechas };
    case "anio-calendario":
      return { titulo: `Año ${valor.anio}`, detalle: fechas };
    case "rango": {
      if (medido.desde === medido.hasta) return { titulo: diaDeSemana(medido.desde), detalle: fechas };
      return { titulo: fechas, detalle: `${diasEntre(medido.desde, medido.hasta)} días` };
    }
  }
}

// --- El control ------------------------------------------------------------

const foco =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950";
const flecha = `grid w-10 shrink-0 place-items-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${foco}`;
const campo =
  "min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-base text-slate-900 outline-none transition-colors focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-slate-950/25 sm:text-sm";

export default function PeriodoSelector({
  valor,
  onChange,
  hoy,
  rango,
}: {
  valor: ValorPeriodo;
  onChange: (valor: ValorPeriodo) => void;
  /** Día argentino de hoy, para no ofrecer el futuro. */
  hoy: string;
  /** Rango ya resuelto por el servidor, que es el que de verdad se midió. */
  rango?: { desde: string; hasta: string } | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);
  const idPanel = useId();

  const medido = rango ?? rangoDias(parametrosDe(valor), hoy);
  const { titulo, detalle } = nombrar(valor, medido, hoy);
  const anterior = moverPeriodo(valor, -1, hoy);
  const siguiente = moverPeriodo(valor, 1, hoy);

  const cerrar = (devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) disparador.current?.focus();
  };
  const elegir = (v: ValorPeriodo) => {
    onChange(v);
    cerrar();
  };

  return (
    <div className="flex w-full min-w-0 max-w-full sm:inline-flex sm:w-auto">
      <div className="flex min-h-11 w-full min-w-0 max-w-full items-stretch overflow-hidden rounded-lg sm:inline-flex sm:w-auto border border-slate-200 bg-white">
        <button
          type="button"
          className={flecha}
          disabled={!anterior}
          onClick={() => anterior && onChange(anterior)}
          aria-label="Período anterior"
          title="Período anterior"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <button
          ref={disparador}
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-controls={abierto ? idPanel : undefined}
          aria-label={`Período: ${titulo}, ${detalle}. Cambiar período`}
          className={`flex min-w-0 flex-1 items-center gap-2.5 border-x border-slate-200 px-3 py-1 text-left transition-colors hover:bg-slate-50 ${foco} ${
            abierto ? "bg-slate-50" : ""
          }`}
        >
          <CalendarDays size={17} className="shrink-0 text-emerald-700" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-5 text-slate-900">{titulo}</span>
            <span className="block truncate text-xs leading-4 tabular-nums text-slate-500">{detalle}</span>
          </span>
          <ChevronDown
            size={15}
            className={`ml-auto shrink-0 text-slate-400 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className={flecha}
          disabled={!siguiente}
          onClick={() => siguiente && onChange(siguiente)}
          aria-label="Período siguiente"
          title={siguiente ? "Período siguiente" : "Ya estás en el período más reciente"}
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>

      {abierto && (
        <PanelPeriodo
          id={idPanel}
          ancla={disparador}
          valor={valor}
          medido={medido}
          hoy={hoy}
          onElegir={elegir}
          onCerrar={cerrar}
        />
      )}
    </div>
  );
}

function PanelPeriodo({
  id,
  ancla,
  valor,
  medido,
  hoy,
  onElegir,
  onCerrar,
}: {
  id: string;
  ancla: React.RefObject<HTMLButtonElement | null>;
  valor: ValorPeriodo;
  medido: { desde: string; hasta: string };
  hoy: string;
  onElegir: (v: ValorPeriodo) => void;
  onCerrar: (devolverFoco?: boolean) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [posicion, setPosicion] = useState<React.CSSProperties | null>(null);
  // En un teléfono se abre como hoja desde abajo: colgado del botón, las
  // fechas a medida quedaban fuera de la pantalla o detrás de la barra.
  const [hoja, setHoja] = useState(false);
  const mesHoy = hoy.slice(0, 7);
  const anioHoy = hoy.slice(0, 4);
  const [anioVista, setAnioVista] = useState(
    valor.periodo === "mes-calendario" ? valor.mes.slice(0, 4) : valor.periodo === "anio-calendario" ? valor.anio : anioHoy
  );
  const [desde, setDesde] = useState(medido.desde);
  const [hasta, setHasta] = useState(medido.hasta);
  const errorRango = desde && hasta && desde > hasta ? "La fecha de inicio es posterior a la de fin." : "";

  // Flota en el body, fijo bajo el botón: los paneles que lo contienen tienen
  // overflow oculto y lo recortarían. Se acomoda al ancho de la pantalla.
  useLayoutEffect(() => {
    const ubicar = () => {
      if (window.innerWidth < 640) {
        setHoja(true);
        setPosicion({ left: 0, right: 0, bottom: 0, maxHeight: "85dvh" });
        return;
      }
      const r = ancla.current?.closest("div")?.getBoundingClientRect();
      if (!r) return;
      setHoja(false);
      const width = Math.min(368, window.innerWidth - 32);
      const left = Math.min(Math.max(r.left, 16), window.innerWidth - width - 16);
      const top = r.bottom + 8;
      setPosicion({ top, left, width, maxHeight: Math.max(window.innerHeight - top - 16, 240) });
    };
    ubicar();
    // Acompaña al botón si la página se desplaza (o el teclado del celular la
    // corre al tocar una fecha); cerrarlo ahí cortaría a quien está tipeando.
    const alDesplazar = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) ubicar();
    };
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", alDesplazar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", alDesplazar, true);
    };
  }, [ancla]);

  // El cierre cambia en cada render del padre; los oyentes se instalan una vez.
  const cerrarRef = useRef(onCerrar);
  useEffect(() => {
    cerrarRef.current = onCerrar;
  });

  useEffect(() => {
    const seleccionado = panel.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    (seleccionado ?? panel.current?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });

    const afuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || ancla.current?.closest("div")?.contains(t)) return;
      cerrarRef.current(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarRef.current();
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [ancla]);

  const mesPasado = sumarMeses(mesHoy, -1);
  const atajos: { label: string; v: ValorPeriodo; activo: boolean }[] = [
    { label: "Hoy", v: { ...valor, periodo: "hoy" }, activo: valor.periodo === "hoy" },
    { label: "Últimos 7 días", v: { ...valor, periodo: "semana" }, activo: valor.periodo === "semana" },
    { label: "Este mes", v: { ...valor, periodo: "mtd" }, activo: valor.periodo === "mtd" },
    { label: "Últimos 30 días", v: { ...valor, periodo: "mes" }, activo: valor.periodo === "mes" },
    {
      label: "Mes pasado",
      v: { ...valor, periodo: "mes-calendario", mes: mesPasado },
      activo: valor.periodo === "mes-calendario" && valor.mes === mesPasado,
    },
    {
      label: "Este año",
      v: { ...valor, periodo: "anio-calendario", anio: anioHoy },
      activo: valor.periodo === "anio-calendario" && valor.anio === anioHoy,
    },
  ];

  const mesActivo = valor.periodo === "mtd" ? mesHoy : valor.periodo === "mes-calendario" ? valor.mes : null;
  const anioCompletoActivo = valor.periodo === "anio-calendario" && valor.anio === anioVista;

  const opcion = (activo: boolean) =>
    `min-h-10 rounded-lg px-3 text-sm font-medium transition-colors ${foco} ${
      activo
        ? "bg-emerald-700 text-white"
        : "text-slate-700 hover:bg-slate-100"
    }`;

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
    {hoja && <div className="fixed inset-0 z-[60] bg-black/45 motion-safe:animate-[velo_200ms_ease-out]" aria-hidden />}
    <div
      ref={panel}
      id={id}
      role="dialog"
      aria-label="Elegir período"
      style={posicion ?? { visibility: "hidden" }}
      className={`fixed z-[61] flex flex-col gap-3 overflow-y-auto overscroll-contain border border-slate-200 bg-white text-slate-900 ${
        hoja
          ? "rounded-t-2xl border-b-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_35px_rgba(15,23,42,0.22)] motion-safe:animate-[subir_260ms_cubic-bezier(0.16,1,0.3,1)]"
          : "rounded-xl p-3 shadow-[0_12px_35px_rgba(15,23,42,0.18)] motion-safe:animate-[aparecer_160ms_cubic-bezier(0.16,1,0.3,1)]"
      }`}
    >
      {hoja && (
        <div className="flex items-center justify-between">
          <span className="mx-auto mb-1 h-1 w-10 rounded-full bg-slate-200" aria-hidden />
        </div>
      )}
      {hoja && (
        <div className="-mt-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">Período</h2>
          <button
            type="button"
            onClick={() => onCerrar()}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 ${foco}`}
          >
            Listo
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1">
        {atajos.map((a) => (
          <button key={a.label} type="button" aria-pressed={a.activo} onClick={() => onElegir(a.v)} className={`${opcion(a.activo)} text-left`}>
            {a.label}
          </button>
        ))}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <div className="mb-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnioVista(String(Number(anioVista) - 1))}
            className={`grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${foco}`}
            aria-label="Año anterior"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="w-12 text-center text-sm font-semibold tabular-nums">{anioVista}</span>
          <button
            type="button"
            onClick={() => setAnioVista(String(Number(anioVista) + 1))}
            disabled={anioVista >= anioHoy}
            className={`grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${foco}`}
            aria-label="Año siguiente"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-pressed={anioCompletoActivo}
            onClick={() => onElegir({ ...valor, periodo: "anio-calendario", anio: anioVista })}
            className={`ml-auto min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${foco} ${
              anioCompletoActivo
                ? "bg-emerald-700 text-white"
                : "text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            Año {anioVista} completo
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1" role="group" aria-label={`Meses de ${anioVista}`}>
          {MESES.map((nombre, i) => {
            const mes = `${anioVista}-${String(i + 1).padStart(2, "0")}`;
            const futuro = mes > mesHoy;
            const activo = mesActivo === mes;
            return (
              <button
                key={mes}
                type="button"
                disabled={futuro}
                aria-pressed={activo}
                aria-label={nombreMes(mes)}
                onClick={() => onElegir({ ...valor, periodo: mes === mesHoy ? "mtd" : "mes-calendario", mes })}
                className={`relative min-h-10 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent ${foco} ${
                  activo
                    ? "bg-emerald-700 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {nombre.slice(0, 3)}
                {mes === mesHoy && !activo && (
                  <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-600" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <form
        className="border-t border-slate-100 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!desde || !hasta || errorRango) return;
          onElegir({ ...valor, periodo: desde === hoy && hasta === hoy ? "hoy" : "rango", desde, hasta });
        }}
      >
        <p className="mb-2 text-xs font-semibold text-slate-500">Fechas a medida</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Desde
            <input type="date" value={desde} max={hasta || hoy} onChange={(e) => setDesde(e.target.value)} className={campo} required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Hasta
            <input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} className={campo} required />
          </label>
        </div>
        {errorRango && <p className="mt-2 text-xs text-rose-600">{errorRango}</p>}
        <button
          type="submit"
          disabled={!desde || !hasta || Boolean(errorRango)}
          className={`mt-2 min-h-10 w-full rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 ${foco}`}
        >
          Ver {desde && hasta && !errorRango ? `del ${fechaCorta(desde)} al ${fechaCorta(hasta)}` : "estas fechas"}
        </button>
      </form>
    </div>
    </>,
    document.body
  );
}
