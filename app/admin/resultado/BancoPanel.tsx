"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Trash2, Upload } from "lucide-react";
import { Badge, Button, EmptyState, Panel, SelectorSegmentado } from "@/components/ui";
import { plata, fechaCorta, porcentaje as pct } from "@/lib/formato";

/**
 * Conciliación bancaria e impuestos del período.
 *
 * Se sube el CSV que exporta el banco, se categoriza solo, y se compara
 * contra lo que Fudo dice que se cobró por tarjeta y transferencia. Es por
 * período y medio de pago, no remito por remito: el banco liquida en lotes y
 * con demora, así que una diferencia chica es esperable y no un error.
 *
 * El efectivo y Pedidos Ya / Uber Eats no pasan por este extracto —el
 * efectivo nunca toca el banco, y los delivery liquidan a otra cuenta que
 * todavía no se carga acá— así que se muestran aparte, no como faltantes.
 */

type FilaConciliacion = {
  medio: "Tarjeta" | "Transferencia";
  fudoBruto: number;
  comisionEsperada: number;
  netoEsperado: number;
  banco: number;
  diferencia: number;
  diferenciaPct: number | null;
};

type Conciliacion = {
  filas: FilaConciliacion[];
  totalFudoBruto: number;
  totalNetoEsperado: number;
  totalBanco: number;
  totalDiferencia: number;
  excluido: { efectivo: number; delivery: number; sinReconocer: number };
  bancoImpuestosComisiones: number;
  bancoOtros: number;
  ventaTotal: number;
  ventaNoEfectivo: number;
};

type CargaIIBB = { sobreVentaTotal: number; retenidoAproximado: number; diferencia: number; baseNeta: number };
type PosicionIVA = { debitoFiscal: number; creditoFiscal: number; aPagar: number };

type Movimiento = {
  id: string;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  categoria: "TARJETA" | "TRANSFERENCIA" | "IMPUESTO_COMISION" | "OTRO";
  credito: number;
  debito: number;
  saldo: number | null;
};

type CuentaLocal = {
  localId: string;
  local: string;
  conciliacion: Conciliacion;
  iibb: CargaIIBB;
  iva: PosicionIVA;
  movimientos: Movimiento[];
};

type Respuesta = {
  locales: { id: string; nombre: string }[];
  porLocal: CuentaLocal[];
};

const ETIQUETA_CATEGORIA: Record<Movimiento["categoria"], string> = {
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  IMPUESTO_COMISION: "Impuesto/comisión",
  OTRO: "Otro",
};

type FiltroMovimiento = "todos" | "TARJETA" | "TRANSFERENCIA" | "IMPUESTO_COMISION" | "OTRO";
const FILTROS: { clave: FiltroMovimiento; label: string }[] = [
  { clave: "todos", label: "Todos" },
  { clave: "TARJETA", label: "Tarjeta" },
  { clave: "TRANSFERENCIA", label: "Transferencia" },
  { clave: "IMPUESTO_COMISION", label: "Impuestos/comisiones" },
  { clave: "OTRO", label: "Otro" },
];

export default function BancoPanel({ localId, periodo }: { localId: string; periodo: URLSearchParams }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controlador = new AbortController();
    const params = new URLSearchParams(periodo);
    if (localId) params.set("localId", localId);
    fetch(`/api/conciliacion?${params}`, { signal: controlador.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fallo"))))
      .then(setDatos)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError("No pudimos cargar la conciliación.");
        }
      });
    return () => controlador.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.toString(), localId, revision]);

  if (error) return <p className="text-sm text-slate-500 dark:text-[#94a19c]">{error}</p>;
  if (!datos) {
    return <div className="h-64 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Cargando" />;
  }

  if (!localId) {
    return (
      <Panel>
        <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
          <h2 className="font-semibold">Conciliación bancaria</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
            Cada sucursal tiene su propia cuenta. Elegí una arriba en el filtro de Local para
            cargar su extracto y ver la conciliación.
          </p>
        </div>
      </Panel>
    );
  }

  const actual = datos.porLocal.find((l) => l.localId === localId);
  if (!actual) return <EmptyState>No encontramos esta sucursal.</EmptyState>;

  return <DetalleLocal cuenta={actual} onCambio={() => setRevision((v) => v + 1)} />;
}

function DetalleLocal({ cuenta, onCambio }: { cuenta: CuentaLocal; onCambio: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultadoCarga, setResultadoCarga] = useState<{
    leidas: number;
    importadas: number;
    yaCargadas: number;
  } | null>(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [filtro, setFiltro] = useState<FiltroMovimiento>("todos");

  async function subirArchivo(archivo: File) {
    setSubiendo(true);
    setErrorCarga("");
    setResultadoCarga(null);
    try {
      const csv = await archivo.text();
      const res = await fetch(`/api/locales/${cuenta.localId}/banco`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorCarga(data.error ?? "No se pudo leer el archivo.");
        return;
      }
      setResultadoCarga(data);
      onCambio();
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const c = cuenta.conciliacion;
  const movimientosVisibles = [...cuenta.movimientos]
    .reverse()
    .filter((m) => filtro === "todos" || m.categoria === filtro);

  return (
    <div className="space-y-5">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Extracto bancario</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
              El CSV que exporta el banco para {cuenta.local}. Subirlo dos veces no duplica nada.
            </p>
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) subirArchivo(archivo);
              }}
            />
            <Button type="button" disabled={subiendo} onClick={() => inputRef.current?.click()}>
              <Upload size={16} />
              {subiendo ? "Leyendo…" : "Subir CSV"}
            </Button>
          </div>
        </div>
        {errorCarga && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{errorCarga}</p>}
        {resultadoCarga && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-[#4ee6b0]">
            <CheckCircle2 size={15} aria-hidden />
            {resultadoCarga.importadas} movimientos nuevos
            {resultadoCarga.yaCargadas > 0 && ` · ${resultadoCarga.yaCargadas} ya estaban cargados`}
          </p>
        )}
      </Panel>

      {cuenta.movimientos.length === 0 ? (
        <EmptyState>
          Sin movimientos bancarios cargados en este período para {cuenta.local}. Subí el CSV del
          banco para ver la conciliación.
        </EmptyState>
      ) : (
        <>
          <Panel>
            <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
              <h2 className="font-semibold">Tarjeta y transferencia: Fudo contra el banco</h2>
              <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500 dark:text-[#94a19c]">
                El banco liquida en lotes con uno o más días de demora y ya neto de su comisión;
                una diferencia chica es esperable. Comparación por período, no remito por remito.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-[#26312d] dark:text-[#5d6d67]">
                    <th className="px-4 py-2 font-semibold">Medio</th>
                    <th className="px-3 py-2 text-right font-semibold">Fudo (bruto)</th>
                    <th className="px-3 py-2 text-right font-semibold">Comisión esperada</th>
                    <th className="px-3 py-2 text-right font-semibold">Neto esperado</th>
                    <th className="px-3 py-2 text-right font-semibold">Banco</th>
                    <th className="px-4 py-2 text-right font-semibold">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                  {c.filas.map((f) => (
                    <tr key={f.medio}>
                      <td className="px-4 py-2.5 font-medium">{f.medio}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{plata(f.fudoBruto)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">
                        {f.comisionEsperada > 0 ? `− ${plata(f.comisionEsperada)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{plata(f.netoEsperado)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{plata(f.banco)}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                          Math.abs(f.diferencia) < 1
                            ? "text-slate-400"
                            : f.diferencia > 0
                              ? "text-emerald-700 dark:text-[#4ee6b0]"
                              : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {plata(f.diferencia)}
                        {f.diferenciaPct != null && (
                          <span className="ml-1 font-normal text-slate-400">
                            ({pct(f.diferenciaPct, { signo: true })})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 font-semibold dark:border-[#29403b]">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{plata(c.totalFudoBruto)}</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right tabular-nums">{plata(c.totalNetoEsperado)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{plata(c.totalBanco)}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        Math.abs(c.totalDiferencia) < 1
                          ? "text-slate-400"
                          : c.totalDiferencia > 0
                            ? "text-emerald-700 dark:text-[#4ee6b0]"
                            : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {plata(c.totalDiferencia)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-[#1c2521] dark:text-[#94a19c]">
              <span>Efectivo (no pasa por el banco): {plata(c.excluido.efectivo)}</span>
              <span>Pedidos Ya / Uber Eats (otra cuenta): {plata(c.excluido.delivery)}</span>
              {c.excluido.sinReconocer > 0 && (
                <span className="text-amber-700 dark:text-amber-300">
                  Medio de pago sin reconocer: {plata(c.excluido.sinReconocer)}
                </span>
              )}
              {c.bancoImpuestosComisiones > 0 && (
                <span>Impuestos y comisiones del banco: {plata(c.bancoImpuestosComisiones)}</span>
              )}
            </div>
          </Panel>

          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Panel className="p-4">
              <h2 className="font-semibold">Ingresos Brutos del período</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
                5% sobre toda la venta neta, efectivo incluido: no se retiene solo, se declara.
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums">{plata(cuenta.iibb.sobreVentaTotal)}</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-[#74817b]">
                Retenido aproximado en lo no efectivo: {plata(cuenta.iibb.retenidoAproximado)}
              </p>
            </Panel>
            <Panel className="p-4">
              <h2 className="font-semibold">IVA del período</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
                Débito fiscal sobre toda la venta; el crédito de compras es cero sin Factura A.
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums">{plata(cuenta.iva.aPagar)}</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-[#74817b]">
                {plata(cuenta.iva.debitoFiscal)} de débito − {plata(cuenta.iva.creditoFiscal)} de crédito
              </p>
            </Panel>
          </section>

          <Panel>
            <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
              <h2 className="font-semibold">Movimientos del extracto</h2>
            </div>
            <div className="scrollbar-hidden overflow-x-auto border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
              <SelectorSegmentado label="Filtrar movimientos" valor={filtro} onChange={setFiltro} opciones={FILTROS} />
            </div>
            {movimientosVisibles.length === 0 ? (
              <EmptyState>Ningún movimiento coincide con este filtro.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-[#26312d] dark:text-[#5d6d67]">
                      <th className="px-4 py-2 font-semibold">Fecha</th>
                      <th className="px-3 py-2 font-semibold">Descripción</th>
                      <th className="px-3 py-2 font-semibold">Categoría</th>
                      <th className="px-3 py-2 text-right font-semibold">Crédito</th>
                      <th className="px-3 py-2 text-right font-semibold">Débito</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                    {movimientosVisibles.map((m) => (
                      <tr key={m.id}>
                        <td className="px-4 py-2 tabular-nums text-slate-500 dark:text-[#94a19c]">
                          {fechaCorta(m.fecha)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{m.descripcion}</span>
                          {m.referencia && (
                            <span className="ml-1.5 text-xs text-slate-400 dark:text-[#74817b]">
                              {m.referencia}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={m.categoria === "OTRO" ? "slate" : "emerald"}>
                            {ETIQUETA_CATEGORIA[m.categoria]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-[#4ee6b0]">
                          {m.credito > 0 ? plata(m.credito) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.debito > 0 ? plata(m.debito) : "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await fetch(`/api/movimientos-bancarios/${m.id}`, { method: "DELETE" });
                              onCambio();
                            }}
                            title="Borrar este movimiento"
                            aria-label="Borrar este movimiento"
                            className="text-slate-400 transition-colors hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {cuenta.movimientos.length > 0 && cuenta.conciliacion.totalBanco === 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          Hay movimientos cargados pero ninguno cayó en Tarjeta ni Transferencia: revisá que el
          CSV sea del banco correcto para este período.
        </p>
      )}
    </div>
  );
}
