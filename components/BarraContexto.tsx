"use client";

import type { ReactNode } from "react";
import { Store } from "lucide-react";
import { Panel, Select, SelectorSegmentado } from "@/components/ui";

/**
 * La barra que va arriba de toda pantalla de análisis: qué local y qué
 * período gobiernan las cifras de abajo, y el rango exacto que se midió.
 *
 * Es la de Compras llevada a todas. Cada pantalla había armado la suya —un
 * select suelto en Sectores, etiquetas al costado en Resultado, una tarjeta
 * angosta en Reportes— y el mismo dato aparecía en un lugar distinto en cada
 * una. Ahora siempre está en el mismo: local a la izquierda, período a la
 * derecha, y abajo el alcance y las fechas.
 */

type Campo = { etiqueta: string; contenido: ReactNode; className?: string };

export function BarraContexto({
  campos,
  derecha,
  pie,
  className = "",
}: {
  /** Filtros de la izquierda, en orden: local, empleado, horizonte… */
  campos: Campo[];
  /** El período (o el día), alineado a la derecha en escritorio. */
  derecha?: Campo;
  /** Abajo, separado por una regla: alcance a la izquierda, detalle a la derecha. */
  pie?: { alcance: ReactNode; detalle?: ReactNode };
  className?: string;
}) {
  const visibles = campos.filter((c) => c.contenido != null && c.contenido !== false);
  return (
    <Panel className={`p-4 ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        {visibles.length > 0 && (
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            {visibles.map((c) => (
              <div key={c.etiqueta} className={`min-w-0 ${c.className ?? ""}`}>
                <p className="mb-2 text-xs font-semibold text-slate-500">{c.etiqueta}</p>
                {c.contenido}
              </div>
            ))}
          </div>
        )}
        {derecha && (
          <div className={`min-w-0 ${derecha.className ?? ""}`}>
            <p className="mb-2 text-xs font-semibold text-slate-500">{derecha.etiqueta}</p>
            {derecha.contenido}
          </div>
        )}
      </div>
      {pie && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <Store size={14} aria-hidden />
            {pie.alcance}
          </span>
          {pie.detalle && <span className="tabular-nums">{pie.detalle}</span>}
        </div>
      )}
    </Panel>
  );
}

/**
 * Elegir local: botonera en escritorio, select nativo en el celular, donde
 * cinco botones no entran y el selector del sistema es más cómodo.
 */
export function SelectorLocal({
  locales,
  valor,
  onChange,
  todos = "Cadena",
}: {
  locales: { id: string; nombre: string }[];
  valor: string;
  onChange: (id: string) => void;
  /** La opción "todos"; null si la pantalla siempre mira un local. */
  todos?: string | null;
}) {
  const opciones = [
    ...(todos != null ? [{ clave: "", label: todos }] : []),
    ...locales.map((l) => ({ clave: l.id, label: l.nombre })),
  ];
  return (
    <>
      <Select aria-label="Elegir local" value={valor} onChange={(e) => onChange(e.target.value)} className="md:hidden">
        {opciones.map((o) => (
          <option key={o.clave} value={o.clave}>
            {o.label}
          </option>
        ))}
      </Select>
      <div className="scrollbar-hidden hidden max-w-full overflow-x-auto md:block">
        <SelectorSegmentado label="Elegir local" valor={valor} onChange={onChange} opciones={opciones} />
      </div>
    </>
  );
}
