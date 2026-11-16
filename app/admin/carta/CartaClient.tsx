"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, TrendingUp } from "lucide-react";
import PeriodoSelector, { usePeriodo } from "@/components/PeriodoSelector";
import { BarraContexto, SelectorLocal } from "@/components/BarraContexto";
import { Badge, Input, Metrica, PageTitle, Panel, PanelHeader, SelectorSegmentado } from "@/components/ui";
import { fechaCorta, fechaLarga, numero, plata, porcentaje } from "@/lib/formato";

type Componente = { nombre: string; cantidad: number; unidad: string; costo: number };
type Producto = {
  producto: string;
  cantidad: number;
  venta: number;
  precio: number;
  costo: number | null;
  margenPct: number | null;
  fuente: "receta" | "proveedor" | "fudo" | null;
  receta: string | null;
  supuesto: string | null;
  faltan: string[];
  componentes: Componente[];
};
type Suba = {
  detalle: string;
  insumo: string | null;
  anterior: number;
  precio: number;
  subaPct: number;
  desde: string;
  afecta: string[];
  ventaAfectada: number;
};
type Respuesta = {
  desde: string;
  hasta: string;
  dias: number;
  locales: { id: string; nombre: string }[];
  resumen: { venta: number; ventaCosteada: number; costo: number; costoPct: number | null; cobertura: number };
  productos: Producto[];
  subas: Suba[];
};

type Filtro = "todos" | "caros" | "sin";
/** Desde acá el costo se come demasiado del precio: se marca para revisar. */
const COSTO_ALTO = 40;
const COSTO_CRITICO = 55;
const PRIMEROS = 60;

const costoPct = (p: Producto) => (p.costo != null ? (p.costo / p.precio) * 100 : null);

function tonoCosto(pct: number | null) {
  if (pct == null) return "text-slate-500";
  if (pct >= COSTO_CRITICO) return "text-rose-600";
  if (pct >= COSTO_ALTO) return "text-amber-700";
  return "text-emerald-700";
}

function cantidadInsumo(c: Componente) {
  if (c.unidad === "g" || c.unidad === "ml") return `${numero(c.cantidad, c.cantidad < 10 ? 1 : 0)} ${c.unidad}`;
  return `${numero(c.cantidad, 2)} u`;
}

const ETIQUETA_FUENTE = { receta: null, proveedor: "se revende", fudo: "costo de Fudo" } as const;

export default function CartaClient() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const { valor, setValor, params: periodo, hoy } = usePeriodo();
  const [localId, setLocalId] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controlador = new AbortController();
    const params = new URLSearchParams(periodo);
    if (localId) params.set("localId", localId);
    fetch(`/api/carta?${params}`, { signal: controlador.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fallo"))))
      .then((d: Respuesta) => {
        setDatos(d);
        setError("");
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError("No pudimos calcular la carta.");
      });
    return () => controlador.abort();
  }, [periodo.toString(), localId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return datos.productos.filter((p) => {
      if (q && !p.producto.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)) return false;
      if (filtro === "caros") return (costoPct(p) ?? 0) >= COSTO_ALTO;
      if (filtro === "sin") return p.costo == null;
      return true;
    });
  }, [datos, filtro, busqueda]);

  if (error) return <p className="text-sm text-slate-500">{error}</p>;
  if (!datos) return <div className="h-64 animate-pulse rounded-lg bg-slate-200/70" aria-label="Calculando la carta" />;

  const { resumen } = datos;
  const caros = datos.productos.filter((p) => (costoPct(p) ?? 0) >= COSTO_ALTO).length;
  const sinCosto = datos.productos.filter((p) => p.costo == null).length;
  const lista = todos || busqueda ? visibles : visibles.slice(0, PRIMEROS);

  return (
    <div className="space-y-5">
      <PageTitle subtitle="Cuánto cuesta cada producto con los precios de la última compra, y cuánto deja">Carta</PageTitle>

      <BarraContexto
        campos={[{ etiqueta: "Local", contenido: <SelectorLocal locales={datos.locales} valor={localId} onChange={setLocalId} /> }]}
        derecha={{ etiqueta: "Período", contenido: <PeriodoSelector valor={valor} onChange={setValor} hoy={hoy} rango={datos} /> }}
        pie={{
          alcance: datos.locales.find((l) => l.id === localId)?.nombre ?? "Toda la cadena",
          detalle: `${fechaLarga(datos.desde)} a ${fechaLarga(datos.hasta)} · todo sin IVA`,
        }}
      />

      <Panel>
        <div className="grid grid-cols-2 divide-slate-100 px-4 md:grid-cols-4 md:divide-x">
          <Metrica label="Venta sin IVA" valor={plata(resumen.venta)} nota={`${numero(datos.productos.length)} productos`} />
          <Metrica label="Costo de lo vendido" valor={plata(resumen.costo)} nota="de lo que tiene costo" />
          <Metrica
            label="Costo sobre venta"
            valor={porcentaje(resumen.costoPct)}
            tono={resumen.costoPct != null && resumen.costoPct >= COSTO_ALTO ? "advertencia" : "normal"}
            nota={resumen.costoPct != null ? `quedan ${plata(resumen.ventaCosteada - resumen.costo)}` : undefined}
          />
          <Metrica
            label="Venta con costo"
            valor={porcentaje(resumen.cobertura, { decimales: 0 })}
            tono={resumen.cobertura < 80 ? "advertencia" : "normal"}
            nota={sinCosto ? `${sinCosto} productos sin costo` : "toda la venta"}
          />
        </div>
      </Panel>

      {datos.subas.length > 0 && (
        <Panel>
          <PanelHeader
            titulo={
              <span className="inline-flex items-center gap-2">
                <TrendingUp size={16} className="text-amber-700" aria-hidden />
                Subió el costo de {datos.subas.length === 1 ? "1 insumo" : `${datos.subas.length} insumos`}
              </span>
            }
            descripcion="Precio de la última compra contra el anterior, en los últimos 60 días. Si el precio de carta no se movió, el margen bajó."
          />
          <ul className="divide-y divide-slate-100">
            {datos.subas.slice(0, 8).map((s) => (
              <li key={s.detalle} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="font-medium">{s.insumo ?? s.detalle}</p>
                  <p className="text-sm text-slate-500">
                    Le pega a {s.afecta.join(", ")}
                    {s.afecta.length === 3 ? " y más" : ""}
                  </p>
                </div>
                <div className="text-sm tabular-nums sm:text-right">
                  <span className="font-semibold text-amber-700">{porcentaje(s.subaPct, { signo: true })}</span>
                  <span className="text-slate-500">
                    {" "}
                    · {plata(s.anterior)} → {plata(s.precio)} desde el {fechaCorta(s.desde)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          titulo="Producto por producto"
          descripcion="Tocá uno para ver de qué está hecho. Las cantidades marcadas como supuesto son a ojo: si alguna no es así, se corrige y el costo se recalcula."
        />
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <label className="relative min-w-[12rem] flex-1">
            <span className="sr-only">Buscar producto</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto" className="pl-9" />
          </label>
          <SelectorSegmentado
            label="Filtrar productos"
            valor={filtro}
            onChange={setFiltro}
            opciones={[
              { clave: "todos", label: "Todos" },
              { clave: "caros", label: `Costo alto (${caros})` },
              { clave: "sin", label: `Sin costo (${sinCosto})` },
            ]}
          />
        </div>

        <div
          className="hidden grid-cols-[minmax(0,1fr)_5rem_6.5rem_6.5rem_5rem_8rem] gap-x-3 border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-500 md:grid"
          aria-hidden
        >
          <span>Producto</span>
          <span className="text-right">Vendidos</span>
          <span className="text-right">Precio</span>
          <span className="text-right">Costo</span>
          <span className="text-right">Costo %</span>
          <span className="text-right">Deja en total</span>
        </div>

        {lista.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Ningún producto coincide.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lista.map((p) => {
              const pct = costoPct(p);
              const esteAbierto = abierto === p.producto;
              const fuente = p.fuente ? ETIQUETA_FUENTE[p.fuente] : null;
              return (
                <li key={p.producto}>
                  <button
                    type="button"
                    aria-expanded={esteAbierto}
                    onClick={() => setAbierto(esteAbierto ? null : p.producto)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-950 md:grid-cols-[minmax(0,1fr)_5rem_6.5rem_6.5rem_5rem_8rem]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {esteAbierto ? (
                        <ChevronDown size={15} className="shrink-0 text-slate-500" aria-hidden />
                      ) : (
                        <ChevronRight size={15} className="shrink-0 text-slate-500" aria-hidden />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.producto}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 md:hidden">
                          {numero(p.cantidad)} vendidos · {plata(p.precio)} · costo {p.costo != null ? plata(p.costo) : "—"}
                        </span>
                      </span>
                      {p.supuesto && <Badge tone="amber">supuesto</Badge>}
                      {p.faltan.length > 0 && <Badge tone="rose">incompleto</Badge>}
                      {fuente && <Badge tone="slate">{fuente}</Badge>}
                    </span>
                    <span className="hidden text-right tabular-nums md:block">{numero(p.cantidad)}</span>
                    <span className="hidden text-right tabular-nums md:block">{plata(p.precio)}</span>
                    <span className="hidden text-right tabular-nums md:block">{p.costo != null ? plata(p.costo) : "—"}</span>
                    <span className={`text-right font-semibold tabular-nums ${tonoCosto(pct)}`}>{porcentaje(pct, { decimales: 0 })}</span>
                    <span className="hidden text-right tabular-nums md:block">
                      {p.costo != null ? plata((p.precio - p.costo) * p.cantidad) : "—"}
                    </span>
                  </button>

                  {esteAbierto && (
                    <div className="bg-slate-50 px-4 pb-4 pt-2 text-sm md:pl-11">
                      {p.costo == null && p.faltan.length === 0 ? (
                        <p className="text-slate-600">
                          Todavía no tiene receta ni costo cargado.
                        </p>
                      ) : (
                        <>
                          <p className="font-medium">{p.receta}</p>
                          {p.supuesto && <p className="mt-0.5 text-amber-800">Supuesto: {p.supuesto}.</p>}
                          {p.faltan.length > 0 && (
                            <p className="mt-0.5 text-rose-700">
                              Sin precio de compra: {p.faltan.join(", ")}. El costo de arriba no lo incluye.
                            </p>
                          )}
                          {p.componentes.length > 0 && (
                            <dl className="mt-2 grid max-w-md grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-1">
                              {p.componentes.map((c) => (
                                <div key={c.nombre} className="contents">
                                  <dt className="truncate text-slate-600">{c.nombre}</dt>
                                  <dd className="text-right tabular-nums text-slate-500">{cantidadInsumo(c)}</dd>
                                  <dd className="text-right tabular-nums">{plata(c.costo)}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                          {p.fuente === "fudo" && (
                            <p className="mt-1 text-slate-500">
                              El costo que alguien cargó en Fudo; puede estar viejo.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!todos && !busqueda && visibles.length > PRIMEROS && (
          <div className="border-t border-slate-100 px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => setTodos(true)}
              className="text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline"
            >
              Ver los {visibles.length} productos
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}
