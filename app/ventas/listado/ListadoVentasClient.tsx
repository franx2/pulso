"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCheck2, Search } from "lucide-react";
import PeriodoSelector, { usePeriodo } from "@/components/PeriodoSelector";
import { SelectorLocal } from "@/components/BarraContexto";
import { ErrorText, Input, PageTitle, Panel, Select, SelectorSegmentado } from "@/components/ui";
import { fechaLarga, numero, plata } from "@/lib/formato";
import { NavVentas, useLocalVentas } from "../comun";
import DetalleVenta from "./DetalleVenta";

type Venta = {
  id: string;
  numero: number;
  tipo: "MESA" | "MOSTRADOR" | "DELIVERY";
  estado: "EN_CURSO" | "CERRADA" | "ANULADA";
  abiertaEn: string;
  cerradaEn: string | null;
  donde: string;
  mozo: string;
  productos: number;
  bruto: number;
  descuento: number;
  descuentoMotivo: string | null;
  total: number;
  medios: string[];
  motivoAnulacion: string | null;
  factura: { tipo: number; puntoVenta: number; numero: number } | null;
};
type Filtro = "todas" | "CERRADA" | "EN_CURSO" | "ANULADA";

const ESTADO: Record<Venta["estado"], { texto: string; clase: string }> = {
  CERRADA: { texto: "Cerrada", clase: "bg-emerald-100 text-emerald-800" },
  EN_CURSO: { texto: "En curso", clase: "bg-sky-100 text-sky-800" },
  ANULADA: { texto: "Anulada", clase: "bg-rose-100 text-rose-800" },
};
const TIPO_FACTURA: Record<number, string> = { 1: "Fact. A", 6: "Fact. B", 3: "NC A", 8: "NC B" };
const fechaHora = (iso: string) => {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

async function pedir(url: string) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo cargar");
  return data;
}

export default function ListadoVentasClient() {
  const [localGuardado, setLocalGuardado] = useLocalVentas();
  const { valor, setValor, params: periodo, hoy } = usePeriodo();
  const [locales, setLocales] = useState<{ id: string; nombre: string }[]>([]);
  const [localId, setLocalId] = useState("");
  const [datos, setDatos] = useState<{ desde: string; hasta: string; ventas: Venta[] } | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [mozo, setMozo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const clavePeriodo = periodo.toString();
  const cargar = useCallback(async () => {
    const salon = await pedir(`/api/ventas/salon${localGuardado ? `?localId=${localGuardado}` : ""}`);
    setLocales(salon.locales);
    setLocalId(salon.localId ?? "");
    if (!salon.localId) return;
    const params = new URLSearchParams(clavePeriodo);
    params.set("localId", salon.localId);
    setDatos(await pedir(`/api/ventas/listado?${params}`));
    setError("");
  }, [localGuardado, clavePeriodo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reactivo al período y al local
    cargar().catch((e: Error) => setError(e.message));
  }, [cargar]);

  const visibles = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.trim().replace(/^#/, "").toLowerCase();
    return datos.ventas.filter(
      (v) =>
        (filtro === "todas" || v.estado === filtro) &&
        (!mozo || v.mozo === mozo) &&
        (!q || String(v.numero) === q || v.donde.toLowerCase().includes(q))
    );
  }, [datos, filtro, mozo, busqueda]);

  const cerradas = visibles.filter((v) => v.estado === "CERRADA");
  const total = cerradas.reduce((s, v) => s + v.total, 0);
  const descuentos = cerradas.reduce((s, v) => s + v.descuento, 0);
  const mozos = [...new Set(datos?.ventas.map((v) => v.mozo) ?? [])].sort();
  const cuenta = (e: Filtro) => (e === "todas" ? (datos?.ventas.length ?? 0) : (datos?.ventas.filter((v) => v.estado === e).length ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <PageTitle subtitle="Cada venta del local, con su origen, mozo, descuento, total y cómo se pagó" actions={<NavVentas activo="listado" />}>
        Ventas
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        {locales.length > 1 && <SelectorLocal locales={locales} valor={localId} onChange={setLocalGuardado} todos={null} />}
        <PeriodoSelector valor={valor} onChange={setValor} hoy={hoy} />
        {datos && <p className="text-xs text-slate-500">{fechaLarga(datos.desde)} a {fechaLarga(datos.hasta)}</p>}
      </div>
      <ErrorText>{error}</ErrorText>

      {datos && (
        <Panel className="grid grid-cols-2 divide-slate-100 md:grid-cols-4 md:divide-x">
          {[
            ["Ventas cerradas", numero(cerradas.length)],
            ["Total cobrado", plata(total)],
            ["Descuentos", plata(descuentos)],
            ["Promedio por venta", plata(cerradas.length ? total / cerradas.length : 0)],
          ].map(([e, v]) => (
            <div key={e} className="px-4 py-3">
              <p className="titulo-marca text-[0.6875rem] font-semibold text-slate-500">{e}</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{v}</p>
            </div>
          ))}
        </Panel>
      )}

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_26rem]">
      <Panel className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <label className="relative min-w-[10rem] flex-1">
            <span className="sr-only">Buscar venta</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Número, mesa o cliente" className="pl-9" />
          </label>
          <SelectorSegmentado
            label="Estado"
            valor={filtro}
            onChange={setFiltro}
            opciones={[
              { clave: "todas", label: `Todas · ${cuenta("todas")}` },
              { clave: "CERRADA", label: `Cerradas · ${cuenta("CERRADA")}` },
              { clave: "EN_CURSO", label: `En curso · ${cuenta("EN_CURSO")}` },
              { clave: "ANULADA", label: `Anuladas · ${cuenta("ANULADA")}` },
            ]}
          />
          {mozos.length > 1 && (
            <Select value={mozo} onChange={(e) => setMozo(e.target.value)} aria-label="Mozo" className="w-auto">
              <option value="">Todos los mozos</option>
              {mozos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          )}
        </div>

        {!datos ? (
          <div className="m-4 h-48 animate-pulse rounded-lg bg-slate-200/70" aria-label="Cargando ventas" />
        ) : visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">No hay ventas con estos filtros en el período.</p>
        ) : (
          <>
            <div
              className="hidden grid-cols-[4rem_6.5rem_minmax(9rem,1fr)_9rem_6.5rem_7rem_minmax(0,11rem)_6rem] gap-x-3 border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-500 xl:grid"
              aria-hidden
            >
              <span>Nº</span>
              <span>Abierta</span>
              <span>Origen</span>
              <span>Mozo</span>
              <span className="text-right">Descuento</span>
              <span className="text-right">Total</span>
              <span>Pago</span>
              <span>Estado</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {visibles.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSel(v.id === sel ? null : v.id)}
                    aria-pressed={v.id === sel}
                    className={`grid w-full text-left ${v.id === sel ? "bg-arena-50" : ""} grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-950 xl:grid-cols-[4rem_6.5rem_minmax(9rem,1fr)_9rem_6.5rem_7rem_minmax(0,11rem)_6rem]`}
                  >
                    <span className="font-semibold tabular-nums xl:order-none">
                      #{v.numero}
                      <span className="font-normal text-slate-500 xl:hidden"> · {v.donde}</span>
                    </span>
                    <span className="text-right font-semibold tabular-nums xl:hidden">{plata(v.total)}</span>
                    <span className="text-xs text-slate-500 tabular-nums xl:text-sm xl:text-inherit">{fechaHora(v.abiertaEn)}</span>
                    <span className="hidden truncate xl:block">{v.donde}</span>
                    <span className="truncate text-xs text-slate-500 xl:text-sm xl:text-inherit">
                      {v.mozo}
                      <span className="xl:hidden"> · {v.productos} productos</span>
                    </span>
                    <span className="hidden text-right tabular-nums text-slate-500 xl:block" title={v.descuentoMotivo ?? undefined}>
                      {v.descuento > 0 ? `−${plata(v.descuento)}` : "—"}
                    </span>
                    <span className="hidden text-right font-semibold tabular-nums xl:block">{plata(v.total)}</span>
                    <span className="hidden truncate text-xs text-slate-600 xl:block">
                      {v.medios.join(" + ") || "—"}
                      {v.factura && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-emerald-700">
                          <FileCheck2 size={12} aria-hidden />
                          {TIPO_FACTURA[v.factura.tipo] ?? "Fact."} {String(v.factura.puntoVenta).padStart(4, "0")}-{String(v.factura.numero).padStart(8, "0")}
                        </span>
                      )}
                    </span>
                    <span className="col-span-2 xl:col-span-1">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO[v.estado].clase}`} title={v.motivoAnulacion ?? undefined}>
                        {ESTADO[v.estado].texto}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
      {sel && <DetalleVenta key={sel} id={sel} onClose={() => setSel(null)} />}
      </div>
    </div>
  );
}
