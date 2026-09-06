"use client";

import { useEffect, useId, useState } from "react";
import { CalendarDays } from "lucide-react";
import { fechaLarga } from "@/lib/formato";
import { hoyAR, sumarDias } from "@/lib/fechaAR";

/**
 * El selector de período de toda la app.
 *
 * Existían cuatro: Comando, Compras, Sectores y Ventas de Fudo, cada uno con
 * su propia lista de opciones y su propio alto. El mismo administrador veía
 * "30 días" en una pantalla, "120 días" en otra y ningún "Hoy" en ninguna, y
 * comparar dos pantallas exigía recordar qué ventana tenía cada una.
 *
 * Un solo control, con las mismas opciones y el mismo aspecto en todas partes.
 */

export type Periodo =
  | "hoy"
  | "semana"
  | "mes"
  | "mtd"
  | "mes-calendario"
  | "anio-calendario"
  | "rango";

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

export const OPCIONES: { clave: Periodo; label: string; corto: string }[] = [
  { clave: "hoy", label: "Hoy", corto: "Hoy" },
  { clave: "semana", label: "7 días", corto: "7 d" },
  { clave: "mes", label: "30 días", corto: "30 d" },
  { clave: "mtd", label: "Mes actual", corto: "Mes" },
  { clave: "mes-calendario", label: "Elegir mes", corto: "Mes…" },
  { clave: "anio-calendario", label: "Elegir año", corto: "Año…" },
  { clave: "rango", label: "Fechas", corto: "Fechas" },
];

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

const campo =
  "min-h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none transition-colors focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-600/25 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#f2f7f4] dark:focus-visible:border-[#37e6b0] dark:focus-visible:ring-[#37e6b0]/25";

export default function PeriodoSelector({
  valor,
  onChange,
  hoy,
  rango,
  anios = 4,
}: {
  valor: ValorPeriodo;
  onChange: (valor: ValorPeriodo) => void;
  /** Día argentino de hoy, para acotar los selectores al pasado. */
  hoy: string;
  /** Rango ya resuelto por el servidor, que es el que de verdad se midió. */
  rango?: { desde: string; hasta: string } | null;
  anios?: number;
}) {
  const id = useId();
  const set = (parcial: Partial<ValorPeriodo>) => onChange({ ...valor, ...parcial });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="scrollbar-hidden inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-[#29403b] dark:bg-[#0b1412]"
        role="tablist"
        aria-label="Período"
      >
        {OPCIONES.map((opcion) => (
          <button
            key={opcion.clave}
            type="button"
            role="tab"
            aria-selected={valor.periodo === opcion.clave}
            onClick={() => set({ periodo: opcion.clave })}
            className={`min-h-8 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#37e6b0] ${
              valor.periodo === opcion.clave
                ? "bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:bg-[#1d4e48] dark:text-[#f2f7f4]"
                : "text-slate-500 hover:text-slate-900 dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"
            }`}
          >
            <span className="sm:hidden">{opcion.corto}</span>
            <span className="hidden sm:inline">{opcion.label}</span>
          </button>
        ))}
      </div>

      {valor.periodo === "mes-calendario" && (
        <>
          <label className="sr-only" htmlFor={`${id}-mes`}>
            Mes
          </label>
          <input
            id={`${id}-mes`}
            type="month"
            max={hoy.slice(0, 7)}
            value={valor.mes}
            onChange={(e) => set({ mes: e.target.value })}
            className={`${campo} w-40`}
          />
        </>
      )}

      {valor.periodo === "anio-calendario" && (
        <>
          <label className="sr-only" htmlFor={`${id}-anio`}>
            Año
          </label>
          <select
            id={`${id}-anio`}
            value={valor.anio}
            onChange={(e) => set({ anio: e.target.value })}
            className={`${campo} w-28`}
          >
            {Array.from({ length: anios }, (_, i) => String(Number(hoy.slice(0, 4)) - i)).map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </>
      )}

      {valor.periodo === "rango" && (
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor={`${id}-desde`}>
            Desde
          </label>
          <input
            id={`${id}-desde`}
            type="date"
            max={valor.hasta}
            value={valor.desde}
            onChange={(e) => set({ desde: e.target.value })}
            className={`${campo} w-36`}
          />
          <span className="text-xs text-slate-400 dark:text-[#74817b]">a</span>
          <label className="sr-only" htmlFor={`${id}-hasta`}>
            Hasta
          </label>
          <input
            id={`${id}-hasta`}
            type="date"
            min={valor.desde}
            max={hoy}
            value={valor.hasta}
            onChange={(e) => set({ hasta: e.target.value })}
            className={`${campo} w-36`}
          />
        </div>
      )}

      {/* El rango que devolvió el servidor, no el que se pidió: si se recortó,
          lo que se muestra tiene que ser lo que de verdad se midió. */}
      {rango && (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#94a19c]">
          <CalendarDays size={13} aria-hidden />
          {fechaLarga(rango.desde)} a {fechaLarga(rango.hasta)}
        </span>
      )}
    </div>
  );
}

/**
 * Estado del selector, sincronizado con la URL.
 *
 * Vive acá y no en cada pantalla porque las tres divergieron: una guardaba
 * `dias` como string, otra `periodo`, y ninguna sobrevivía a un F5. Compartir
 * el estado es lo que hace que compartir el control signifique algo.
 */
export function usePeriodo(inicial: Periodo = "mes"): {
  valor: ValorPeriodo;
  setValor: (v: ValorPeriodo) => void;
  params: URLSearchParams;
  hoy: string;
} {
  const hoy = hoyAR();
  const [valor, setValor] = useState<ValorPeriodo>(() => {
    const url = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
    const pedido = url?.get("periodo") as Periodo | null;
    return {
      periodo: OPCIONES.some((o) => o.clave === pedido) ? pedido! : inicial,
      mes: url?.get("mes") ?? hoy.slice(0, 7),
      anio: url?.get("anio") ?? hoy.slice(0, 4),
      desde: url?.get("desde") ?? sumarDias(hoy, -29),
      hasta: url?.get("hasta") ?? hoy,
    };
  });

  const params = parametrosDe(valor);

  // Reemplaza en vez de apilar: mover el filtro cinco veces no debería
  // costarle cinco "atrás" al que quiere volver a la pantalla anterior.
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const clave of ["periodo", "mes", "anio", "desde", "hasta"]) url.searchParams.delete(clave);
    for (const [clave, v] of params) url.searchParams.set(clave, v);
    window.history.replaceState(null, "", url);
  }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  return { valor, setValor, params, hoy };
}
