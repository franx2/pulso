"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";

type SectorClave = "HELADOS" | "CAFETERIA" | "CHOCOLATERIA" | "PROMOCION" | "SIN_CLASIFICAR";
type ResumenSector = {
  sector: SectorClave;
  etiqueta: string;
  facturacion: number;
  cantidad: number;
  productos: number;
  porcentaje: number;
};
type Producto = { producto: string; categoria: string | null; facturacion: number; cantidad: number };
type Respuesta = {
  desde: string;
  hasta: string;
  dias: number;
  localId: string;
  locales: { id: string; nombre: string }[];
  total: number;
  cobertura: number;
  sectores: ResumenSector[];
  ejemplos: Partial<Record<SectorClave, { producto: string; facturacion: number }[]>>;
  overrides: number;
  sinClasificar: Producto[];
};

const ASIGNABLES: { clave: Exclude<SectorClave, "SIN_CLASIFICAR">; label: string }[] = [
  { clave: "HELADOS", label: "Helados" },
  { clave: "CAFETERIA", label: "Cafetería" },
  { clave: "CHOCOLATERIA", label: "Chocolatería" },
  { clave: "PROMOCION", label: "Promoción" },
];

const COLOR: Record<SectorClave, string> = {
  HELADOS: "bg-sky-600 dark:bg-sky-400",
  CAFETERIA: "bg-emerald-700 dark:bg-[#37e6b0]",
  CHOCOLATERIA: "bg-amber-700 dark:bg-amber-400",
  PROMOCION: "bg-slate-400 dark:bg-[#7f908a]",
  SIN_CLASIFICAR: "bg-rose-500 dark:bg-rose-400",
};

const PERIODOS = [
  { clave: "30", label: "30 días" },
  { clave: "90", label: "90 días" },
  { clave: "365", label: "1 año" },
];

const plata = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const fecha = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });

export default function SectoresClient() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [dias, setDias] = useState("30");
  const [localId, setLocalId] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controlador = new AbortController();
    const params = new URLSearchParams({ dias, ...(localId ? { localId } : {}) });
    fetch(`/api/sectores?${params}`, { signal: controlador.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fallo"))))
      .then(setDatos)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError("No pudimos cargar los sectores.");
      });
    return () => controlador.abort();
  }, [dias, localId, revision]);

  async function asignar(producto: string, sector: string) {
    setGuardando(producto);
    await fetch("/api/sectores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producto, sector }),
    });
    setGuardando(null);
    setRevision((v) => v + 1);
  }

  if (error) return <p className="text-sm text-slate-500 dark:text-[#94a19c]">{error}</p>;
  if (!datos) return <div className="h-64 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Clasificando productos" />;

  const conVenta = datos.sectores.filter((s) => s.facturacion > 0);
  const promo = datos.sectores.find((s) => s.sector === "PROMOCION");
  const sinClas = datos.sectores.find((s) => s.sector === "SIN_CLASIFICAR");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-[#29403b] dark:bg-[#0b1412]">
          {PERIODOS.map((p) => (
            <button
              key={p.clave}
              type="button"
              aria-pressed={dias === p.clave}
              onClick={() => setDias(p.clave)}
              className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
                dias === p.clave
                  ? "bg-white text-slate-900 shadow-sm dark:bg-[#1d4e48] dark:text-[#f2f7f4]"
                  : "text-slate-500 hover:text-slate-800 dark:text-[#94a19c]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          value={localId}
          onChange={(e) => setLocalId(e.target.value)}
          className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-[#29403b] dark:bg-[#101c19]"
        >
          <option value="">Toda la cadena</option>
          {datos.locales.map((l) => (
            <option key={l.id} value={l.id}>{l.nombre}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500 dark:text-[#94a19c]">
          {fecha(datos.desde)} a {fecha(datos.hasta)}
        </span>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white dark:border-[#29403b] dark:bg-[#101c19]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
          <div>
            <h2 className="font-semibold">Facturación por sector</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
              Las reglas clasifican por nombre de producto; lo que no saben leer se carga abajo.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">{plata(datos.total)}</p>
            <p className="text-xs text-slate-500 dark:text-[#94a19c]">
              {datos.cobertura.toFixed(1)}% atribuido a un sector real
            </p>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-[#18201d]">
            {conVenta.map((s) => (
              <div
                key={s.sector}
                className={COLOR[s.sector]}
                style={{ width: `${s.porcentaje}%` }}
                title={`${s.etiqueta}: ${s.porcentaje.toFixed(1)}%`}
              />
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
          {conVenta.map((s) => (
            <div key={s.sector} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${COLOR[s.sector]}`} aria-hidden />
                  {s.etiqueta}
                </span>
                <span className="flex items-baseline gap-3 text-sm">
                  <span className="text-slate-500 dark:text-[#94a19c]">{s.productos} productos</span>
                  <span className="font-semibold tabular-nums">{plata(s.facturacion)}</span>
                  <span className="w-14 text-right font-semibold tabular-nums text-slate-500 dark:text-[#94a19c]">
                    {s.porcentaje.toFixed(1)}%
                  </span>
                </span>
              </div>
              {datos.ejemplos[s.sector] && (
                <p className="mt-1 truncate text-xs text-slate-400 dark:text-[#74817b]">
                  {datos.ejemplos[s.sector]!.slice(0, 4).map((e) => e.producto).join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {promo && promo.facturacion > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-3 dark:border-amber-500/40 dark:bg-amber-500/10">
          <h2 className="inline-flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle size={16} aria-hidden />
            {promo.porcentaje.toFixed(1)}% de la venta está en promociones sin abrir
          </h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
            Fudo guarda cada promo como un producto único —{" "}
            {datos.ejemplos.PROMOCION?.[0]?.producto ?? "PROMO"} por{" "}
            {plata(datos.ejemplos.PROMOCION?.[0]?.facturacion ?? 0)} — sin decir qué lleva adentro.
            Hasta que se declare la composición, esa plata no se puede atribuir a helados, cafetería
            ni chocolatería. Repartirla a ojo sería inventar un tercio de la facturación.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white dark:border-[#29403b] dark:bg-[#101c19]">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
          <h2 className="font-semibold">
            Sin clasificar
            {sinClas && sinClas.facturacion > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-[#94a19c]">
                {plata(sinClas.facturacion)} · {sinClas.porcentaje.toFixed(1)}% de la venta
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
            Ordenados por lo que facturan: arrancá por arriba. Lo que asignes queda guardado y se
            aplica a todos los locales y períodos.
            {datos.overrides > 0 && ` Ya hay ${datos.overrides} cargados.`}
          </p>
        </div>
        {datos.sinClasificar.length === 0 ? (
          <p className="inline-flex items-center gap-2 px-4 py-6 text-sm text-slate-500 dark:text-[#94a19c]">
            <Check size={16} className="text-emerald-600" aria-hidden />
            No queda ningún producto sin clasificar en este período.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
            {datos.sinClasificar.map((p) => (
              <div key={p.producto} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.producto}</p>
                  <p className="text-xs text-slate-400 dark:text-[#74817b]">
                    {plata(p.facturacion)} · {Math.round(p.cantidad).toLocaleString("es-AR")} unidades
                    {p.categoria && ` · ${p.categoria}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {ASIGNABLES.map((s) => (
                    <button
                      key={s.clave}
                      type="button"
                      disabled={guardando === p.producto}
                      onClick={() => asignar(p.producto, s.clave)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-50 dark:border-[#29403b] dark:text-[#c1cbc6] dark:hover:border-[#37e6b0] dark:hover:text-[#37e6b0]"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
