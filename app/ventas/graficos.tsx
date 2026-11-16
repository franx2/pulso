"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/ui";

/**
 * Gráficos de Ventas, al estilo de los reportes de Fudo: indicadores con su
 * variación, barras verticales y horizontales con leyenda de valores. HTML y
 * CSS, sin librería: barras de 4 px de radio en la punta, 2 px de aire entre
 * barras, grilla recesiva y un tooltip por barra.
 *
 * Los colores salen de `--cat-1…7` (globals.css), validados para daltonismo.
 * El color sigue a la entidad (un medio de pago, un origen), nunca al puesto
 * que ocupa en el ranking.
 */

export const COLOR_CAT = (k: number) => (k < 7 ? `var(--cat-${k + 1})` : "#94a3b8");

export function PanelGrafico({
  titulo,
  subtitulo,
  accion,
  children,
  className = "",
}: {
  titulo: string;
  subtitulo?: string;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={`flex flex-col ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-[#f2f7f4]">{titulo}</h2>
          {subtitulo && <p className="text-xs text-slate-500 dark:text-[#94a19c]">{subtitulo}</p>}
        </div>
        {accion}
      </div>
      <div className="flex-1 px-4 pb-4 pt-3">{children}</div>
    </Panel>
  );
}

/** Un indicador: etiqueta, cifra y su variación contra el período anterior. */
export function Indicador({
  etiqueta,
  valor,
  variacion,
  invertir = false,
}: {
  etiqueta: string;
  valor: string;
  variacion: number | null;
  /** En descuentos, subir no es bueno: el color se invierte. */
  invertir?: boolean;
}) {
  const sube = (variacion ?? 0) >= 0;
  const bueno = invertir ? !sube : sube;
  const Flecha = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <Panel className="px-4 py-3">
      <p className="text-xs font-medium text-slate-500 dark:text-[#94a19c]">{etiqueta}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--cat-1)]">{valor}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-[#94a19c]">
        {variacion == null ? (
          "sin período anterior para comparar"
        ) : (
          <>
            <span className={`inline-flex items-center font-semibold ${bueno ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>
              <Flecha size={13} aria-hidden />
              {sube ? "+" : ""}
              {variacion.toFixed(1).replace(".", ",")}%
            </span>
            vs. período anterior
          </>
        )}
      </p>
    </Panel>
  );
}

/** Ticks "lindos" para el eje: 0, y tres o cuatro escalones redondos. */
function escalones(maximo: number) {
  if (maximo <= 0) return [0];
  const bruto = maximo / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
  return Array.from({ length: Math.ceil(maximo / paso) + 1 }, (_, k) => k * paso);
}

export type Barra = { etiqueta: string; valor: number; detalle?: string };

/**
 * Barras verticales de una sola serie (el título nombra la serie: no lleva
 * leyenda). Con `alto` chico sirve de franja alineada debajo de otra.
 */
export function BarrasVerticales({
  datos,
  color = COLOR_CAT(0),
  formato,
  alto = 200,
  cadaEtiqueta = 1,
  sinEje = false,
}: {
  datos: Barra[];
  color?: string;
  formato: (n: number) => string;
  alto?: number;
  /** Mostrar una de cada N etiquetas del eje x, para que no se pisen. */
  cadaEtiqueta?: number;
  sinEje?: boolean;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const ticks = escalones(Math.max(0, ...datos.map((d) => d.valor)));
  const tope = ticks[ticks.length - 1] || 1;

  return (
    <div className="flex gap-2">
      {!sinEje && (
        <div className="relative w-14 shrink-0 text-right text-[0.6875rem] tabular-nums text-slate-400 dark:text-[#7a8882]" style={{ height: alto }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / tope) * 100}%` }}>
              {formato(t)}
            </span>
          ))}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height: alto }}>
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${t === 0 ? "border-slate-300 dark:border-[#29403b]" : "border-slate-100 dark:border-[#1c2521]"}`}
              style={{ bottom: `${(t / tope) * 100}%` }}
              aria-hidden
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" role="list">
            {datos.map((d, k) => (
              <div
                key={d.etiqueta}
                role="listitem"
                aria-label={`${d.etiqueta}: ${formato(d.valor)}${d.detalle ? `, ${d.detalle}` : ""}`}
                className="relative flex h-full min-w-0 flex-1 items-end"
                onMouseEnter={() => setActiva(k)}
                onMouseLeave={() => setActiva(null)}
              >
                <div
                  className="w-full rounded-t-[4px] transition-opacity duration-150"
                  style={{ height: `${(d.valor / tope) * 100}%`, background: color, opacity: activa == null || activa === k ? 1 : 0.55 }}
                />
                {activa === k && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#17211e] px-2 py-1 text-xs text-white shadow-[0_6px_16px_-6px_rgba(15,23,42,0.5)] dark:bg-[#f2f7f4] dark:text-[#0b1412]">
                    <span className="font-semibold">{d.etiqueta}</span> · {formato(d.valor)}
                    {d.detalle && <span className="opacity-75"> · {d.detalle}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex gap-[2px]" aria-hidden>
          {datos.map((d, k) => (
            <span key={d.etiqueta} className="min-w-0 flex-1 truncate text-center text-[0.6875rem] text-slate-400 dark:text-[#7a8882]">
              {k % cadaEtiqueta === 0 ? d.etiqueta : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export type Porcion = { nombre: string; valor: number; pct: number; color: string };

/** Barras horizontales con la leyenda de valores y porcentajes debajo, como en Fudo. */
export function BarrasHorizontales({ datos, formato }: { datos: Porcion[]; formato: (n: number) => string }) {
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  if (datos.length === 0) return <p className="py-6 text-center text-sm text-slate-500 dark:text-[#94a19c]">Sin datos en el período.</p>;
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-[3px]">
        {datos.map((d) => (
          <li key={d.nombre} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2" title={`${d.nombre}: ${formato(d.valor)}`}>
            <span className="truncate text-right text-xs text-slate-600 dark:text-[#c1cbc6]">{d.nombre}</span>
            <span className="h-5 rounded-r-[4px]" style={{ width: `${Math.max(1, (d.valor / maximo) * 100)}%`, background: d.color }} />
          </li>
        ))}
      </ul>
      <ul className="divide-y divide-slate-100 border-t border-slate-100 text-xs dark:divide-[#1c2521] dark:border-[#1c2521]">
        {datos.map((d) => (
          <li key={d.nombre} className="flex items-center gap-2 py-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">{d.nombre}</span>
            <span className="tabular-nums">{formato(d.valor)}</span>
            <span className="w-14 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">{d.pct.toFixed(2).replace(".", ",")}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
