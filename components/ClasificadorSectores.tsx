"use client";

import { useEffect, useState } from "react";
import { Check, Search, Wand2 } from "lucide-react";
import { Input, SelectorSegmentado } from "@/components/ui";
import { plata } from "@/lib/formato";

/**
 * La lista completa de productos y su sector, editable.
 *
 * Antes sólo se podía asignar lo que las reglas no sabían leer. Eso deja
 * afuera el caso caro: la regla que acierta casi siempre y falla en un
 * producto que factura millones. Si ya estaba clasificado, no aparecía en
 * ninguna pantalla y no había manera de corregirlo.
 *
 * Guardar es un PATCH contra la clave normalizada del nombre, que es la misma
 * para la venta de Fudo y para el renglón del remito: corregirlo una vez lo
 * corrige de los dos lados.
 */

type Fila = {
  producto: string;
  clave: string;
  categoria: string | null;
  venta: number;
  compra: number;
  sector: string;
  etiqueta: string;
  origen: "manual" | "regla";
};

type Respuesta = { total: number; encontrados: number; limite: number; manuales: number; filas: Fila[] };

const SECTORES = [
  { clave: "HELADOS", label: "Helados" },
  { clave: "CAFETERIA", label: "Cafetería" },
  { clave: "CHOCOLATERIA", label: "Chocolatería" },
  { clave: "PROMOCION", label: "Promoción" },
];

const FUENTES = [
  { clave: "", label: "Todo" },
  { clave: "venta", label: "Se vende" },
  { clave: "compra", label: "Se compra" },
];

const ORIGENES = [
  { clave: "", label: "Todos" },
  { clave: "manual", label: "A mano" },
  { clave: "regla", label: "Por regla" },
];

/**
 * `SIN_CLASIFICAR` primero entre los filtros: es la única cola de trabajo real
 * de esta pantalla. El resto se mira cuando se sospecha de algo puntual.
 */
const FILTRO_SECTOR = [
  { clave: "", label: "Todos" },
  { clave: "SIN_CLASIFICAR", label: "Sin clasificar" },
  ...SECTORES,
];

const COLOR: Record<string, string> = {
  HELADOS: "bg-sky-500",
  CAFETERIA: "bg-amber-500",
  CHOCOLATERIA: "bg-[#8b5a2b]",
  PROMOCION: "bg-slate-400 dark:bg-[#7f908a]",
  SIN_CLASIFICAR: "bg-rose-500 dark:bg-rose-400",
};

export const ETIQUETA: Record<string, string> = {
  HELADOS: "Helados",
  CAFETERIA: "Cafetería",
  CHOCOLATERIA: "Chocolatería",
  PROMOCION: "Promoción",
  SIN_CLASIFICAR: "Sin clasificar",
};

/**
 * El sector de un producto, editable donde aparezca.
 *
 * Existe para el renglón de un remito: el costo se ve ahí, así que ahí es
 * donde se nota que está imputado al sector equivocado. Guarda contra la misma
 * clave que el resto, así que corregirlo desde una compra también corrige
 * cómo se clasifica esa misma cosa cuando se vende.
 */
export function SectorChip({
  producto,
  sector,
  onCambio,
}: {
  producto: string;
  sector: string;
  onCambio?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [actual, setActual] = useState(sector);

  async function asignar(nuevo: string) {
    setGuardando(true);
    const res = await fetch("/api/sectores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producto, sector: nuevo }),
    });
    setGuardando(false);
    if (!res.ok) return;
    setActual(nuevo || "SIN_CLASIFICAR");
    setAbierto(false);
    onCambio?.();
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Cambiar el sector de este producto"
        className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:border-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-[#94a19c] dark:hover:border-[#29403b] dark:hover:text-[#f2f7f4] dark:focus-visible:ring-[#37e6b0]"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR[actual] ?? COLOR.SIN_CLASIFICAR}`} aria-hidden />
        {ETIQUETA[actual] ?? actual}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {SECTORES.map((s) => (
        <button
          key={s.clave}
          type="button"
          disabled={guardando}
          onClick={() => asignar(s.clave)}
          className={`min-h-7 rounded-md px-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
            actual === s.clave
              ? "bg-emerald-700 text-white dark:bg-[#1d4e48] dark:text-[#37e6b0]"
              : "border border-slate-200 text-slate-500 hover:text-slate-900 dark:border-[#29403b] dark:text-[#94a19c]"
          }`}
        >
          {s.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="min-h-7 px-1.5 text-xs text-slate-400 hover:text-slate-700 dark:text-[#74817b]"
      >
        Cancelar
      </button>
    </span>
  );
}

export default function ClasificadorSectores({
  /** Precarga la búsqueda: Compras lo abre con el renglón del remito ya puesto. */
  inicial = "",
  onCambio,
}: {
  inicial?: string;
  onCambio?: () => void;
}) {
  const [q, setQ] = useState(inicial);
  const [busqueda, setBusqueda] = useState(inicial);
  const [fuente, setFuente] = useState("");
  const [origen, setOrigen] = useState("");
  const [sector, setSector] = useState("");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  // Se espera a que dejen de tipear: la lista completa son dos group by y no
  // hace falta rehacerlos con cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setBusqueda(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    const controlador = new AbortController();
    const params = new URLSearchParams();
    if (busqueda) params.set("q", busqueda);
    if (fuente) params.set("fuente", fuente);
    if (origen) params.set("origen", origen);
    if (sector) params.set("sector", sector);
    fetch(`/api/sectores/catalogo?${params}`, { signal: controlador.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fallo"))))
      .then(setDatos)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError("No pudimos cargar la lista de productos.");
        }
      });
    return () => controlador.abort();
  }, [busqueda, fuente, origen, sector, revision]);

  async function asignar(producto: string, sector: string) {
    setGuardando(producto);
    setError("");
    const res = await fetch("/api/sectores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producto, sector }),
    });
    setGuardando(null);
    if (!res.ok) {
      setError("No se pudo guardar la clasificación.");
      return;
    }
    setRevision((v) => v + 1);
    onCambio?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar un producto"
            aria-label="Buscar un producto"
            className="pl-9"
          />
        </div>
        <SelectorSegmentado label="Origen del producto" valor={fuente} onChange={setFuente} opciones={FUENTES} />
        <SelectorSegmentado label="Cómo se clasificó" valor={origen} onChange={setOrigen} opciones={ORIGENES} />
      </div>

      <div className="scrollbar-hidden -mx-1 overflow-x-auto px-1">
        <SelectorSegmentado label="Filtrar por sector" valor={sector} onChange={setSector} opciones={FILTRO_SECTOR} />
      </div>

      {datos && (
        <p className="text-xs text-slate-500 dark:text-[#94a19c]">
          {datos.encontrados === datos.total
            ? `${datos.total} productos`
            : `${datos.encontrados} de ${datos.total} productos`}
          {datos.manuales > 0 && ` · ${datos.manuales} corregidos a mano`}
          {datos.encontrados > datos.limite &&
            ` · se muestran los ${datos.limite} que más plata mueven; afiná la búsqueda para llegar al resto`}
        </p>
      )}

      {error && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>}

      {!datos ? (
        <div
          className="h-48 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]"
          aria-label="Cargando productos"
        />
      ) : datos.filas.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-[#94a19c]">
          Ningún producto coincide con lo buscado.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
          {datos.filas.map((f) => (
            <div key={f.clave} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${COLOR[f.sector]}`} aria-hidden />
                  {f.producto}
                  {f.origen === "manual" && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-[#122620] dark:text-[#4ee6b0]"
                      title="Asignado a mano: gana sobre las reglas"
                    >
                      <Wand2 size={10} aria-hidden />
                      a mano
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400 dark:text-[#74817b]">
                  {f.venta > 0 && `Vendido ${plata(f.venta)}`}
                  {f.venta > 0 && f.compra > 0 && " · "}
                  {f.compra > 0 && `Comprado ${plata(f.compra)}`}
                  {f.venta === 0 && f.compra === 0 && "Sin movimiento"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                {SECTORES.map((s) => (
                  <button
                    key={s.clave}
                    type="button"
                    disabled={guardando === f.producto}
                    onClick={() => asignar(f.producto, s.clave)}
                    aria-pressed={f.sector === s.clave}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40 dark:focus-visible:ring-[#37e6b0] ${
                      f.sector === s.clave
                        ? "bg-emerald-700 text-white dark:bg-[#1d4e48] dark:text-[#37e6b0]"
                        : "border border-slate-200 text-slate-500 hover:text-slate-900 dark:border-[#29403b] dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"
                    }`}
                  >
                    {f.sector === s.clave && <Check size={11} aria-hidden />}
                    {s.label}
                  </button>
                ))}
                {f.origen === "manual" && (
                  <button
                    type="button"
                    disabled={guardando === f.producto}
                    onClick={() => asignar(f.producto, "")}
                    title="Volver a lo que digan las reglas"
                    className="min-h-8 rounded-md px-2 text-xs font-medium text-slate-400 underline-offset-2 transition-colors hover:text-slate-700 hover:underline disabled:opacity-40 dark:text-[#74817b] dark:hover:text-[#f2f7f4]"
                  >
                    Deshacer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
