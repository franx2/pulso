"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Trash2, Upload } from "lucide-react";
import type { Aviso } from "@/lib/compras/movimientosRaros";
import { Badge, Button, EmptyState, Panel, SelectorSegmentado, useConfirm } from "@/components/ui";
import { plata, fechaCorta, fechaLarga, porcentaje as pct } from "@/lib/formato";

/**
 * Conciliación bancaria e impuestos del período.
 *
 * Se sube el CSV o el PDF que exporta el banco, se categoriza solo, y se compara
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
  paraRevisar: { avisos: Aviso[]; historiaSuficiente: boolean };
};

type Respuesta = {
  localesConExtracto: string[];
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

export default function BancoPanel({
  localId,
  periodo,
  onPeriodoDetectado,
  onLocalSugerido,
}: {
  localId: string;
  periodo: URLSearchParams;
  /** Sin local elegido, la sucursal que tiene extracto cargado. */
  onLocalSugerido?: (localId: string) => void;
  /** Se llama con "AAAA-MM" cuando el archivo subido cae entero en un mes,
   * para que el filtro de arriba salte solo ahí en vez de mostrar "sin
   * movimientos" porque estaba mirando otro período. */
  onPeriodoDetectado?: (mes: string) => void;
}) {
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

  const sugerido = !localId ? datos?.localesConExtracto[0] : undefined;
  useEffect(() => {
    if (sugerido) onLocalSugerido?.(sugerido);
  }, [sugerido]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="text-sm text-slate-500">{error}</p>;
  if (!datos) {
    return <div className="h-64 animate-pulse rounded-lg bg-slate-200/70" aria-label="Cargando" />;
  }

  if (!localId) {
    return (
      <Panel>
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Conciliación bancaria</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Cada sucursal tiene su propia cuenta. Elegí una arriba en el filtro de Local para
            cargar su extracto y ver la conciliación.
          </p>
        </div>
      </Panel>
    );
  }

  const actual = datos.porLocal.find((l) => l.localId === localId);
  if (!actual) return <EmptyState>No encontramos esta sucursal.</EmptyState>;

  return (
    <DetalleLocal
      cuenta={actual}
      onCambio={() => setRevision((v) => v + 1)}
      onPeriodoDetectado={onPeriodoDetectado}
    />
  );
}

function DetalleLocal({
  cuenta,
  onCambio,
  onPeriodoDetectado,
}: {
  cuenta: CuentaLocal;
  onCambio: () => void;
  onPeriodoDetectado?: (mes: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultadoCarga, setResultadoCarga] = useState<{
    leidas: number;
    importadas: number;
    yaCargadas: number;
    desde?: string;
    hasta?: string;
    mesDetectado?: string;
  } | null>(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [filtro, setFiltro] = useState<FiltroMovimiento>("todos");

  async function subirArchivo(archivo: File) {
    setSubiendo(true);
    setErrorCarga("");
    setResultadoCarga(null);
    try {
      const esPdf = archivo.type === "application/pdf" || archivo.name.toLowerCase().endsWith(".pdf");
      const cuerpo = esPdf ? { pdfBase64: await base64DeArchivo(archivo) } : { csv: await archivo.text() };

      const res = await fetch(`/api/locales/${cuenta.localId}/banco`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorCarga(data.error ?? "No se pudo leer el archivo.");
        return;
      }

      // Si el archivo cae entero en un mes, el filtro de arriba salta solo
      // ahí: sin esto, subir el extracto de agosto mientras se mira
      // septiembre mostraba "sin movimientos" y parecía que la carga falló.
      const mesDetectado: string | undefined =
        data.desde && data.hasta && data.desde.slice(0, 7) === data.hasta.slice(0, 7)
          ? data.desde.slice(0, 7)
          : undefined;
      if (mesDetectado) onPeriodoDetectado?.(mesDetectado);

      setResultadoCarga({ ...data, mesDetectado });
      onCambio();
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Borrar un movimiento cambia la conciliación: no se hace de un toque.
  const { confirm, dialog } = useConfirm();
  function pedirBorrar(m: Movimiento) {
    confirm({
      title: "Borrar este movimiento",
      message: `Se borra «${m.descripcion}» del ${fechaLarga(m.fecha)} (${plata(m.credito > 0 ? m.credito : m.debito)}) del extracto cargado. Si fue un error de carga, volver a subir el archivo lo recupera.`,
      confirmLabel: "Borrar movimiento",
      tone: "danger",
      onConfirm: async () => {
        await fetch(`/api/movimientos-bancarios/${m.id}`, { method: "DELETE" });
        onCambio();
      },
    });
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
            <p className="mt-0.5 text-sm text-slate-500">
              El CSV o el PDF que exporta el banco para {cuenta.local}. Subirlo dos veces no
              duplica nada, y el período de arriba salta solo al mes que cubre el archivo.
            </p>
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv,.pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) subirArchivo(archivo);
              }}
            />
            <Button type="button" disabled={subiendo} onClick={() => inputRef.current?.click()}>
              <Upload size={16} />
              {subiendo ? "Leyendo…" : "Subir extracto"}
            </Button>
          </div>
        </div>
        {errorCarga && <p className="mt-2 text-sm text-rose-600">{errorCarga}</p>}
        {resultadoCarga && (
          <div className="mt-2 flex flex-col gap-1 text-sm text-emerald-700">
            <p className="flex items-center gap-1.5">
              <CheckCircle2 size={15} aria-hidden />
              {resultadoCarga.importadas} movimientos nuevos
              {resultadoCarga.yaCargadas > 0 && ` · ${resultadoCarga.yaCargadas} ya estaban cargados`}
            </p>
            {resultadoCarga.desde && resultadoCarga.hasta && (
              <p className="text-xs text-slate-500">
                Período del archivo: {fechaCorta(resultadoCarga.desde)} a {fechaCorta(resultadoCarga.hasta)}
                {resultadoCarga.mesDetectado
                  ? " · el filtro de arriba se movió a ese mes solo"
                  : " · abarca más de un mes, ajustá el filtro de arriba para verlo"}
              </p>
            )}
          </div>
        )}
      </Panel>

      {cuenta.movimientos.length > 0 && <ParaRevisar {...cuenta.paraRevisar} />}

      {cuenta.movimientos.length === 0 ? (
        <EmptyState>
          Sin movimientos bancarios cargados en este período para {cuenta.local}. Subí el extracto
          del banco (CSV o PDF) para ver la conciliación.
        </EmptyState>
      ) : (
        <>
          <Panel>
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold">Tarjeta y transferencia: Fudo contra el banco</h2>
              <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500">
                El banco liquida en lotes con uno o más días de demora y ya neto de su comisión;
                una diferencia chica es esperable. Comparación por período, no remito por remito.
              </p>
            </div>
            {/* Celular: seis columnas no entran. Cada medio es un bloque con
                sus cinco cifras en el orden de la cuenta, y la diferencia al final. */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {[
                ...c.filas.map((f) => ({
                  clave: f.medio,
                  titulo: f.medio,
                  fudoBruto: f.fudoBruto,
                  comision: f.comisionEsperada,
                  neto: f.netoEsperado,
                  banco: f.banco,
                  diferencia: f.diferencia,
                  pct: f.diferenciaPct,
                })),
                {
                  clave: "total",
                  titulo: "Total",
                  fudoBruto: c.totalFudoBruto,
                  comision: 0,
                  neto: c.totalNetoEsperado,
                  banco: c.totalBanco,
                  diferencia: c.totalDiferencia,
                  pct: null as number | null,
                },
              ].map((b) => (
                <li key={b.clave} className={`px-4 py-3 ${b.clave === "total" ? "bg-slate-50" : ""}`}>
                  <p className="font-semibold">{b.titulo}</p>
                  <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-slate-500">Fudo (bruto)</dt>
                    <dd className="text-right tabular-nums">{plata(b.fudoBruto)}</dd>
                    {b.comision > 0 && (
                      <>
                        <dt className="text-slate-500">Comisión esperada</dt>
                        <dd className="text-right tabular-nums text-slate-500">− {plata(b.comision)}</dd>
                      </>
                    )}
                    <dt className="text-slate-500">Neto esperado</dt>
                    <dd className="text-right tabular-nums">{plata(b.neto)}</dd>
                    <dt className="text-slate-500">Banco</dt>
                    <dd className="text-right tabular-nums">{plata(b.banco)}</dd>
                    <dt className="font-semibold">Diferencia</dt>
                    <dd
                      className={`text-right font-semibold tabular-nums ${
                        Math.abs(b.diferencia) < 1
                          ? "text-slate-500"
                          : b.diferencia > 0
                            ? "text-emerald-700"
                            : "text-rose-600"
                      }`}
                    >
                      {plata(b.diferencia)}
                      {b.pct != null && (
                        <span className="ml-1 font-normal text-slate-500">
                          ({pct(b.pct, { signo: true })})
                        </span>
                      )}
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="px-4 py-2 font-semibold">Medio</th>
                    <th className="px-3 py-2 text-right font-semibold">Fudo (bruto)</th>
                    <th className="px-3 py-2 text-right font-semibold">Comisión esperada</th>
                    <th className="px-3 py-2 text-right font-semibold">Neto esperado</th>
                    <th className="px-3 py-2 text-right font-semibold">Banco</th>
                    <th className="px-4 py-2 text-right font-semibold">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {c.filas.map((f) => (
                    <tr key={f.medio}>
                      <td className="px-4 py-2.5 font-medium">{f.medio}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{plata(f.fudoBruto)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                        {f.comisionEsperada > 0 ? `− ${plata(f.comisionEsperada)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{plata(f.netoEsperado)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{plata(f.banco)}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                          Math.abs(f.diferencia) < 1
                            ? "text-slate-500"
                            : f.diferencia > 0
                              ? "text-emerald-700"
                              : "text-rose-600"
                        }`}
                      >
                        {plata(f.diferencia)}
                        {f.diferenciaPct != null && (
                          <span className="ml-1 font-normal text-slate-500">
                            ({pct(f.diferenciaPct, { signo: true })})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{plata(c.totalFudoBruto)}</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right tabular-nums">{plata(c.totalNetoEsperado)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{plata(c.totalBanco)}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        Math.abs(c.totalDiferencia) < 1
                          ? "text-slate-500"
                          : c.totalDiferencia > 0
                            ? "text-emerald-700"
                            : "text-rose-600"
                      }`}
                    >
                      {plata(c.totalDiferencia)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>Efectivo (no pasa por el banco): {plata(c.excluido.efectivo)}</span>
              <span>Pedidos Ya / Uber Eats (otra cuenta): {plata(c.excluido.delivery)}</span>
              {c.excluido.sinReconocer > 0 && (
                <span className="text-amber-700">
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
              <p className="mt-0.5 text-sm text-slate-500">
                5% sobre toda la venta neta, efectivo incluido: no se retiene solo, se declara.
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums">{plata(cuenta.iibb.sobreVentaTotal)}</p>
              <p className="mt-1 text-xs text-slate-500">
                Retenido aproximado en lo no efectivo: {plata(cuenta.iibb.retenidoAproximado)}
              </p>
            </Panel>
            <Panel className="p-4">
              <h2 className="font-semibold">IVA del período</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Débito fiscal sobre toda la venta; el crédito de compras es cero sin Factura A.
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums">{plata(cuenta.iva.aPagar)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {plata(cuenta.iva.debitoFiscal)} de débito − {plata(cuenta.iva.creditoFiscal)} de crédito
              </p>
            </Panel>
          </section>

          <Panel>
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold">Movimientos del extracto</h2>
            </div>
            <div className="scrollbar-hidden overflow-x-auto border-b border-slate-100 px-4 py-3">
              <SelectorSegmentado label="Filtrar movimientos" valor={filtro} onChange={setFiltro} opciones={FILTROS} />
            </div>
            {movimientosVisibles.length === 0 ? (
              <EmptyState>Ningún movimiento coincide con este filtro.</EmptyState>
            ) : (
              <>
              <ul className="divide-y divide-slate-100 md:hidden">
                {movimientosVisibles.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{m.descripcion}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        {fechaLarga(m.fecha)}
                        <Badge tone={m.categoria === "OTRO" ? "slate" : "emerald"}>{ETIQUETA_CATEGORIA[m.categoria]}</Badge>
                      </p>
                      {m.referencia && (
                        <p className="mt-0.5 break-words text-xs text-slate-500">{m.referencia}</p>
                      )}
                    </div>
                    <p
                      className={`shrink-0 text-right font-semibold tabular-nums ${
                        m.credito > 0 ? "text-emerald-700" : ""
                      }`}
                    >
                      {m.credito > 0 ? plata(m.credito) : plata(-m.debito)}
                    </p>
                    <button
                      type="button"
                      onClick={() => pedirBorrar(m)}
                      title="Borrar este movimiento"
                      aria-label="Borrar este movimiento"
                      className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      <th className="px-4 py-2 font-semibold">Fecha</th>
                      <th className="px-3 py-2 font-semibold">Descripción</th>
                      <th className="px-3 py-2 font-semibold">Categoría</th>
                      <th className="px-3 py-2 text-right font-semibold">Crédito</th>
                      <th className="px-3 py-2 text-right font-semibold">Débito</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movimientosVisibles.map((m) => (
                      <tr key={m.id}>
                        <td className="px-4 py-2 tabular-nums text-slate-500">
                          {fechaCorta(m.fecha)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{m.descripcion}</span>
                          {m.referencia && (
                            <span className="ml-1.5 text-xs text-slate-500">
                              {m.referencia}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={m.categoria === "OTRO" ? "slate" : "emerald"}>
                            {ETIQUETA_CATEGORIA[m.categoria]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                          {m.credito > 0 ? plata(m.credito) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.debito > 0 ? plata(m.debito) : "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => pedirBorrar(m)}
                            title="Borrar este movimiento"
                            aria-label="Borrar este movimiento"
                            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-colors hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </Panel>
        </>
      )}

      {cuenta.movimientos.length > 0 && cuenta.conciliacion.totalBanco === 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          Hay movimientos cargados pero ninguno cayó en Tarjeta ni Transferencia: revisá que el
          extracto sea del banco correcto para este período.
        </p>
      )}
      {dialog}
    </div>
  );
}

/**
 * `File` → base64, en trozos: `String.fromCharCode(...bytes)` con todo el
 * archivo de una vez rompe el límite de argumentos del motor en un PDF de
 * este tamaño (cientos de miles de bytes).
 */
/**
 * Lo que conviene mirar del extracto: cargos que subieron, pagos nuevos,
 * posibles duplicados. Primero lo que puede ser plata que no tendría que
 * salir; después lo que es para saber.
 */
function ParaRevisar({ avisos, historiaSuficiente }: { avisos: Aviso[]; historiaSuficiente: boolean }) {
  const revisar = avisos.filter((a) => a.gravedad === "revisar").length;
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="font-semibold">Para revisar</h2>
          <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500">
            Cargos que subieron, pagos que no aparecían antes y posibles duplicados. Cada aviso dice contra qué se
            comparó; los impuestos que acompañan cada movimiento no se marcan.
          </p>
        </div>
        {avisos.length > 0 && (
          <Badge tone={revisar > 0 ? "amber" : "slate"}>
            {revisar > 0 ? `${revisar} para revisar` : "Nada para revisar"}
          </Badge>
        )}
      </div>
      {avisos.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-emerald-700">
          <CheckCircle2 size={16} aria-hidden />
          Nada raro en este período.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {avisos.map((a) => (
            <li key={`${a.tipo}-${a.ids.join("-")}`} className="flex gap-3 px-4 py-3">
              {a.gravedad === "revisar" ? (
                <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" aria-label="Para revisar" />
              ) : (
                <Info size={17} className="mt-0.5 shrink-0 text-slate-400" aria-label="Para saber" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{a.titulo}</span>
                  <span className="text-slate-500"> · {a.quien}</span>
                </p>
                <p className="mt-0.5 text-sm text-slate-500">{a.detalle}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{plata(a.monto)}</p>
                <p className="text-xs tabular-nums text-slate-500">{fechaCorta(a.fecha)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!historiaSuficiente && (
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          Para marcar pagos nuevos hace falta al menos un mes de extracto anterior a este período. Subí el extracto
          del mes anterior y se van a ver también.
        </p>
      )}
    </Panel>
  );
}

async function base64DeArchivo(archivo: File): Promise<string> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const TROZO = 8192;
  let binario = "";
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(binario);
}
