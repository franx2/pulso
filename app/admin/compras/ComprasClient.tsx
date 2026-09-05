"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

type Item = {
  codigo: string;
  detalle: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  total: number;
  totalConAjuste: number;
};
type Compra = {
  id: string;
  numero: string;
  fecha: string;
  local: string | null;
  localId: string | null;
  cliente: string;
  cuit: string | null;
  tipo: "MERCADERIA" | "SERVICIO";
  observaciones: string | null;
  sumaLineas: number;
  ajustePct: number | null;
  subtotal: number;
  problemas: string[];
  origen: string | null;
  items: Item[];
};
type Control = {
  compraId: string;
  local: string | null;
  numero: string;
  mes: string;
  origenMes: "texto" | "fecha";
  ventaConIva: number;
  ventaNeta: number;
  esperado: number;
  cobrado: number;
  diferencia: number;
  diferenciaPct: number;
  diasConDatos: number;
  diasDelMes: number;
  completo: boolean;
};
type Respuesta = {
  desde: string;
  hasta: string;
  resumen: { remitos: number; mercaderia: number; servicios: number; sinAsignar: number; conProblemas: number };
  porLocal: { local: string; mercaderia: number; servicios: number; remitos: number }[];
  controles: Control[];
  locales: { id: string; nombre: string }[];
  compras: Compra[];
};

const plata = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
const MES_LARGO = (clave: string) =>
  new Date(`${clave}-15T12:00:00Z`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

export default function ComprasClient() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    const controlador = new AbortController();
    fetch("/api/compras?dias=120", { signal: controlador.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fallo"))))
      .then(setDatos)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError("No pudimos cargar las compras.");
      });
    return () => controlador.abort();
  }, [revision]);

  async function asignar(compraId: string, localId: string) {
    if (!localId) return;
    setGuardando(compraId);
    await fetch("/api/compras", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compraId, localId }),
    });
    setGuardando(null);
    setRevision((v) => v + 1);
  }

  if (error) return <p className="text-sm text-slate-500 dark:text-[#94a19c]">{error}</p>;
  if (!datos) return <div className="h-64 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Cargando compras" />;

  const sinAsignar = datos.compras.filter((c) => !c.localId);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 divide-x divide-y border-y border-slate-200 md:grid-cols-4 md:divide-y-0 dark:border-[#29403b] dark:divide-[#29403b]">
        {[
          ["Mercadería", plata(datos.resumen.mercaderia), `${datos.resumen.remitos} remitos`],
          ["Servicios y royalty", plata(datos.resumen.servicios), "fuera del food cost"],
          ["Sin asignar", String(datos.resumen.sinAsignar), datos.resumen.sinAsignar > 0 ? "necesitan que digas de quién son" : "todo asignado"],
          ["Con observaciones", String(datos.resumen.conProblemas), "revisá antes de usarlos"],
        ].map(([label, valor, nota]) => (
          <div key={label} className="px-4 py-3">
            <p className="text-xs text-slate-500 dark:text-[#94a19c]">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
            <p className="text-xs text-slate-400 dark:text-[#74817b]">{nota}</p>
          </div>
        ))}
      </section>

      {sinAsignar.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="border-b border-amber-200 px-4 py-3 dark:border-amber-500/30">
            <h2 className="inline-flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle size={16} aria-hidden />
              {sinAsignar.length} {sinAsignar.length === 1 ? "remito sin local" : "remitos sin local"}
            </h2>
            <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300/90">
              No los asigno solo para no ensuciar el costo de dos locales a la vez. Decime de quién es y el
              próximo de ese cliente entra solo.
            </p>
          </div>
          <div className="divide-y divide-amber-200 dark:divide-amber-500/20">
            {sinAsignar.map((compra) => (
              <div key={compra.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {compra.numero} · {fechaCorta(compra.fecha)} · {plata(compra.subtotal)}
                  </p>
                  <p className="truncate text-sm text-slate-600 dark:text-[#c1cbc6]">
                    {compra.cliente}
                    {compra.cuit && <span className="ml-1.5 text-xs text-slate-500">CUIT {compra.cuit}</span>}
                  </p>
                </div>
                <select
                  defaultValue=""
                  disabled={guardando === compra.id}
                  onChange={(e) => asignar(compra.id, e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-[#29403b] dark:bg-[#101c19]"
                >
                  <option value="">Asignar a…</option>
                  {datos.locales.map((local) => (
                    <option key={local.id} value={local.id}>
                      {local.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {datos.controles.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white dark:border-[#29403b] dark:bg-[#101c19]">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
            <h2 className="font-semibold">Control del royalty</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
              La regla es (venta del local ÷ 1,21) × 5%. Se rehace la cuenta contra las ventas de Fudo del
              mes que declara el remito.
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
            {datos.controles.map((control) => (
              <div key={control.compraId} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {control.local} · {MES_LARGO(control.mes)}
                    {control.origenMes === "fecha" && (
                      <span className="ml-1.5 text-xs font-normal text-amber-700 dark:text-amber-300">
                        mes supuesto por la fecha
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${
                      Math.abs(control.diferenciaPct) < 0.5
                        ? "text-emerald-700 dark:text-[#4ee6b0]"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {control.diferencia >= 0 ? "+" : ""}
                    {plata(control.diferencia)} ({control.diferenciaPct >= 0 ? "+" : ""}
                    {control.diferenciaPct.toFixed(2)}%)
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500 dark:text-[#94a19c]">
                  <span className="tabular-nums">Venta {plata(control.ventaConIva)}</span>
                  <span className="tabular-nums">Neta {plata(control.ventaNeta)}</span>
                  <span className="tabular-nums">Corresponde {plata(control.esperado)}</span>
                  <span className="tabular-nums">Cobrado {plata(control.cobrado)}</span>
                </div>
                {!control.completo && (
                  <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                    El mes tiene {control.diasConDatos} de {control.diasDelMes} días sincronizados: la venta
                    está subestimada y la diferencia no sirve todavía.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white dark:border-[#29403b] dark:bg-[#101c19]">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
          <h2 className="font-semibold">Remitos</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
            {fechaCorta(datos.desde)} a {fechaCorta(datos.hasta)}. El remito rotula el 10,5% como
            &ldquo;descuento&rdquo; pero lo suma, así que se muestran las dos cifras.
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
          {datos.compras.map((compra) => (
            <div key={compra.id}>
              <button
                type="button"
                onClick={() => setAbierto(abierto === compra.id ? null : compra.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 dark:hover:bg-[#13201d]"
              >
                {abierto === compra.id ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{compra.numero}</span>
                    <span className="text-sm text-slate-500 dark:text-[#94a19c]">{fechaCorta(compra.fecha)}</span>
                    <span className="text-sm text-slate-500 dark:text-[#94a19c]">
                      {compra.local ?? "sin local"}
                    </span>
                    {compra.tipo === "SERVICIO" && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-[#1d4e48] dark:text-[#37e6b0]">
                        no es mercadería
                      </span>
                    )}
                    {compra.problemas.length > 0 && (
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        {compra.problemas.length} observación{compra.problemas.length > 1 ? "es" : ""}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-slate-400 dark:text-[#74817b]">
                    {compra.items.length} {compra.items.length === 1 ? "línea" : "líneas"}
                    {compra.observaciones && ` · ${compra.observaciones}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">{plata(compra.subtotal)}</span>
                  {compra.ajustePct != null && (
                    <span className="block text-xs text-slate-400 dark:text-[#74817b]">
                      lista {plata(compra.sumaLineas)} +{compra.ajustePct}%
                    </span>
                  )}
                </span>
              </button>

              {abierto === compra.id && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-[#1c2521] dark:bg-[#0d1614]">
                  {compra.problemas.length > 0 && (
                    <ul className="mb-3 space-y-1">
                      {compra.problemas.map((p) => (
                        <li key={p} className="text-xs text-amber-700 dark:text-amber-300">
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[38rem] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-[#26312d] dark:text-[#94a19c]">
                          <th className="py-2 pr-3 font-semibold">Cód.</th>
                          <th className="py-2 pr-3 font-semibold">Producto</th>
                          <th className="py-2 pr-3 text-right font-semibold">Cantidad</th>
                          <th className="py-2 pr-3 text-right font-semibold">Unitario</th>
                          <th className="py-2 pr-3 text-right font-semibold">Lista</th>
                          <th className="py-2 text-right font-semibold">Con 10,5%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compra.items.map((item) => (
                          <tr key={item.codigo + item.detalle} className="border-b border-slate-100 last:border-0 dark:border-[#1c2521]">
                            <td className="py-2 pr-3 tabular-nums text-slate-400 dark:text-[#74817b]">{item.codigo}</td>
                            <td className="py-2 pr-3">{item.detalle}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {item.cantidad.toLocaleString("es-AR")}{" "}
                              <span className="text-xs text-slate-400">{item.unidad.slice(0, 3).toLowerCase()}</span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">{plata(item.precioUnitario)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">
                              {plata(item.total)}
                            </td>
                            <td className="py-2 text-right font-semibold tabular-nums">{plata(item.totalConAjuste)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {compra.origen && (
                    <p className="mt-2 text-xs text-slate-400 dark:text-[#74817b]">Llegó de: {compra.origen}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        {datos.compras.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-[#94a19c]">
            Todavía no entró ningún remito. Configurá la casilla y corré <code>/api/cron/remitos</code>.
          </p>
        )}
      </section>
    </div>
  );
}
