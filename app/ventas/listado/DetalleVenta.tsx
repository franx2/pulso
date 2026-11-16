"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Printer, X } from "lucide-react";
import { ErrorText } from "@/components/ui";
import { plata } from "@/lib/formato";
import { horaAR } from "@/lib/fechaAR";
import type { VentaCompleta } from "@/lib/ventas/consultas";
import { ETIQUETA_MOTIVO, imprimir } from "../comun";

const ESTADO: Record<string, string> = { EN_CURSO: "En curso", CERRADA: "Cerrada", ANULADA: "Anulada" };
const TIPO: Record<string, string> = { MESA: "Mesa", MOSTRADOR: "Mostrador", DELIVERY: "Delivery" };
const fechaHora = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${horaAR(iso)}`;
};

/**
 * El detalle de una venta, a la derecha del listado como en Fudo: quién la
 * abrió y cerró, las adiciones (lo cancelado tachado con su motivo), los
 * pagos y las propinas.
 */
export default function DetalleVenta({ id, onClose }: { id: string; onClose: () => void }) {
  const [venta, setVenta] = useState<VentaCompleta | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    fetch(`/api/ventas/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar la venta");
        if (vigente) setVenta(d.venta);
      })
      .catch((e: Error) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [id]);

  const pagos = venta?.pagos.filter((p) => !p.anulado) ?? [];
  const propinas = pagos.reduce((s, p) => s + p.propina, 0);
  const dato = (etiqueta: string, valor: React.ReactNode) => (
    <div>
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-slate-950/40 motion-safe:animate-[velo_160ms_ease-out] 2xl:hidden" onClick={onClose} aria-hidden />
      <aside
        aria-label="Detalle de la venta"
        className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[88vh] flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-[#FDFDFC] shadow-[0_-12px_32px_rgba(22,19,17,0.18)] motion-safe:animate-[subir_220ms_cubic-bezier(0.16,1,0.3,1)] 2xl:sticky 2xl:top-20 2xl:z-auto 2xl:max-h-[calc(100vh-6rem)] 2xl:rounded-lg 2xl:shadow-none 2xl:motion-safe:animate-[deslizar_200ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        <header className="flex items-center gap-1 bg-slate-950 px-4 py-2.5 text-[#FDFDFC]">
          <h2 className="titulo-marca flex-1 text-base font-bold">Venta {venta ? `#${venta.numero}` : ""}</h2>
          {venta && (
            <>
              <button
                type="button"
                onClick={() => imprimir(`/ventas/${id}/imprimir?tipo=${venta.estado === "CERRADA" ? "ticket" : "precuenta"}`)}
                aria-label="Imprimir"
                title="Imprimir"
                className="grid h-10 w-10 place-items-center rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDFDFC]"
              >
                <Printer size={17} aria-hidden />
              </button>
              <Link
                href={`/ventas/${id}`}
                aria-label="Abrir la venta"
                title="Abrir la venta"
                className="grid h-10 w-10 place-items-center rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDFDFC]"
              >
                <ExternalLink size={17} aria-hidden />
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar el detalle"
            className="grid h-10 w-10 place-items-center rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDFDFC]"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {error ? (
            <p className="p-4">
              <ErrorText>{error}</ErrorText>
            </p>
          ) : !venta ? (
            <div className="m-4 h-56 animate-pulse rounded-md bg-slate-100" />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-100 px-4 py-3 text-sm">
                {dato("Hora inicio", fechaHora(venta.abiertaEn))}
                {dato("Hora cierre", venta.cerradaEn ? fechaHora(venta.cerradaEn) : "—")}
                {dato("Creada por", venta.abiertaPor)}
                {dato("Camarero", venta.mozo?.nombre ?? "—")}
                {dato("Tipo", TIPO[venta.tipo] ?? venta.tipo)}
                {dato("Estado", ESTADO[venta.estado] ?? venta.estado)}
                {dato("Mesa", venta.mesa ? `${venta.mesa.numero} · ${venta.mesa.salon}` : "—")}
                {dato("Personas", venta.comensales ?? "—")}
                {venta.cliente && <div className="col-span-2">{dato("Cliente", venta.cliente)}</div>}
                {venta.motivoAnulacion && <p className="col-span-2 text-sm text-rose-700">Anulada: {venta.motivoAnulacion}</p>}
              </dl>

              <p className="titulo-marca px-4 pb-1 pt-3 text-[0.6875rem] font-semibold text-slate-500">Adiciones</p>
              <ul className="text-sm">
                {venta.items.map((i) => (
                  <li key={i.id} className={`flex items-baseline gap-2 px-4 py-1.5 ${i.anulado ? "text-slate-400" : ""}`}>
                    <span className="w-7 shrink-0 tabular-nums text-slate-500">{i.cantidad}×</span>
                    <span className="min-w-0 flex-1">
                      <span className={i.anulado ? "line-through" : ""}>{i.nombre}</span>
                      {i.anulado && (
                        <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-rose-700">
                          Cancelado: {ETIQUETA_MOTIVO[i.motivoAnulacion ?? ""] ?? "—"}
                          {i.comentarioAnulacion ? ` · ${i.comentarioAnulacion}` : ""}
                        </span>
                      )}
                      {i.descuentoNombre && !i.anulado && <span className="block text-xs text-violet-700">{i.descuentoNombre}</span>}
                    </span>
                    <span className={`tabular-nums ${i.anulado ? "line-through" : ""}`}>{plata(i.precio * i.cantidad)}</span>
                  </li>
                ))}
              </ul>

              <dl className="mx-4 mt-2 grid grid-cols-[1fr_auto] gap-y-0.5 border-t border-slate-200 pt-2 text-sm">
                {(venta.descuento > 0 || venta.descuentoItems > 0) && (
                  <>
                    <dt className="text-violet-700">{venta.descuentoMotivo ?? "Descuentos"}</dt>
                    <dd className="text-right tabular-nums text-violet-700">−{plata(venta.descuento + venta.descuentoItems)}</dd>
                  </>
                )}
                <dt className="titulo-marca self-end font-semibold">Total</dt>
                <dd className="text-right text-xl font-bold tabular-nums">{plata(venta.total)}</dd>
              </dl>

              <p className="titulo-marca px-4 pb-1 pt-4 text-[0.6875rem] font-semibold text-slate-500">Pagos</p>
              {pagos.length === 0 ? (
                <p className="px-4 text-sm text-slate-500">Sin pagos.</p>
              ) : (
                <ul className="text-sm">
                  {pagos.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3 px-4 py-1">
                      <span>
                        {p.medio} <span className="text-xs text-slate-500">{horaAR(p.createdAt)}</span>
                      </span>
                      <span className="tabular-nums">{plata(p.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="titulo-marca px-4 pb-1 pt-4 text-[0.6875rem] font-semibold text-slate-500">Propinas</p>
              <p className="flex justify-between px-4 pb-4 text-sm">
                <span>{propinas > 0 ? "Para el personal" : "Sin propina"}</span>
                {propinas > 0 && <span className="font-semibold tabular-nums">{plata(propinas)}</span>}
              </p>

              {venta.factura.comprobantes.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
                  {venta.factura.comprobantes.map((c) => (
                    <p key={c.id}>
                      {c.cae ? `Comprobante ${String(c.puntoVenta).padStart(4, "0")}-${String(c.numero).padStart(8, "0")} · CAE ${c.cae}` : `Factura pendiente${c.error ? `: ${c.error}` : ""}`}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
