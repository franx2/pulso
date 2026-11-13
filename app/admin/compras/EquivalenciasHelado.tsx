"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button, Panel } from "@/components/ui";

type Regla = { id: string; etiqueta: string; gramos: number; porDefecto: number };

/**
 * Los gramos de cada formato, editables. Son la mitad del cálculo del helado:
 * si una bocha real pesa 80 g y acá dice 90, la venta explica de más y el
 * faltante se esconde. Los mide el que sirve, no el que programa.
 */
export default function EquivalenciasHelado({ reglas, onGuardado }: { reglas: Regla[]; onGuardado: () => void }) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(reglas.map((r) => [r.id, String(r.gramos)]))
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  const cambiadas = reglas.filter((r) => Number(valores[r.id]) !== r.gramos);
  const invalida = cambiadas.find((r) => {
    const n = Number(valores[r.id]);
    return !Number.isFinite(n) || n < 10 || n > 5000;
  });

  async function guardar(lista: { id: string; gramos: number | null }[]) {
    setGuardando(true);
    setError("");
    setListo(false);
    try {
      for (const { id, gramos } of lista) {
        const res = await fetch("/api/equivalencias-helado", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formato: id, gramos }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "No se pudo guardar");
      }
      setListo(true);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Panel>
      <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
        <h2 className="font-semibold">Equivalencias</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
          Cuántos gramos lleva cada formato. Valen para toda la cadena y recalculan el período entero.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cambiadas.length && !invalida) guardar(cambiadas.map((r) => ({ id: r.id, gramos: Number(valores[r.id]) })));
        }}
      >
        <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
          {reglas.map((r) => {
            const editada = r.gramos !== r.porDefecto;
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <label htmlFor={`eq-${r.id}`} className="min-w-0">
                  <span className="block text-slate-700 dark:text-[#dbe5e0]">{r.etiqueta}</span>
                  {editada && (
                    <span className="block text-xs text-slate-500 dark:text-[#94a19c]">De fábrica: {r.porDefecto} g</span>
                  )}
                </label>
                <div className="flex shrink-0 items-center gap-1.5">
                  {editada && (
                    <button
                      type="button"
                      onClick={() => guardar([{ id: r.id, gramos: null }])}
                      disabled={guardando}
                      className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40 dark:text-[#94a19c] dark:hover:bg-[#162824] dark:hover:text-[#f2f7f4] dark:focus-visible:ring-[#37e6b0]"
                      aria-label={`Volver ${r.etiqueta} a ${r.porDefecto} g`}
                      title={`Volver a ${r.porDefecto} g`}
                    >
                      <RotateCcw size={15} aria-hidden />
                    </button>
                  )}
                  <input
                    id={`eq-${r.id}`}
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={5000}
                    step={5}
                    value={valores[r.id] ?? ""}
                    onChange={(e) => {
                      setListo(false);
                      setValores((v) => ({ ...v, [r.id]: e.target.value }));
                    }}
                    className="h-10 w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-right text-base tabular-nums text-slate-900 outline-none focus-visible:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-600/25 sm:text-sm dark:border-[#29403b] dark:bg-[#0b1412] dark:text-[#f2f7f4] dark:focus-visible:border-[#37e6b0]"
                  />
                  <span className="w-3 text-slate-500 dark:text-[#94a19c]">g</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-[#1c2521]">
          <p className="text-sm" role="status">
            {error ? (
              <span className="text-rose-600 dark:text-rose-400">{error}</span>
            ) : invalida ? (
              <span className="text-rose-600 dark:text-rose-400">Los gramos tienen que estar entre 10 y 5.000.</span>
            ) : listo ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-[#4ee6b0]">
                <CheckCircle2 size={15} aria-hidden />
                Guardado; el balance ya usa los gramos nuevos.
              </span>
            ) : cambiadas.length > 0 ? (
              <span className="text-slate-500 dark:text-[#94a19c]">
                {cambiadas.length === 1 ? "1 cambio sin guardar" : `${cambiadas.length} cambios sin guardar`}
              </span>
            ) : null}
          </p>
          <Button type="submit" disabled={guardando || cambiadas.length === 0 || Boolean(invalida)}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
