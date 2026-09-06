"use client";

import { useEffect, useMemo, useState } from "react";
import PeriodoSelector, { usePeriodo } from "@/components/PeriodoSelector";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Scale,
  Search,
  Store,
} from "lucide-react";
import { Badge, Button, EmptyState, Input, Metrica, PageTitle, Panel, Select, SelectorSegmentado } from "@/components/ui";
import { fechaCorta, fechaLarga, kilos, mesLargo, numero, plata } from "@/lib/formato";

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
  verificado: boolean;
  problemas: string[];
  origen: string | null;
  items: Item[];
};

type ControlRoyalty = {
  compraId: string;
  localId: string;
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

type FormatoHelado = {
  id: string;
  etiqueta: string;
  gramosPorUnidad: number;
  unidades: number;
  kilos: number;
};

type ResumenHelado = {
  compradoKg: number;
  costoComprado: number;
  costoPorKg: number | null;
  vendidoKgEstimado: number;
  balanceKg: number | null;
  ratioVendidoCompradoPct: number | null;
  unidadesConRegla: number;
  unidadesSinRegla: number;
  coberturaPct: number | null;
  formatos: FormatoHelado[];
  sabores: { producto: string; kilos: number; costo: number }[];
  sinRegla: { producto: string; cantidad: number }[];
};

type HeladoAlcance = ResumenHelado & {
  desdeComparacion: string | null;
  hastaComparacion: string | null;
  diasConVentas: number;
};

type HeladoLocal = HeladoAlcance & {
  localId: string;
  local: string;
};

type HeladoTotal = HeladoAlcance & { localesConCompras: number };

type Respuesta = {
  dias: number;
  desde: string;
  hasta: string;
  resumen: { remitos: number; mercaderia: number; servicios: number; sinAsignar: number; conProblemas: number };
  porLocal: {
    localId: string;
    local: string;
    mercaderia: number;
    servicios: number;
    remitos: number;
    conProblemas: number;
  }[];
  controles: ControlRoyalty[];
  locales: { id: string; nombre: string }[];
  helado: {
    reglas: { id: string; etiqueta: string; gramos: number }[];
    total: HeladoTotal;
    porLocal: HeladoLocal[];
  };
  compras: Compra[];
};

type Vista = "resumen" | "helado" | "remitos" | "royalty";

const VISTAS: { clave: Vista; label: string }[] = [
  { clave: "resumen", label: "Resumen" },
  { clave: "helado", label: "Helado" },
  { clave: "remitos", label: "Remitos" },
  { clave: "royalty", label: "Royalty" },
];

const kilosOSinBase = (n: number | null | undefined) => (n == null ? "Sin base" : kilos(n));
const observacionVisible = (texto: string | null) =>
  texto && !/^\s*Subtotal\s*\$/i.test(texto) ? texto : null;

function ComparacionHelado({ resumen }: { resumen: ResumenHelado }) {
  const maximo = Math.max(resumen.compradoKg, resumen.vendidoKgEstimado, 1);
  const filas = [
    { label: "Recibido", valor: resumen.compradoKg, color: "bg-emerald-700 dark:bg-[#37e6b0]" },
    { label: "Vendido estimado", valor: resumen.vendidoKgEstimado, color: "bg-slate-500 dark:bg-[#7f908a]" },
  ];

  return (
    <div className="space-y-4" aria-label="Comparación entre kilos recibidos y vendidos estimados">
      {filas.map((fila) => (
        <div key={fila.label}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="font-medium text-slate-700 dark:text-[#dbe5e0]">{fila.label}</span>
            <span className="font-semibold tabular-nums">{kilos(fila.valor)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-[#18201d]">
            <div className={`h-full rounded-full ${fila.color}`} style={{ width: `${(fila.valor / maximo) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CompraDetalle({
  compra,
  abierto,
  alternar,
}: {
  compra: Compra;
  abierto: boolean;
  alternar: () => void;
}) {
  const observacion = observacionVisible(compra.observaciones);
  return (
    <div>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={alternar}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 dark:hover:bg-[#13201d]"
      >
        {abierto ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-semibold">{compra.numero}</span>
            <span className="text-sm text-slate-500 dark:text-[#94a19c]">{fechaCorta(compra.fecha)}</span>
            <Badge tone={compra.tipo === "SERVICIO" ? "slate" : "emerald"}>
              {compra.tipo === "SERVICIO" ? "Servicio" : "Mercadería"}
            </Badge>
            {!compra.verificado && <Badge tone="amber">Revisar</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-400 dark:text-[#74817b]">
            {compra.items.length} {compra.items.length === 1 ? "línea" : "líneas"}
            {observacion && ` · ${observacion}`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold tabular-nums">{plata(compra.subtotal)}</span>
          {compra.ajustePct != null && (
            <span className="hidden text-xs text-slate-400 sm:block dark:text-[#74817b]">
              lista {plata(compra.sumaLineas)} +{compra.ajustePct}%
            </span>
          )}
        </span>
      </button>

      {abierto && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-[#1c2521] dark:bg-[#0d1614]">
          {compra.problemas.length > 0 && (
            <ul className="mb-3 space-y-1">
              {compra.problemas.map((problema) => (
                <li key={problema} className="text-xs text-amber-700 dark:text-amber-300">
                  {problema}
                </li>
              ))}
            </ul>
          )}

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-[#26312d] dark:text-[#94a19c]">
                  <th className="py-2 pr-3 font-semibold">Cód.</th>
                  <th className="py-2 pr-3 font-semibold">Producto</th>
                  <th className="py-2 pr-3 text-right font-semibold">Cantidad</th>
                  <th className="py-2 pr-3 text-right font-semibold">Unitario</th>
                  <th className="py-2 pr-3 text-right font-semibold">Lista</th>
                  <th className="py-2 text-right font-semibold">Con ajuste</th>
                </tr>
              </thead>
              <tbody>
                {compra.items.map((item) => (
                  <tr key={`${item.codigo}-${item.detalle}`} className="border-b border-slate-100 last:border-0 dark:border-[#1c2521]">
                    <td className="py-2 pr-3 tabular-nums text-slate-400 dark:text-[#74817b]">{item.codigo}</td>
                    <td className="py-2 pr-3">{item.detalle}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {numero(item.cantidad, 2)} <span className="text-xs text-slate-400">{item.unidad.slice(0, 3).toLowerCase()}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{plata(item.precioUnitario)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">{plata(item.total)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{plata(item.totalConAjuste)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-200 md:hidden dark:divide-[#26312d]">
            {compra.items.map((item) => (
              <div key={`${item.codigo}-${item.detalle}`} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{item.detalle}</p>
                  <p className="shrink-0 font-semibold tabular-nums">{plata(item.totalConAjuste)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-[#94a19c]">
                  Cód. {item.codigo} · {numero(item.cantidad, 2)} {item.unidad.toLowerCase()} · {plata(item.precioUnitario)} c/u
                </p>
              </div>
            ))}
          </div>

          {compra.origen && <p className="mt-3 text-xs text-slate-400 dark:text-[#74817b]">Origen: {compra.origen}</p>}
        </div>
      )}
    </div>
  );
}

export default function ComprasClient() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [errorAccion, setErrorAccion] = useState("");
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [localId, setLocalId] = useState("");
  const { valor, setValor, params: periodo, hoy } = usePeriodo("mes");
  const [vista, setVista] = useState<Vista>("resumen");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    const controlador = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change, no data client in this project
    setCargando(true);
    setError("");
    fetch(`/api/compras?${periodo}`, { signal: controlador.signal })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error("No pudimos cargar las compras.");
        return respuesta.json();
      })
      .then((respuesta: Respuesta) => {
        setDatos(respuesta);
        setCargando(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "No pudimos cargar las compras.");
        setCargando(false);
      });
    return () => controlador.abort();
  }, [periodo.toString(), revision]); // eslint-disable-line react-hooks/exhaustive-deps

  async function asignar(compraId: string, destino: string) {
    if (!destino) return;
    setGuardando(compraId);
    setErrorAccion("");
    try {
      const respuesta = await fetch("/api/compras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compraId, localId: destino }),
      });
      if (!respuesta.ok) throw new Error("No pudimos asignar el remito. Volvé a intentarlo.");
      setRevision((actual) => actual + 1);
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : "No pudimos asignar el remito.");
    } finally {
      setGuardando(null);
    }
  }

  const comprasAlcance = useMemo(
    () => datos?.compras.filter((compra) => !localId || compra.localId === localId) ?? [],
    [datos, localId]
  );
  const resumenAlcance = useMemo(
    () => ({
      remitos: comprasAlcance.length,
      mercaderia: comprasAlcance
        .filter((compra) => compra.tipo === "MERCADERIA")
        .reduce((suma, compra) => suma + compra.subtotal, 0),
      servicios: comprasAlcance
        .filter((compra) => compra.tipo === "SERVICIO")
        .reduce((suma, compra) => suma + compra.subtotal, 0),
      conProblemas: comprasAlcance.filter((compra) => !compra.verificado || compra.problemas.length > 0).length,
    }),
    [comprasAlcance]
  );
  const sinAsignar = datos?.compras.filter((compra) => !compra.localId) ?? [];
  const nombreLocal = datos?.locales.find((local) => local.id === localId)?.nombre ?? "Toda la cadena";
  const heladoActual = localId
    ? datos?.helado.porLocal.find((local) => local.localId === localId) ?? null
    : datos?.helado.total ?? null;
  const heladoPorLocal = useMemo(
    () => new Map((datos?.helado.porLocal ?? []).map((local) => [local.localId, local])),
    [datos]
  );
  const controles = datos?.controles.filter((control) => !localId || control.localId === localId) ?? [];
  const comprasBuscadas = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es-AR");
    if (!termino) return comprasAlcance;
    return comprasAlcance.filter((compra) =>
      [compra.numero, compra.cliente, compra.local ?? "", ...compra.items.map((item) => item.detalle)]
        .join(" ")
        .toLocaleLowerCase("es-AR")
        .includes(termino)
    );
  }, [busqueda, comprasAlcance]);
  const gruposRemitos = useMemo(() => {
    const grupos = new Map<string, Compra[]>();
    for (const compra of comprasBuscadas) {
      const nombre = compra.local ?? "Sin asignar";
      const grupo = grupos.get(nombre) ?? [];
      grupo.push(compra);
      grupos.set(nombre, grupo);
    }
    return [...grupos.entries()].sort(([a], [b]) => {
      if (a === "Sin asignar") return 1;
      if (b === "Sin asignar") return -1;
      return a.localeCompare(b, "es-AR");
    });
  }, [comprasBuscadas]);

  if (!datos && cargando) {
    return (
      <div className="space-y-5" aria-label="Cargando compras">
        <div className="h-16 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" />
        <div className="h-28 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" />
        <div className="h-72 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" />
      </div>
    );
  }

  if (!datos || error) {
    return (
      <Panel className="p-6">
        <p className="font-semibold">No pudimos abrir Compras</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-[#94a19c]">{error || "La respuesta llegó vacía."}</p>
        <Button className="mt-4" onClick={() => setRevision((actual) => actual + 1)}>
          <RefreshCw size={16} aria-hidden />
          Reintentar
        </Button>
      </Panel>
    );
  }

  const coberturaTono =
    heladoActual?.coberturaPct == null
      ? "slate"
      : heladoActual.coberturaPct >= 90
        ? "emerald"
        : heladoActual.coberturaPct >= 70
          ? "amber"
          : "rose";

  return (
    <div className="min-w-0 max-w-full space-y-5 overflow-x-clip">
      <PageTitle subtitle="Compras, costos y consumo por sucursal.">
        Compras y consumo
      </PageTitle>

      <Panel className="p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-[#94a19c]">Local</p>
            <Select
              aria-label="Elegir local"
              value={localId}
              onChange={(evento) => setLocalId(evento.target.value)}
              className="md:hidden"
            >
              <option value="">Cadena</option>
              {datos.locales.map((local) => (
                <option key={local.id} value={local.id}>
                  {local.nombre}
                </option>
              ))}
            </Select>
            <div className="scrollbar-hide hidden overflow-x-auto pb-1 md:block">
              <SelectorSegmentado
                label="Elegir local"
                valor={localId}
                onChange={setLocalId}
                opciones={[
                  { clave: "", label: "Cadena" },
                  ...datos.locales.map((local) => ({ clave: local.id, label: local.nombre })),
                ]}
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-[#94a19c]">Período</p>
            <PeriodoSelector valor={valor} onChange={setValor} hoy={hoy} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-[#1c2521] dark:text-[#94a19c]">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-[#dbe5e0]">
            <Store size={14} aria-hidden />
            {nombreLocal}
          </span>
          <span className="tabular-nums">
            {fechaLarga(datos.desde)} a {fechaLarga(datos.hasta)}
            {cargando && " · actualizando"}
          </span>
        </div>
      </Panel>

      {!localId && sinAsignar.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="border-b border-amber-200 px-4 py-3 dark:border-amber-500/30">
            <h2 className="inline-flex items-center gap-2 font-semibold text-amber-950 dark:text-amber-200">
              <AlertTriangle size={16} aria-hidden />
              {sinAsignar.length} {sinAsignar.length === 1 ? "remito necesita local" : "remitos necesitan local"}
            </h2>
            <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300/90">
              Quedan fuera de los totales por sucursal hasta que los asignes.
            </p>
            {errorAccion && <p className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">{errorAccion}</p>}
          </div>
          <div className="divide-y divide-amber-200 dark:divide-amber-500/20">
            {sinAsignar.map((compra) => (
              <div key={compra.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold tabular-nums">
                    {compra.numero} · {fechaCorta(compra.fecha)} · {plata(compra.subtotal)}
                  </p>
                  <p className="truncate text-sm text-amber-900/80 dark:text-amber-200/80">{compra.cliente}</p>
                </div>
                <select
                  aria-label={`Asignar remito ${compra.numero}`}
                  defaultValue=""
                  disabled={guardando === compra.id}
                  onChange={(evento) => asignar(compra.id, evento.target.value)}
                  className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 py-2 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60 dark:border-amber-500/40 dark:bg-[#101c19] dark:focus:ring-[#1d4e48]"
                >
                  <option value="">Asignar a...</option>
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

      <div className="border-b border-slate-200 dark:border-[#29403b]">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" role="tablist" aria-label="Secciones de compras">
          {VISTAS.map((opcion) => (
            <button
              key={opcion.clave}
              id={`compras-tab-${opcion.clave}`}
              type="button"
              role="tab"
              aria-selected={vista === opcion.clave}
              aria-controls={`compras-panel-${opcion.clave}`}
              onClick={() => setVista(opcion.clave)}
              className={`min-h-11 min-w-0 border-b-2 px-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:px-4 sm:text-sm dark:focus-visible:ring-[#37e6b0] ${
                vista === opcion.clave
                  ? "border-emerald-700 text-emerald-800 dark:border-[#37e6b0] dark:text-[#37e6b0]"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"
              }`}
            >
              {opcion.label}
            </button>
          ))}
        </div>
      </div>

      {vista === "resumen" && (
        <div id="compras-panel-resumen" role="tabpanel" aria-labelledby="compras-tab-resumen" className="space-y-5">
          <section className="grid grid-cols-2 divide-x divide-y border-y border-slate-200 xl:grid-cols-4 xl:divide-y-0 dark:border-[#29403b] dark:divide-[#29403b]">
            <Metrica label="Mercadería" valor={plata(resumenAlcance.mercaderia)} nota="insumos y productos" />
            <Metrica label="Servicios" valor={plata(resumenAlcance.servicios)} nota="fuera del food cost" />
            <Metrica label="Remitos" valor={numero(resumenAlcance.remitos, 0)} nota={`${resumenAlcance.conProblemas} para revisar`} />
            <Metrica
              label="Helado recibido"
              valor={kilos(heladoActual?.compradoKg ?? 0)}
              nota={heladoActual?.costoPorKg ? `${plata(heladoActual.costoPorKg)} por kg` : "sin compra en el período"}
            />
          </section>

          {!localId ? (
            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <h2 className="font-semibold">Comparación entre locales</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
                  Mismo período para todas las sucursales; elegí una para abrir su detalle.
                </p>
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[56rem] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-[#1c2521] dark:text-[#94a19c]">
                      <th className="px-4 py-2.5 font-semibold">Local</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Mercadería</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Servicios</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Remitos</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Helado recibido</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Vendido estimado</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.porLocal.map((local) => {
                      const helado = heladoPorLocal.get(local.localId);
                      return (
                        <tr key={local.localId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-[#1c2521] dark:hover:bg-[#13201d]">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setLocalId(local.localId)}
                              className="inline-flex items-center gap-1.5 font-semibold text-slate-900 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-[#f2f7f4] dark:hover:text-[#37e6b0]"
                            >
                              {local.local}
                              <ArrowRight size={14} aria-hidden />
                            </button>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{plata(local.mercaderia)}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">{plata(local.servicios)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{local.remitos}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{kilos(helado?.compradoKg ?? 0)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{helado?.desdeComparacion ? kilos(helado.vendidoKgEstimado) : "Sin base"}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{kilosOSinBase(helado?.balanceKg)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-slate-100 lg:hidden dark:divide-[#1c2521]">
                {datos.porLocal.map((local) => {
                  const helado = heladoPorLocal.get(local.localId);
                  return (
                    <button
                      key={local.localId}
                      type="button"
                      onClick={() => setLocalId(local.localId)}
                      className="block w-full px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 dark:hover:bg-[#13201d]"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{local.local}</span>
                        <ArrowRight size={16} aria-hidden />
                      </span>
                      <span className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-[#94a19c]">
                        <span>Mercadería <strong className="block text-sm font-semibold text-slate-900 dark:text-[#f2f7f4]">{plata(local.mercaderia)}</strong></span>
                        <span>Remitos <strong className="block text-sm font-semibold text-slate-900 dark:text-[#f2f7f4]">{local.remitos}</strong></span>
                        <span>Helado recibido <strong className="block text-sm font-semibold text-slate-900 dark:text-[#f2f7f4]">{kilos(helado?.compradoKg ?? 0)}</strong></span>
                        <span>Balance <strong className="block text-sm font-semibold text-slate-900 dark:text-[#f2f7f4]">{kilosOSinBase(helado?.balanceKg)}</strong></span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          ) : (
            <Panel>
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <div>
                  <h2 className="font-semibold">Compras recientes de {nombreLocal}</h2>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Remitos del período elegido, sin mezclar otras sucursales.</p>
                </div>
                <Button type="button" variant="ghost" onClick={() => setVista("remitos")}>Ver todos los remitos</Button>
              </div>
              {comprasAlcance.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                  {comprasAlcance.slice(0, 5).map((compra) => (
                    <CompraDetalle
                      key={compra.id}
                      compra={compra}
                      abierto={abierto === compra.id}
                      alternar={() => setAbierto(abierto === compra.id ? null : compra.id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState>No hay compras registradas para {nombreLocal} en este período.</EmptyState>
              )}
            </Panel>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Control inicial de helado</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-[#94a19c]">
                    Lo recibido contra los gramos equivalentes vendidos.
                  </p>
                </div>
                <Scale size={20} className="shrink-0 text-emerald-700 dark:text-[#37e6b0]" aria-hidden />
              </div>
              <div className="mt-5">
                <ComparacionHelado resumen={heladoActual ?? datos.helado.total} />
              </div>
              <Button className="mt-5" variant="ghost" onClick={() => setVista("helado")}>
                Ver cálculo y equivalencias
                <ArrowRight size={16} aria-hidden />
              </Button>
            </Panel>

            <Panel className="p-4">
              <h2 className="font-semibold">Calidad de la información</h2>
              <div className="mt-4 divide-y divide-slate-100 dark:divide-[#1c2521]">
                <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                  <span className="text-sm text-slate-600 dark:text-[#c1cbc6]">Remitos verificados</span>
                  <span className="font-semibold tabular-nums">
                    {resumenAlcance.remitos - resumenAlcance.conProblemas} de {resumenAlcance.remitos}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <span className="text-sm text-slate-600 dark:text-[#c1cbc6]">Ventas de helado con equivalencia</span>
                  <span className="font-semibold tabular-nums">
                    {heladoActual?.coberturaPct == null ? "Sin datos" : `${numero(heladoActual.coberturaPct)}%`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
                  <span className="text-sm text-slate-600 dark:text-[#c1cbc6]">
                    {localId ? "Días con ventas cruzadas" : "Remitos sin local"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {localId ? (heladoActual?.diasConVentas ?? 0) : sinAsignar.length}
                  </span>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {vista === "helado" && heladoActual && (
        <div id="compras-panel-helado" role="tabpanel" aria-labelledby="compras-tab-helado" className="space-y-5">
          <section className="grid grid-cols-2 divide-x divide-y border-y border-slate-200 xl:grid-cols-4 xl:divide-y-0 dark:border-[#29403b] dark:divide-[#29403b]">
            <Metrica
              label="Recibido"
              valor={kilos(heladoActual.compradoKg)}
              nota={heladoActual.costoPorKg ? `${plata(heladoActual.costoPorKg)} por kg` : "sin remitos de sabores"}
            />
            <Metrica
              label="Vendido estimado"
              valor={heladoActual.desdeComparacion ? kilos(heladoActual.vendidoKgEstimado) : "Sin base"}
              nota={`${numero(heladoActual.unidadesConRegla, 0)} productos convertidos`}
            />
            <Metrica label="Balance del período" valor={kilosOSinBase(heladoActual.balanceKg)} nota="recibido menos vendido" />
            <Metrica
              label="Cobertura del modelo"
              valor={heladoActual.coberturaPct == null ? "Sin datos" : `${numero(heladoActual.coberturaPct)}%`}
              nota={`${numero(heladoActual.unidadesSinRegla, 0)} ventas sin equivalencia`}
            />
          </section>

          <Panel>
            <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)] lg:p-5">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Kilos que entraron y salieron</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-[#94a19c]">
                      {heladoActual.desdeComparacion && heladoActual.hastaComparacion
                        ? `${nombreLocal} · ${fechaLarga(heladoActual.desdeComparacion)} a ${fechaLarga(heladoActual.hastaComparacion)}`
                        : `${nombreLocal} · sin remitos de helado para cruzar`}
                    </p>
                  </div>
                  <Badge tone={coberturaTono}>{heladoActual.coberturaPct == null ? "Sin cobertura" : `${numero(heladoActual.coberturaPct)}% cubierto`}</Badge>
                </div>
                <div className="mt-6">
                  {heladoActual.desdeComparacion ? (
                    <ComparacionHelado resumen={heladoActual} />
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-[#94a19c]">
                      Hay ventas en Fudo, pero todavía no hay un remito de sabores que defina desde qué fecha compararlas.
                    </p>
                  )}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 dark:border-[#1c2521]">
                <p className="text-sm font-semibold">Cómo leer el balance</p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-[#c1cbc6]">
                  El balance es recibido menos vendido estimado. Todavía no es merma: incluye el stock que había al inicio,
                  el que quedó al cierre y los productos cuya receta aún no tiene gramos definidos.
                </p>
                <p className="mt-3 text-sm font-medium tabular-nums text-slate-900 dark:text-[#f2f7f4]">
                  {heladoActual.ratioVendidoCompradoPct == null
                    ? "Faltan compras para calcular la relación."
                    : `La venta estimada equivale al ${numero(heladoActual.ratioVendidoCompradoPct)}% de lo recibido en ${heladoActual.diasConVentas} días con ventas.`}
                </p>
              </div>
            </div>
          </Panel>

          {!localId && (
            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <h2 className="font-semibold">Balance por local</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                {datos.helado.porLocal.map((local) => (
                  <button
                    key={local.localId}
                    type="button"
                    onClick={() => setLocalId(local.localId)}
                    className="grid min-h-16 w-full gap-2 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 xl:grid-cols-[minmax(10rem,1fr)_repeat(3,minmax(8rem,0.65fr))_auto] xl:items-center dark:hover:bg-[#13201d]"
                  >
                    <span className="font-semibold">{local.local}</span>
                    <span className="text-sm text-slate-500 xl:text-right dark:text-[#94a19c]">Recibido <strong className="ml-1 font-semibold tabular-nums text-slate-900 dark:text-[#f2f7f4]">{kilos(local.compradoKg)}</strong></span>
                    <span className="text-sm text-slate-500 xl:text-right dark:text-[#94a19c]">Vendido <strong className="ml-1 font-semibold tabular-nums text-slate-900 dark:text-[#f2f7f4]">{local.desdeComparacion ? kilos(local.vendidoKgEstimado) : "Sin base"}</strong></span>
                    <span className="text-sm text-slate-500 xl:text-right dark:text-[#94a19c]">Balance <strong className="ml-1 font-semibold tabular-nums text-slate-900 dark:text-[#f2f7f4]">{kilosOSinBase(local.balanceKg)}</strong></span>
                    <ArrowRight size={16} aria-hidden className="hidden xl:block" />
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <h2 className="font-semibold">Venta convertida por formato</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Unidades de Fudo multiplicadas por su peso operativo.</p>
              </div>
              {heladoActual.formatos.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                  {heladoActual.formatos.map((formato) => (
                    <div key={formato.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{formato.etiqueta}</p>
                        <p className="text-xs text-slate-400 dark:text-[#74817b]">{formato.gramosPorUnidad} g por unidad</p>
                      </div>
                      <span className="text-right tabular-nums text-slate-500 dark:text-[#94a19c]">{numero(formato.unidades, 0)} u.</span>
                      <span className="w-20 text-right font-semibold tabular-nums">{kilos(formato.kilos)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>No hay ventas con una equivalencia definida en este período.</EmptyState>
              )}
            </Panel>

            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <h2 className="font-semibold">Equivalencias aplicadas</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Son las reglas usadas en el cálculo anterior.</p>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                {datos.helado.reglas.map((regla) => (
                  <div key={regla.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <span className="text-slate-600 dark:text-[#c1cbc6]">{regla.etiqueta}</span>
                    <span className="font-semibold tabular-nums">{regla.gramos} g</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <h2 className="font-semibold">Sabores recibidos</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Cantidad exacta facturada en los remitos verificados.</p>
              </div>
              {heladoActual.sabores.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                  {heladoActual.sabores.slice(0, 12).map((sabor) => (
                    <div key={sabor.producto} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-3 text-sm">
                      <span className="truncate font-medium">{sabor.producto.replace(/^HELADO DE\s+/i, "")}</span>
                      <span className="w-20 text-right tabular-nums">{kilos(sabor.kilos)}</span>
                      <span className="w-24 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">{plata(sabor.costo)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>No hay remitos verificados con sabores de helado en este período.</EmptyState>
              )}
            </Panel>

            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Productos pendientes de equivalencia</h2>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">Consumen helado, pero todavía no conocemos su receta.</p>
                  </div>
                  <Badge tone={heladoActual.sinRegla.length > 0 ? "amber" : "emerald"}>
                    {heladoActual.sinRegla.length > 0 ? `${heladoActual.sinRegla.length} pendientes` : "Completo"}
                  </Badge>
                </div>
              </div>
              {heladoActual.sinRegla.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                  {heladoActual.sinRegla.slice(0, 12).map((producto) => (
                    <div key={producto.producto} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                      <span className="min-w-0 truncate text-slate-700 dark:text-[#dbe5e0]">{producto.producto}</span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-[#94a19c]">{numero(producto.cantidad, 0)} ventas</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-5 text-sm text-emerald-700 dark:text-[#4ee6b0]">
                  <CheckCircle2 size={17} aria-hidden />
                  Todas las ventas relacionadas tienen una equivalencia.
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {vista === "remitos" && (
        <div id="compras-panel-remitos" role="tabpanel" aria-labelledby="compras-tab-remitos" className="space-y-5">
          <Panel>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
              <div>
                <h2 className="font-semibold">Remitos por local</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
                  {comprasBuscadas.length} resultados · {nombreLocal}
                </p>
              </div>
              <label className="relative block w-full sm:w-72">
                <span className="sr-only">Buscar remito o producto</span>
                <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={busqueda}
                  onChange={(evento) => setBusqueda(evento.target.value)}
                  placeholder="Buscar número o producto"
                  className="pl-9"
                />
              </label>
            </div>
            {gruposRemitos.length > 0 ? (
              <div>
                {gruposRemitos.map(([local, compras], indice) => (
                  <div key={local} className={indice > 0 ? "border-t border-slate-200 dark:border-[#29403b]" : ""}>
                    <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2 dark:bg-[#0d1614]">
                      <h3 className="text-sm font-semibold">{local}</h3>
                      <span className="text-xs tabular-nums text-slate-500 dark:text-[#94a19c]">{compras.length} remitos</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                      {compras.map((compra) => (
                        <CompraDetalle
                          key={compra.id}
                          compra={compra}
                          abierto={abierto === compra.id}
                          alternar={() => setAbierto(abierto === compra.id ? null : compra.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No hay remitos que coincidan con el local, período y búsqueda elegidos.</EmptyState>
            )}
          </Panel>
        </div>
      )}

      {vista === "royalty" && (
        <div id="compras-panel-royalty" role="tabpanel" aria-labelledby="compras-tab-royalty">
          <Panel>
            <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
              <h2 className="font-semibold">Control del royalty</h2>
              <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500 dark:text-[#94a19c]">
                Se compara lo cobrado en el remito con (venta del local ÷ 1,21) × 5%, usando el mes declarado.
              </p>
            </div>
            {controles.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                {controles.map((control) => (
                  <div key={control.compraId} className="px-4 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">
                        {control.local} · {mesLargo(control.mes)}
                        {control.origenMes === "fecha" && <span className="ml-2"><Badge tone="amber">Mes supuesto</Badge></span>}
                      </span>
                      <span className={`font-semibold tabular-nums ${Math.abs(control.diferenciaPct) < 0.5 ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"}`}>
                        {control.diferencia >= 0 ? "+" : ""}{plata(control.diferencia)} · {control.diferenciaPct >= 0 ? "+" : ""}{control.diferenciaPct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2 text-sm text-slate-500 sm:grid-cols-4 dark:text-[#94a19c]">
                      <span>Venta <strong className="block font-semibold tabular-nums text-slate-900 dark:text-[#f2f7f4]">{plata(control.ventaConIva)}</strong></span>
                      <span>Neta <strong className="block font-semibold tabular-nums text-slate-900 dark:text-[#f2f7f4]">{plata(control.ventaNeta)}</strong></span>
                      <span>Corresponde <strong className="block font-semibold tabular-nums text-slate-900 dark:text-[#f2f7f4]">{plata(control.esperado)}</strong></span>
                      <span>Cobrado <strong className="block font-semibold tabular-nums text-slate-900 dark:text-[#f2f7f4]">{plata(control.cobrado)}</strong></span>
                    </div>
                    {!control.completo && (
                      <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                        Hay {control.diasConDatos} de {control.diasDelMes} días sincronizados; la diferencia todavía no es concluyente.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No hay remitos de royalty con ventas sincronizadas para este local y período.</EmptyState>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
