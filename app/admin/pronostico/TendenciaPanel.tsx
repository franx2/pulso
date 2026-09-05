"use client";

import { useEffect, useState } from "react";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

type Semana = { semana: string; ventas: number; tickets: number; ticketPromedio: number; dias: number };
type Tendencia = {
  localId: string;
  local: string;
  semanas: Semana[];
  crecimientoSemanalPct: number;
  ventasUltimas4: number;
  ventasPrevias4: number;
  variacion4v4: number | null;
  ventasAnioAnterior: number | null;
  variacionInteranual: number | null;
  proyeccion30Dias: number;
  diasConDatos: number;
  semanasIncompletas: number;
};

const plata = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const pct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);

export default function TendenciaPanel({
  seleccionado,
  onSeleccionar,
}: {
  seleccionado: string;
  onSeleccionar: (localId: string) => void;
}) {
  const [datos, setDatos] = useState<Tendencia[] | null>(null);

  useEffect(() => {
    const controlador = new AbortController();
    fetch("/api/tendencia?semanas=26", { signal: controlador.signal })
      .then((respuesta) => (respuesta.ok ? respuesta.json() : null))
      .then((respuesta) => setDatos(respuesta?.tendencias ?? []))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setDatos([]);
      });
    return () => controlador.abort();
  }, []);

  if (!datos) {
    return <div className="h-52 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Cargando comparación de locales" />;
  }
  if (datos.length === 0) return null;

  const proyeccionCadena = datos.reduce((s, tendencia) => s + tendencia.proyeccion30Dias, 0);

  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-[#29403b] dark:bg-[#101c19]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
        <div>
          <h2 className="font-semibold">Comparar locales</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Semanas completas y la misma regla de proyección para cada sucursal.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 dark:text-[#74817b]">Cadena · próximos 30 días</p>
          <p className="font-semibold tabular-nums text-emerald-700 dark:text-[#4ee6b0]">{plata(proyeccionCadena)}</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100 md:hidden dark:divide-[#1c2521]">
        {datos.map((tendencia) => {
          const sube = tendencia.crecimientoSemanalPct >= 0;
          const Icono = sube ? TrendingUp : TrendingDown;
          return (
            <button
              key={tendencia.localId}
              type="button"
              onClick={() => onSeleccionar(tendencia.localId)}
              className={`w-full px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${seleccionado === tendencia.localId ? "bg-emerald-50/70 dark:bg-[#132a25]" : "hover:bg-slate-50 dark:hover:bg-[#13201d]"}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-[#f2f7f4]">{tendencia.local}<ArrowRight size={14} aria-hidden /></span>
                <span className="text-xs text-slate-500 dark:text-[#94a19c]">
                  {tendencia.semanas.length} semanas
                  {tendencia.semanasIncompletas > 0 && <span className="ml-1 text-amber-700 dark:text-amber-300">· {tendencia.semanasIncompletas} fuera</span>}
                </span>
              </span>
              <span className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3">
                <span>
                  <span className="block text-xs text-slate-500 dark:text-[#94a19c]">Últimos 28 días</span>
                  <span className="mt-0.5 block font-semibold tabular-nums">{plata(tendencia.ventasUltimas4)}</span>
                </span>
                <span>
                  <span className="block text-xs text-slate-500 dark:text-[#94a19c]">Próximos 30 días</span>
                  <span className="mt-0.5 block font-semibold tabular-nums text-emerald-700 dark:text-[#4ee6b0]">{plata(tendencia.proyeccion30Dias)}</span>
                </span>
                <span>
                  <span className="block text-xs text-slate-500 dark:text-[#94a19c]">vs. 28 anteriores</span>
                  <span className={`mt-0.5 block font-semibold tabular-nums ${tendencia.variacion4v4 == null ? "text-slate-400" : tendencia.variacion4v4 >= 0 ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>{pct(tendencia.variacion4v4)}</span>
                </span>
                <span>
                  <span className="block text-xs text-slate-500 dark:text-[#94a19c]">Ritmo semanal</span>
                  <span className={`mt-0.5 inline-flex items-center gap-1 font-semibold tabular-nums ${sube ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}><Icono size={14} aria-hidden />{pct(tendencia.crecimientoSemanalPct)}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:flex">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-[#29403b] dark:text-[#94a19c]">
              <th className="px-4 py-3 font-semibold">Local</th>
              <th className="px-3 py-3 text-right font-semibold">Últimos 28 días</th>
              <th className="px-3 py-3 text-right font-semibold">vs. 28 anteriores</th>
              <th className="px-3 py-3 text-right font-semibold">Ritmo semanal</th>
              <th className="px-3 py-3 text-right font-semibold">Próximos 30 días</th>
              <th className="px-4 py-3 text-right font-semibold">Calidad de serie</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1c2521]">
            {datos.map((tendencia) => {
              const sube = tendencia.crecimientoSemanalPct >= 0;
              const Icono = sube ? TrendingUp : TrendingDown;
              return (
                <tr key={tendencia.localId} className={seleccionado === tendencia.localId ? "bg-emerald-50/70 dark:bg-[#132a25]" : "hover:bg-slate-50 dark:hover:bg-[#13201d]"}>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSeleccionar(tendencia.localId)}
                      className="inline-flex items-center gap-1.5 font-semibold text-slate-900 underline-offset-4 hover:text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-[#f2f7f4] dark:hover:text-[#4ee6b0]"
                    >
                      {tendencia.local}<ArrowRight size={13} aria-hidden />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{plata(tendencia.ventasUltimas4)}</td>
                  <td className={`px-3 py-3 text-right font-semibold tabular-nums ${tendencia.variacion4v4 == null ? "text-slate-400" : tendencia.variacion4v4 >= 0 ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>
                    {pct(tendencia.variacion4v4)}
                  </td>
                  <td className={`px-3 py-3 text-right font-semibold tabular-nums ${sube ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>
                    <span className="inline-flex items-center justify-end gap-1"><Icono size={14} aria-hidden />{pct(tendencia.crecimientoSemanalPct)}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700 dark:text-[#4ee6b0]">{plata(tendencia.proyeccion30Dias)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500 dark:text-[#94a19c]">
                    {tendencia.semanas.length} semanas
                    {tendencia.semanasIncompletas > 0 && <span className="ml-1 text-amber-700 dark:text-amber-300">· {tendencia.semanasIncompletas} fuera</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-[#1c2521] dark:text-[#94a19c]">
        Una semana con menos de 6 días queda fuera del cálculo. “Ritmo semanal” es la pendiente de las últimas 8 semanas completas, no una comparación contra una semana parcial.
      </p>
    </section>
  );
}
