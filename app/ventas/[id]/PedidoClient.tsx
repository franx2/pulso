"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChefHat,
  Minus,
  Percent,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Star,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Button, ErrorText, Input, Label, Modal, Panel, Select, SelectorSegmentado, Textarea } from "@/components/ui";
import { plata } from "@/lib/formato";
import { montoDescuento, saldoDeVenta, totalDeLinea, totalesDeVenta } from "@/lib/ventas/calculos";
import type { VentaCompleta } from "@/lib/ventas/consultas";
import { aNumero, ETIQUETA_MOTIVO, imprimir, tiempoDesde } from "../comun";
import { COLOR_CAT } from "../graficos";

type Item = VentaCompleta["items"][number];
type Categoria = { id: string; nombre: string; padreId: string | null };
type Producto = { id: string; nombre: string; precio: number; categoriaId: string; favorito: boolean; codigo: string | null; cocinaId: string | null };
type Cocina = { id: string; nombre: string };
type Plantilla = { id: string; nombre: string; porcentaje: number | null; monto: number | null; tope: number | null; activo: boolean };
type Medio = { id: string; nombre: string; tipo: string };
type Datos = {
  venta: VentaCompleta;
  mozos: { id: string; nombre: string }[];
  mesasLibres: { id: string; numero: number; salon: string }[];
  permisos: Record<string, boolean>;
};

const FAVORITOS = "__favoritos";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

async function pedir(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar");
  return data;
}

export default function PedidoClient({ id }: { id: string }) {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [carta, setCarta] = useState<{ categorias: Categoria[]; productos: Producto[]; medios: Medio[]; cocinas: Cocina[] } | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"carta" | "pedido">("carta");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [modal, setModal] = useState<
    | { tipo: "cobrar" }
    | { tipo: "anular"; item: Item }
    | { tipo: "comentario"; item: Item }
    | { tipo: "opciones" }
    | { tipo: "descuento"; item?: Item }
    | { tipo: "cerrada"; vuelto: number; factura: string | null }
    | null
  >(null);

  const cargar = useCallback(async () => {
    const data: Datos = await pedir(`/api/ventas/${id}`, "GET");
    setDatos(data);
    return data;
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, sin librería de datos
    cargar()
      .then((d) => {
        pedir(`/api/ventas/descuentos?localId=${d.venta.local.id}`, "GET")
          .then((r) => setPlantillas(r.descuentos.filter((x: Plantilla) => x.activo)))
          .catch(() => undefined);
        return pedir(`/api/ventas/carta?localId=${d.venta.local.id}`, "GET");
      })
      .then((c) => {
        setCarta(c);
        const hayFavoritos = c.productos.some((p: Producto) => p.favorito);
        setCategoria(hayFavoritos ? FAVORITOS : (c.categorias.find((x: Categoria) => !x.padreId)?.id ?? ""));
      })
      .catch((e: Error) => setError(e.message));
  }, [cargar]);

  /** Corre una acción contra la API, recarga la venta y muestra el error si falla. */
  async function hacer(accion: () => Promise<unknown>, mensaje?: string) {
    setOcupado(true);
    setError("");
    try {
      await accion();
      await cargar();
      if (mensaje) setAviso(mensaje);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const venta = datos?.venta;
  const permisos = datos?.permisos ?? {};
  const abierta = venta?.estado === "EN_CURSO";
  const sinEnviar = useMemo(() => venta?.items.filter((i) => !i.anulado && !i.enviadoEn) ?? [], [venta]);
  const enCocina = useMemo(() => venta?.items.filter((i) => !i.anulado && i.enviadoEn) ?? [], [venta]);
  const anulados = useMemo(() => venta?.items.filter((i) => i.anulado) ?? [], [venta]);
  const cantidadEnPedido = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of sinEnviar) if (i.productoId) m.set(i.productoId, (m.get(i.productoId) ?? 0) + i.cantidad);
    return m;
  }, [sinEnviar]);

  const raices = carta?.categorias.filter((c) => !c.padreId) ?? [];
  const hijasDe = (id: string) => carta?.categorias.filter((c) => c.padreId === id) ?? [];
  const raizActiva = carta?.categorias.find((c) => c.id === categoria)?.padreId ?? categoria;
  const productos = useMemo(() => {
    if (!carta) return [];
    if (busqueda.trim()) {
      const q = sinAcentos(busqueda.trim());
      return carta.productos.filter((p) => sinAcentos(p.nombre).includes(q) || p.codigo === busqueda.trim()).slice(0, 60);
    }
    if (categoria === FAVORITOS) return carta.productos.filter((p) => p.favorito);
    const ids = new Set([categoria, ...carta.categorias.filter((c) => c.padreId === categoria).map((c) => c.id)]);
    return carta.productos.filter((p) => ids.has(p.categoriaId));
  }, [carta, categoria, busqueda]);

  async function agregar(p: Producto) {
    if (!abierta) return;
    // Se ve al instante; el servidor suma en el mismo renglón y la recarga
    // posterior deja la venta exacta.
    setDatos((d) => {
      if (!d) return d;
      const items = [...d.venta.items];
      const k = items.findIndex((i) => i.productoId === p.id && !i.enviadoEn && !i.anulado && !i.comentario);
      if (k >= 0) items[k] = { ...items[k], cantidad: items[k].cantidad + 1 };
      else
        items.push({
          id: `nuevo-${Date.now()}`,
          productoId: p.id,
          nombre: p.nombre,
          precio: p.precio,
          cantidad: 1,
          comentario: null,
          cocina: null,
          creadoPor: "",
          createdAt: new Date().toISOString(),
          enviadoEn: null,
          anulado: false,
          motivoAnulacion: null,
          comentarioAnulacion: null,
          descuentoPct: null,
          descuentoMonto: 0,
          descuentoNombre: null,
        });
      const t = totalesDeVenta(items, { pct: d.venta.descuentoPct, monto: d.venta.descuentoMonto });
      return { ...d, venta: { ...d.venta, items, ...t, ...saldoDeVenta(t.total, d.venta.pagos) } };
    });
    setAviso(`+1 ${p.nombre}`);
    try {
      await pedir(`/api/ventas/${id}/items`, "POST", { productoId: p.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
    await cargar().catch(() => undefined);
  }

  async function cambiarCantidad(i: Item, delta: number) {
    const nueva = i.cantidad + delta;
    await hacer(() =>
      nueva <= 0 ? pedir(`/api/ventas/${id}/items/${i.id}`, "DELETE") : pedir(`/api/ventas/${id}/items/${i.id}`, "PATCH", { cantidad: nueva })
    );
  }

  async function enviar() {
    let enviadoEn = "";
    const ok = await hacer(async () => {
      const r = await pedir(`/api/ventas/${id}/enviar`, "POST");
      enviadoEn = r.enviadoEn;
    }, "Comanda enviada a cocina");
    if (ok && enviadoEn) imprimir(`/ventas/${id}/imprimir?tipo=comanda&enviadoEn=${encodeURIComponent(enviadoEn)}`);
  }

  if (error && !datos) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorText>{error}</ErrorText>
        <Link href="/ventas" className="font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-[#4ee6b0]">
          Volver al salón
        </Link>
      </div>
    );
  }
  if (!venta || !carta) return <div className="h-96 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Cargando el pedido" />;

  const titulo = venta.mesa ? `Mesa ${venta.mesa.numero}` : venta.cliente ? `Mostrador · ${venta.cliente}` : "Mostrador";
  const puedeDescontar = Boolean(permisos.apply_discounts || permisos.create_discounts);
  // El color de cada cocina sale de su lugar fijo en la lista del local.
  const colorCocina = (cocinaId: string | null | undefined) => {
    const k = carta.cocinas.findIndex((c) => c.id === cocinaId);
    return k >= 0 ? COLOR_CAT(k) : "#94a3b8";
  };

  const panelCarta = (
    <Panel className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-3 dark:border-[#1c2521]">
        <label className="relative block">
          <span className="sr-only">Buscar producto</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en la carta" className="pl-9" />
        </label>
        {!busqueda && (
          <div className="scrollbar-hidden -mx-3 flex gap-1.5 overflow-x-auto px-3">
            {carta.productos.some((p) => p.favorito) && (
              <Chip activo={categoria === FAVORITOS} onClick={() => setCategoria(FAVORITOS)}>
                <Star size={13} aria-hidden />
                Favoritos
              </Chip>
            )}
            {raices.map((c) => (
              <Chip key={c.id} activo={raizActiva === c.id} onClick={() => setCategoria(c.id)}>
                {c.nombre.replace(/^\d+\.\s*/, "")}
              </Chip>
            ))}
          </div>
        )}
        {!busqueda && raizActiva && raizActiva !== FAVORITOS && hijasDe(raizActiva).length > 0 && (
          <div className="scrollbar-hidden -mx-3 flex gap-1.5 overflow-x-auto px-3">
            <Chip chico activo={categoria === raizActiva} onClick={() => setCategoria(raizActiva)}>
              Todo
            </Chip>
            {hijasDe(raizActiva).map((c) => (
              <Chip chico key={c.id} activo={categoria === c.id} onClick={() => setCategoria(c.id)}>
                {c.nombre}
              </Chip>
            ))}
          </div>
        )}
      </div>
      {carta.cocinas.length > 1 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-[#1c2521] dark:text-[#94a19c]">
          <span className="font-medium">Va a:</span>
          {carta.cocinas.map((c, k) => (
            <span key={c.id} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: COLOR_CAT(k) }} aria-hidden />
              {c.nombre}
            </span>
          ))}
        </p>
      )}
      {productos.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-[#94a19c]">{busqueda ? "No hay productos con ese nombre." : "Sin productos en esta categoría."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 2xl:grid-cols-4">
          {productos.map((p) => {
            const cuantos = cantidadEnPedido.get(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => agregar(p)}
                disabled={!abierta || !permisos.create_additions}
                className="relative flex min-h-[4.5rem] flex-col justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-left transition-[transform,border-color,background-color] duration-100 ease-out hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 active:scale-[0.97] disabled:opacity-50 dark:border-[#29403b] dark:bg-[#101c19] dark:hover:bg-[#172724]"
              >
                <span className="line-clamp-2 text-sm font-medium leading-snug">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorCocina(p.cocinaId) }} aria-hidden />
                  {p.nombre}
                </span>
                <span className="mt-1 text-sm font-semibold tabular-nums text-slate-600 dark:text-[#c1cbc6]">{plata(p.precio)}</span>
                {cuantos && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[0.6875rem] font-bold text-[#241703]">
                    {cuantos}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );

  const panelPedido = (
    <Panel className="flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-[#94a19c]">
            #{venta.numero} · {venta.mesa?.salon ?? "Mostrador"} · hace {tiempoDesde(venta.abiertaEn)}
          </p>
          <p className="truncate text-sm text-slate-600 dark:text-[#c1cbc6]">
            {[venta.comensales && `${venta.comensales} comensales`, venta.mozo && `Mozo: ${venta.mozo.nombre}`].filter(Boolean).join(" · ") ||
              `Abrió ${venta.abiertaPor}`}
          </p>
          {venta.comentario && <p className="mt-0.5 text-xs italic text-slate-500 dark:text-[#94a19c]">“{venta.comentario}”</p>}
        </div>
        {abierta && (
          <Button variant="ghost" onClick={() => setModal({ tipo: "opciones" })} aria-label="Opciones de la venta" className="px-3">
            <MoreHorizontal size={18} aria-hidden />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {venta.items.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-[#94a19c]">Tocá productos de la carta para cargarlos.</p>
        )}
        {sinEnviar.length > 0 && (
          <Grupo titulo="Sin enviar a cocina" tono="ambar">
            {sinEnviar.map((i) => (
              <li key={i.id} className="flex items-start gap-2 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{i.nombre}</p>
                  {i.comentario && <p className="text-xs italic text-slate-500 dark:text-[#94a19c]">{i.comentario}</p>}
                  <div className="mt-1.5 flex items-center gap-1">
                    <Paso onClick={() => cambiarCantidad(i, -1)} disabled={ocupado} etiqueta={i.cantidad === 1 ? `Sacar ${i.nombre}` : `Uno menos de ${i.nombre}`}>
                      {i.cantidad === 1 ? <Trash2 size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
                    </Paso>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{i.cantidad}</span>
                    <Paso onClick={() => cambiarCantidad(i, 1)} disabled={ocupado} etiqueta={`Uno más de ${i.nombre}`}>
                      <Plus size={14} aria-hidden />
                    </Paso>
                    <Paso onClick={() => setModal({ tipo: "comentario", item: i })} etiqueta={`Comentario para ${i.nombre}`}>
                      <MessageSquare size={14} aria-hidden />
                    </Paso>
                    {puedeDescontar && (
                      <Paso onClick={() => setModal({ tipo: "descuento", item: i })} etiqueta={`Descuento para ${i.nombre}`}>
                        <Percent size={14} aria-hidden />
                      </Paso>
                    )}
                  </div>
                  <DescuentoDeLinea item={i} />
                </div>
                <PrecioDeLinea item={i} />
              </li>
            ))}
          </Grupo>
        )}
        {enCocina.length > 0 && (
          <Grupo titulo="En cocina">
            {enCocina.map((i) => (
              <li key={i.id} className="flex items-start gap-2 px-4 py-2">
                <span className="w-7 pt-0.5 text-sm font-semibold tabular-nums text-slate-500 dark:text-[#94a19c]">{i.cantidad}×</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{i.nombre}</p>
                  <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#94a19c]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorCocina(i.cocina?.id) }} aria-hidden />
                    {i.cocina?.nombre ?? "Sin cocina"} · {hora(i.enviadoEn!)}
                    {i.comentario && ` · ${i.comentario}`}
                  </p>
                  <DescuentoDeLinea item={i} />
                </div>
                <PrecioDeLinea item={i} />
                {abierta && puedeDescontar && (
                  <button
                    type="button"
                    onClick={() => setModal({ tipo: "descuento", item: i })}
                    aria-label={`Descuento para ${i.nombre}`}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:hover:bg-[#1d1830] dark:hover:text-violet-300"
                  >
                    <Percent size={15} aria-hidden />
                  </button>
                )}
                {abierta && (
                  <button
                    type="button"
                    onClick={() => setModal({ tipo: "anular", item: i })}
                    aria-label={`Anular ${i.nombre}`}
                    className="-mr-2 flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:hover:bg-[#241419] dark:hover:text-rose-300"
                  >
                    <Ban size={15} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </Grupo>
        )}
        {anulados.length > 0 && (
          <Grupo titulo={`Anulados (${anulados.length})`}>
            {anulados.map((i) => (
              <li key={i.id} className="flex items-start gap-2 px-4 py-1.5 text-sm text-slate-400 dark:text-[#5f6d67]">
                <span className="w-7 tabular-nums">{i.cantidad}×</span>
                <span className="min-w-0 flex-1 line-through">{i.nombre}</span>
                <span className="text-xs">{ETIQUETA_MOTIVO[i.motivoAnulacion ?? ""] ?? ""}</span>
              </li>
            ))}
          </Grupo>
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-3 dark:border-[#29403b]">
        <dl className="grid grid-cols-[1fr_auto] gap-y-0.5 text-sm">
          {(venta.descuento > 0 || venta.descuentoItems > 0) && (
            <>
              <dt className="text-slate-500 dark:text-[#94a19c]">Subtotal</dt>
              <dd className="text-right tabular-nums">{plata(venta.bruto)}</dd>
            </>
          )}
          {venta.descuentoItems > 0 && (
            <>
              <dt className="text-violet-700 dark:text-violet-300">Descuentos en productos</dt>
              <dd className="text-right tabular-nums text-violet-700 dark:text-violet-300">−{plata(venta.descuentoItems)}</dd>
            </>
          )}
          {venta.descuento > 0 && (
            <>
              <dt className="text-violet-700 dark:text-violet-300">
                {venta.descuentoMotivo ?? "Descuento"}
                {venta.descuentoPct ? ` ${venta.descuentoPct}%` : ""}
              </dt>
              <dd className="text-right tabular-nums text-violet-700 dark:text-violet-300">−{plata(venta.descuento)}</dd>
            </>
          )}
          <dt className="pt-1 text-base font-semibold">Total</dt>
          <dd className="pt-1 text-right text-2xl font-bold tabular-nums">{plata(venta.total)}</dd>
          {venta.pagado > 0 && (
            <>
              <dt className="text-slate-500 dark:text-[#94a19c]">Cobrado</dt>
              <dd className="text-right tabular-nums">{plata(venta.pagado)}</dd>
              <dt className="font-medium">Falta</dt>
              <dd className="text-right font-semibold tabular-nums">{plata(venta.falta)}</dd>
            </>
          )}
        </dl>

        {abierta && puedeDescontar && venta.items.length > 0 && (
          <button
            type="button"
            onClick={() => setModal({ tipo: "descuento" })}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
          >
            <Percent size={14} aria-hidden />
            {venta.descuento > 0 ? "Cambiar el descuento de la venta" : "Descuento a toda la venta"}
          </button>
        )}

        {abierta ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {sinEnviar.length > 0 ? (
              <Button className="col-span-2" onClick={enviar} disabled={ocupado}>
                <ChefHat size={16} aria-hidden />
                Enviar a cocina ({sinEnviar.reduce((s, i) => s + i.cantidad, 0)})
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => imprimir(`/ventas/${id}/imprimir?tipo=precuenta`)}
              disabled={!permisos.print_control || venta.items.length === 0}
            >
              <Printer size={16} aria-hidden />
              Precuenta
            </Button>
            <Button
              variant={sinEnviar.length > 0 ? "ghost" : "primary"}
              onClick={() => setModal({ tipo: "cobrar" })}
              disabled={!permisos.create_payments || venta.total <= 0}
            >
              <Wallet size={16} aria-hidden />
              Cobrar
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-[#172724] dark:text-[#c1cbc6]">
              {venta.estado === "CERRADA" ? `Venta cerrada a las ${hora(venta.cerradaEn!)}` : `Venta anulada: ${venta.motivoAnulacion ?? ""}`}
            </p>
            {venta.estado === "CERRADA" && (
              <Button variant="ghost" onClick={() => imprimir(`/ventas/${id}/imprimir?tipo=ticket`)}>
                <Printer size={16} aria-hidden />
                Imprimir ticket
              </Button>
            )}
          </div>
        )}
      </div>
    </Panel>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/ventas"
            aria-label="Volver al salón"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#c1cbc6]"
          >
            <ArrowLeft size={18} aria-hidden />
          </Link>
          <h1 className="truncate text-xl font-bold md:text-2xl">{titulo}</h1>
        </div>
        <div className="lg:hidden">
          <SelectorSegmentado
            label="Ver"
            valor={vista}
            onChange={setVista}
            opciones={[
              { clave: "carta", label: "Carta" },
              { clave: "pedido", label: `Pedido · ${plata(venta.total)}` },
            ]}
          />
        </div>
      </div>

      <div aria-live="polite" className="min-h-0">
        <ErrorText>{error}</ErrorText>
        {aviso && !error && (
          <p key={aviso + venta.items.length} className="text-sm font-medium text-emerald-700 motion-safe:animate-[aparecer_180ms_ease-out] dark:text-[#4ee6b0]">
            {aviso}
          </p>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className={vista === "carta" ? "" : "hidden lg:block"}>{panelCarta}</div>
        <div className={`lg:sticky lg:top-20 ${vista === "pedido" ? "" : "hidden lg:block"}`}>{panelPedido}</div>
      </div>

      {modal?.tipo === "cobrar" && (
        <ModalCobrar
          venta={venta}
          medios={carta.medios}
          permisos={permisos}
          onClose={() => setModal(null)}
          onCobrado={async (r) => {
            await cargar();
            setModal(r.cerrada ? { tipo: "cerrada", vuelto: r.vuelto, factura: r.factura } : null);
            if (!r.cerrada) setAviso("Pago registrado");
          }}
        />
      )}
      {modal?.tipo === "cerrada" && (
        <Modal title="Venta cerrada" onClose={() => router.push("/ventas")} maxWidth="max-w-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={40} className="text-emerald-600 dark:text-[#37e6b0]" aria-hidden />
            <p className="text-lg font-semibold">{plata(venta.total)} cobrados</p>
            {modal.vuelto > 0 && <p className="text-2xl font-bold tabular-nums">Vuelto: {plata(modal.vuelto)}</p>}
            {modal.factura && <p className="text-sm text-slate-600 dark:text-[#c1cbc6]">{modal.factura}</p>}
            <div className="mt-2 grid w-full grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => imprimir(`/ventas/${id}/imprimir?tipo=ticket`)}>
                <Printer size={16} aria-hidden />
                Ticket
              </Button>
              <Button onClick={() => router.push("/ventas")}>Volver al salón</Button>
            </div>
          </div>
        </Modal>
      )}
      {modal?.tipo === "anular" && (
        <ModalAnularItem
          item={modal.item}
          permitido={Boolean(permisos.cancel_additions)}
          onClose={() => setModal(null)}
          onAnular={async (motivo, comentario) => {
            const ok = await hacer(() => pedir(`/api/ventas/${id}/items/${modal.item.id}`, "PATCH", { anular: { motivo, comentario } }), "Producto anulado");
            if (ok) setModal(null);
          }}
        />
      )}
      {modal?.tipo === "descuento" && (
        <ModalDescuento
          item={modal.item}
          plantillas={plantillas}
          libre={Boolean(permisos.create_discounts)}
          deLista={Boolean(permisos.apply_discounts)}
          base={modal.item ? modal.item.precio * modal.item.cantidad : venta.subtotal}
          actual={
            modal.item
              ? modal.item.descuentoNombre
              : venta.descuento > 0
                ? (venta.descuentoMotivo ?? "Descuento")
                : null
          }
          onClose={() => setModal(null)}
          onAplicar={async (descuento, mensaje) => {
            const ok = await hacer(
              () =>
                modal.item
                  ? pedir(`/api/ventas/${id}/items/${modal.item.id}`, "PATCH", { descuento })
                  : pedir(`/api/ventas/${id}`, "PATCH", { descuento }),
              mensaje
            );
            if (ok) setModal(null);
          }}
        />
      )}
      {modal?.tipo === "comentario" && (
        <ModalComentario
          item={modal.item}
          onClose={() => setModal(null)}
          onGuardar={async (comentario) => {
            const ok = await hacer(() => pedir(`/api/ventas/${id}/items/${modal.item.id}`, "PATCH", { comentario }));
            if (ok) setModal(null);
          }}
        />
      )}
      {modal?.tipo === "opciones" && datos && (
        <ModalOpciones
          datos={datos}
          onClose={() => setModal(null)}
          onGuardar={async (cambios, mensaje) => {
            const ok = await hacer(() => pedir(`/api/ventas/${id}`, "PATCH", cambios), mensaje);
            if (ok) setModal(null);
          }}
          onAnularVenta={async (motivo) => {
            const ok = await hacer(() => pedir(`/api/ventas/${id}/anular`, "POST", { motivo }));
            if (ok) router.push("/ventas");
          }}
        />
      )}
    </div>
  );
}

function Chip({ activo, chico, onClick, children }: { activo: boolean; chico?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
        chico ? "min-h-8 px-2.5 text-xs" : "min-h-9 px-3 text-sm"
      } ${
        activo
          ? "border-[#0f766e] bg-[#0f766e] text-white dark:border-[#37e6b0] dark:bg-[#1d4e48]"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#c1cbc6]"
      }`}
    >
      {children}
    </button>
  );
}

function Grupo({ titulo, tono, children }: { titulo: string; tono?: "ambar"; children: React.ReactNode }) {
  return (
    <section>
      <h2
        className={`px-4 pb-1 pt-3 text-xs font-semibold ${tono === "ambar" ? "text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-[#94a19c]"}`}
      >
        {titulo}
      </h2>
      <ul className={`divide-y divide-slate-100 dark:divide-[#1c2521] ${tono === "ambar" ? "bg-amber-50/50 dark:bg-[#211c12]" : ""}`}>{children}</ul>
    </section>
  );
}

function Paso({ onClick, disabled, etiqueta, children }: { onClick: () => void; disabled?: boolean; etiqueta: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40 dark:border-[#29403b] dark:text-[#c1cbc6] dark:hover:bg-[#172724]"
    >
      {children}
    </button>
  );
}

type LineaPago = { medioId: string; monto: string; propina: string };

function ModalCobrar({
  venta,
  medios,
  permisos,
  onClose,
  onCobrado,
}: {
  venta: VentaCompleta;
  medios: Medio[];
  permisos: Record<string, boolean>;
  onClose: () => void;
  onCobrado: (r: { cerrada: boolean; vuelto: number; factura: string | null }) => void;
}) {
  const porDefecto = medios.find((m) => m.tipo === "EFECTIVO") ?? medios[0];
  const [lineas, setLineas] = useState<LineaPago[]>([{ medioId: porDefecto?.id ?? "", monto: String(Math.round(venta.falta)), propina: "" }]);
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState("");
  const [facturaA, setFacturaA] = useState(false);
  const [cuit, setCuit] = useState("");
  const [condicion, setCondicion] = useState<1 | 6>(1);

  const n = aNumero;
  const tipoDe = new Map(medios.map((m) => [m.id, m.tipo]));
  const saldo = saldoDeVenta(venta.total, [
    ...venta.pagos,
    ...lineas.map((l) => ({ monto: n(l.monto), propina: n(l.propina), anulado: false })),
  ]);
  const hayEfectivo = lineas.some((l) => tipoDe.get(l.medioId) === "EFECTIVO" && n(l.monto) > 0);
  const puedeCerrar = saldo.falta <= 0.009 && (saldo.vuelto === 0 || hayEfectivo) && permisos.close_sales;

  function cambiar(k: number, cambio: Partial<LineaPago>) {
    setLineas((ls) => ls.map((l, j) => (j === k ? { ...l, ...cambio } : l)));
  }

  async function cobrar(cerrar: boolean) {
    setCobrando(true);
    setError("");
    try {
      const r = await pedir(`/api/ventas/${venta.id}/cobrar`, "POST", {
        cerrar,
        pagos: lineas.map((l) => ({ medioPagoId: l.medioId, monto: n(l.monto), propina: n(l.propina) })),
        ...(cerrar && facturaA ? { facturaA: { cuit, condicion } } : {}),
      });
      onCobrado({ cerrada: r.cerrada, vuelto: r.vuelto, factura: textoFactura(r.factura) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cobrar");
      setCobrando(false);
    }
  }

  return (
    <Modal title={`Cobrar ${plata(venta.falta)}`} onClose={() => (cobrando ? undefined : onClose())} maxWidth="max-w-lg">
      <div className="flex flex-col gap-4">
        {lineas.map((l, k) => (
          <fieldset key={k} className="rounded-lg border border-slate-200 p-3 dark:border-[#29403b]">
            <legend className="sr-only">Pago {k + 1}</legend>
            <div className="flex flex-wrap gap-1.5">
              {medios.map((m) => (
                <Chip chico key={m.id} activo={l.medioId === m.id} onClick={() => cambiar(k, { medioId: m.id })}>
                  {m.nombre}
                </Chip>
              ))}
            </div>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <Label>Monto</Label>
                <Input inputMode="decimal" value={l.monto} onChange={(e) => cambiar(k, { monto: e.target.value })} className="text-lg font-semibold tabular-nums" />
              </div>
              {permisos.create_tips && (
                <div className="w-28">
                  <Label>Propina</Label>
                  <Input inputMode="decimal" value={l.propina} onChange={(e) => cambiar(k, { propina: e.target.value })} placeholder="0" />
                </div>
              )}
              {lineas.length > 1 && (
                <Button variant="ghost" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== k))} aria-label="Quitar este pago" className="px-3">
                  <X size={16} aria-hidden />
                </Button>
              )}
            </div>
          </fieldset>
        ))}

        <Button
          variant="ghost"
          onClick={() =>
            setLineas((ls) => [...ls, { medioId: medios.find((m) => m.tipo !== "EFECTIVO")?.id ?? porDefecto?.id ?? "", monto: String(Math.round(saldo.falta)), propina: "" }])
          }
        >
          <Plus size={15} aria-hidden />
          Pagar una parte con otro medio
        </Button>

        <dl className="grid grid-cols-[1fr_auto] gap-y-1 rounded-lg bg-slate-50 px-3 py-2.5 text-sm dark:bg-[#0d1614]">
          <dt>Total de la venta</dt>
          <dd className="text-right tabular-nums">{plata(venta.total)}</dd>
          {venta.pagado > 0 && (
            <>
              <dt>Ya cobrado</dt>
              <dd className="text-right tabular-nums">{plata(venta.pagado)}</dd>
            </>
          )}
          <dt className="font-semibold">{saldo.vuelto > 0 ? "Vuelto" : "Falta"}</dt>
          <dd className={`text-right text-lg font-bold tabular-nums ${saldo.vuelto > 0 && !hayEfectivo ? "text-rose-600 dark:text-rose-400" : ""}`}>
            {plata(saldo.vuelto > 0 ? saldo.vuelto : saldo.falta)}
          </dd>
        </dl>
        {saldo.vuelto > 0 && !hayEfectivo && (
          <p className="text-sm text-rose-700 dark:text-rose-300">Con tarjeta, QR o transferencia no puede haber vuelto: bajá el monto.</p>
        )}

        {venta.factura.habilitada && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={facturaA} onChange={(e) => setFacturaA(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              El cliente pide Factura A
            </label>
            {facturaA && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <Label>CUIT del cliente</Label>
                  <Input inputMode="numeric" value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="30-12345678-9" autoComplete="off" />
                </div>
                <SelectorSegmentado
                  label="Condición frente al IVA"
                  opciones={[
                    { clave: 1, label: "Resp. inscripto" },
                    { clave: 6, label: "Monotributo" },
                  ]}
                  valor={condicion}
                  onChange={setCondicion}
                />
              </div>
            )}
          </div>
        )}

        <ErrorText>{error}</ErrorText>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => cobrar(false)} disabled={cobrando || saldo.pagado <= venta.pagado}>
            Pago parcial
          </Button>
          <Button onClick={() => cobrar(true)} disabled={cobrando || !puedeCerrar || (facturaA && !cuit.trim())}>
            <CheckCircle2 size={16} aria-hidden />
            {cobrando ? "Cobrando…" : "Cobrar y cerrar"}
          </Button>
        </div>
        {!permisos.close_sales && <p className="text-xs text-slate-500 dark:text-[#94a19c]">Tu rol puede cobrar pero no cerrar ventas: pedile a un encargado que la cierre.</p>}
      </div>
    </Modal>
  );
}

function ModalAnularItem({
  item,
  permitido,
  onClose,
  onAnular,
}: {
  item: Item;
  permitido: boolean;
  onClose: () => void;
  onAnular: (motivo: string, comentario: string) => void;
}) {
  const [motivo, setMotivo] = useState("PEDIDO_DEL_CLIENTE");
  const [comentario, setComentario] = useState("");
  return (
    <Modal title={`Anular ${item.cantidad}× ${item.nombre}`} onClose={onClose}>
      {permitido ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAnular(motivo, comentario);
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-slate-500 dark:text-[#94a19c]">Ya se envió a cocina: queda registrado quién lo anuló y por qué.</p>
          <div>
            <Label>Motivo</Label>
            <Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {Object.entries(ETIQUETA_MOTIVO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Comentario (opcional)</Label>
            <Input value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </div>
          <Button type="submit" variant="danger">
            <Ban size={16} aria-hidden />
            Anular
          </Button>
        </form>
      ) : (
        <p className="text-sm">Tu rol no puede anular productos ya enviados a cocina. Pedíselo a un encargado.</p>
      )}
    </Modal>
  );
}

function ModalComentario({ item, onClose, onGuardar }: { item: Item; onClose: () => void; onGuardar: (c: string) => void }) {
  const [comentario, setComentario] = useState(item.comentario ?? "");
  const rapidos = ["Sin azúcar", "Con edulcorante", "Bien caliente", "Para llevar", "Sin TACC", "Leche deslactosada"];
  return (
    <Modal title={`Comentario para ${item.nombre}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar(comentario);
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap gap-1.5">
          {rapidos.map((r) => (
            <Chip chico key={r} activo={comentario === r} onClick={() => setComentario(r)}>
              {r}
            </Chip>
          ))}
        </div>
        <Input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Sale impreso en la comanda" autoFocus />
        <Button type="submit">Guardar</Button>
      </form>
    </Modal>
  );
}

function ModalOpciones({
  datos,
  onClose,
  onGuardar,
  onAnularVenta,
}: {
  datos: Datos;
  onClose: () => void;
  onGuardar: (cambios: Record<string, unknown>, mensaje: string) => void;
  onAnularVenta: (motivo: string) => void;
}) {
  const { venta, mozos, mesasLibres, permisos } = datos;
  const [comensales, setComensales] = useState(String(venta.comensales ?? ""));
  const [cliente, setCliente] = useState(venta.cliente ?? "");
  const [comentario, setComentario] = useState(venta.comentario ?? "");
  const [mozoId, setMozoId] = useState(venta.mozo?.id ?? "");
  const [mesaId, setMesaId] = useState("");
  const [motivoAnular, setMotivoAnular] = useState("");

  return (
    <Modal title="Opciones de la venta" onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col gap-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onGuardar(
              {
                comensales: comensales ? Number(comensales) : null,
                cliente,
                comentario,
                ...(permisos.assign_waiter && mozoId !== (venta.mozo?.id ?? "") ? { mozoId: mozoId || null } : {}),
                ...(permisos.move_additions && mesaId ? { mesaId } : {}),
              },
              mesaId ? "Venta cambiada de mesa" : "Cambios guardados"
            );
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <div>
            <Label>Comensales</Label>
            <Input inputMode="numeric" value={comensales} onChange={(e) => setComensales(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <Label>Cliente</Label>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre" />
          </div>
          <div className="sm:col-span-2">
            <Label>Comentario de la venta</Label>
            <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} />
          </div>
          {permisos.assign_waiter && (
            <div>
              <Label>Mozo</Label>
              <Select value={mozoId} onChange={(e) => setMozoId(e.target.value)}>
                <option value="">Sin mozo</option>
                {mozos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {permisos.move_additions && (
            <div>
              <Label>{venta.mesa ? "Cambiar a la mesa" : "Pasar a una mesa"}</Label>
              <Select value={mesaId} onChange={(e) => setMesaId(e.target.value)}>
                <option value="">{venta.mesa ? `Sigue en la ${venta.mesa.numero}` : "Sigue en mostrador"}</option>
                {mesasLibres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.salon} · mesa {m.numero}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Button type="submit" className="sm:col-span-2">
            Guardar
          </Button>
        </form>

        {permisos.cancel_sales && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAnularVenta(motivoAnular);
            }}
            className="flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-[#1c2521]"
          >
            <h3 className="font-semibold text-rose-700 dark:text-rose-300">Anular la venta entera</h3>
            <Input value={motivoAnular} onChange={(e) => setMotivoAnular(e.target.value)} placeholder="Por qué se anula" aria-label="Motivo de la anulación" required />
            <Button type="submit" variant="danger" disabled={!motivoAnular.trim()}>
              <Ban size={16} aria-hidden />
              Anular venta
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
}

/** Lo que se le dice al cajero sobre la factura recién pedida. */
function textoFactura(f: { cae: string | null; numero: number | null; error: string | null } | null): string | null {
  if (!f) return null;
  if (f.cae) return `Factura emitida: N° ${f.numero} · CAE ${f.cae}`;
  return "ARCA no respondió: la factura quedó pendiente y se reintenta sola.";
}

/** "Empleado 50% · −$2.500" debajo del producto, si tiene descuento. */
function DescuentoDeLinea({ item }: { item: Item }) {
  const bruto = item.precio * item.cantidad;
  const monto = bruto - totalDeLinea(item);
  if (monto <= 0) return null;
  return (
    <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-[#1d1830] dark:text-violet-200">
      <Percent size={11} aria-hidden />
      {item.descuentoNombre ?? "Descuento"}
      {item.descuentoPct ? ` ${item.descuentoPct}%` : ""} · −{plata(monto)}
    </p>
  );
}

/** El precio del renglón; si tiene descuento, el original tachado arriba. */
function PrecioDeLinea({ item }: { item: Item }) {
  const bruto = item.precio * item.cantidad;
  const neto = totalDeLinea(item);
  return (
    <span className="pt-0.5 text-right text-sm font-semibold tabular-nums">
      {neto < bruto && <span className="block text-xs font-normal text-slate-400 line-through dark:text-[#5f6d67]">{plata(bruto)}</span>}
      {plata(neto)}
    </span>
  );
}

/**
 * Elegir un descuento: los de la lista del local (los arma el admin en
 * Configuración) y, para quien tiene el permiso, uno libre.
 */
function ModalDescuento({
  item,
  plantillas,
  libre,
  deLista,
  base,
  actual,
  onClose,
  onAplicar,
}: {
  item?: Item;
  plantillas: Plantilla[];
  libre: boolean;
  deLista: boolean;
  base: number;
  actual: string | null;
  onClose: () => void;
  onAplicar: (descuento: { plantillaId?: string; pct?: number | null; monto?: number | null } | null, mensaje: string) => void;
}) {
  const [tipo, setTipo] = useState<"pct" | "monto">("pct");
  const [valor, setValor] = useState("");
  const n = aNumero(valor);
  const vistaPrevia = montoDescuento(base, tipo === "pct" ? { pct: n } : { monto: n });

  return (
    <Modal title={item ? `Descuento en ${item.nombre}` : "Descuento a toda la venta"} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-slate-500 dark:text-[#94a19c]">
          Sobre {plata(base)}
          {actual && (
            <>
              {" "}· ahora tiene <strong className="text-violet-700 dark:text-violet-300">{actual}</strong>
            </>
          )}
        </p>

        {deLista &&
          (plantillas.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {plantillas.map((p) => {
                const monto = montoDescuento(base, p.porcentaje ? { pct: p.porcentaje, monto: p.tope } : { monto: p.monto });
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onAplicar({ plantillaId: p.id }, `${p.nombre} aplicado`)}
                    className="flex min-h-14 flex-col items-start justify-center rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-left transition-colors hover:border-violet-400 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:border-[#3a2f5c] dark:bg-[#1d1830] dark:hover:bg-[#261f40]"
                  >
                    <span className="text-sm font-semibold text-violet-900 dark:text-violet-100">{p.nombre}</span>
                    <span className="text-xs text-violet-800/80 dark:text-violet-200/80">
                      {p.porcentaje ? `${p.porcentaje}%${p.tope ? ` hasta ${plata(p.tope)}` : ""}` : plata(p.monto ?? 0)} · −{plata(monto)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 dark:border-[#29403b] dark:text-[#94a19c]">
              El local todavía no tiene descuentos en la lista. Se cargan en Ventas → Configuración.
            </p>
          ))}

        {libre && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAplicar(tipo === "pct" ? { pct: n } : { monto: n }, "Descuento aplicado");
            }}
            className="flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-[#1c2521]"
          >
            <h3 className="text-sm font-semibold">Descuento libre</h3>
            <div className="flex items-end gap-2">
              <SelectorSegmentado
                label="Tipo de descuento"
                valor={tipo}
                onChange={setTipo}
                opciones={[
                  { clave: "pct", label: "%" },
                  { clave: "monto", label: "$" },
                ]}
              />
              <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Valor del descuento" placeholder="0" className="flex-1" />
              <Button type="submit" variant="ghost" disabled={n <= 0 || (tipo === "pct" && n > 100)}>
                Aplicar −{plata(vistaPrevia)}
              </Button>
            </div>
          </form>
        )}

        {actual && (
          <Button variant="danger" onClick={() => onAplicar(null, "Descuento quitado")}>
            <X size={15} aria-hidden />
            Quitar el descuento
          </Button>
        )}
      </div>
    </Modal>
  );
}
