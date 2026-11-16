"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChefHat, Link2Off, Plus, Search, Star, Trash2, Wand2 } from "lucide-react";
import { Badge, Button, Checkbox, ErrorText, Input, Label, Modal, PageTitle, Panel, Select, SelectorSegmentado } from "@/components/ui";
import { SelectorLocal } from "@/components/BarraContexto";
import { plata } from "@/lib/formato";
import { IVA } from "@/lib/compras/impuestos";
import { aNumero, NavVentas, useLocalVentas } from "../comun";

type Unidad = "G" | "ML" | "U";
type Renglon = { ingredienteId: string; cantidad: number };
type Producto = {
  id: string;
  nombre: string;
  codigo: string | null;
  categoriaId: string;
  cocinaId: string | null;
  precio: number;
  activo: boolean;
  favorito: boolean;
  editadoEn: string | null;
  fudoId: number | null;
  receta: Renglon[];
  costo: number | null;
};
type Ingrediente = {
  id: string;
  nombre: string;
  unidad: Unidad;
  insumo: string | null;
  costoManual: number;
  costo: number;
  automatico: boolean;
  stockMinimo: number | null;
  activo: boolean;
  enRecetas: number;
  stock: number;
  contadoEn: string | null;
};
type Datos = {
  productos: Producto[];
  categorias: { id: string; nombre: string; padreId: string | null }[];
  cocinas: { id: string; nombre: string }[];
  ingredientes: Ingrediente[];
  permisos: Record<string, boolean>;
};

const POR_PAGINA = 80;
/** Desde acá el costo se come demasiado del precio, igual que en la Carta. */
const COSTO_ALTO = 40;

/** "1,25 kg", "250 g", "3 u": la cantidad en la unidad que se lee mejor. */
export function cantidad(valor: number, unidad: Unidad) {
  const n = (x: number, d = 2) => x.toLocaleString("es-AR", { maximumFractionDigits: d });
  if (unidad === "U") return `${n(valor)} u`;
  const grande = unidad === "G" ? "kg" : "l";
  const chica = unidad === "G" ? "g" : "ml";
  return Math.abs(valor) >= 1000 ? `${n(valor / 1000)} ${grande}` : `${n(valor, 1)} ${chica}`;
}
/** El costo se guarda por gramo o ml; se muestra y se carga por kilo o litro. */
const FACTOR: Record<Unidad, number> = { G: 1000, ML: 1000, U: 1 };
const POR: Record<Unidad, string> = { G: "kg", ML: "l", U: "unidad" };
const CORTA: Record<Unidad, string> = { G: "g", ML: "ml", U: "u" };

async function pedir(url: string, method = "GET", body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar");
  return data;
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const costoPct = (p: { costo: number | null; precio: number }) => (p.costo != null && p.precio > 0 ? (p.costo / (p.precio / (1 + IVA))) * 100 : null);

function tonoCosto(pct: number | null) {
  if (pct == null) return "text-slate-400 dark:text-[#5f6d67]";
  if (pct >= 55) return "text-rose-600 dark:text-rose-400";
  if (pct >= COSTO_ALTO) return "text-amber-700 dark:text-amber-300";
  return "text-emerald-700 dark:text-[#4ee6b0]";
}

export default function ProductosClient() {
  const [localGuardado, setLocalGuardado] = useLocalVentas();
  const [locales, setLocales] = useState<{ id: string; nombre: string }[]>([]);
  const [localId, setLocalId] = useState("");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [vista, setVista] = useState<"productos" | "ingredientes">("productos");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState<Producto | "nuevo" | null>(null);
  const [ingrediente, setIngrediente] = useState<Ingrediente | "nuevo" | null>(null);
  const [precargando, setPrecargando] = useState(false);

  const cargar = useCallback(async () => {
    const salon = await pedir(`/api/ventas/salon${localGuardado ? `?localId=${localGuardado}` : ""}`);
    setLocales(salon.locales);
    setLocalId(salon.localId ?? "");
    if (salon.localId) setDatos(await pedir(`/api/ventas/productos?localId=${salon.localId}`));
  }, [localGuardado]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, sin librería de datos
    cargar().catch((e: Error) => setError(e.message));
  }, [cargar]);

  async function recargar(mensaje?: string) {
    await cargar();
    if (mensaje) setAviso(mensaje);
  }

  async function precargar() {
    setPrecargando(true);
    setError("");
    try {
      const r = await pedir("/api/ventas/productos/precargar", "POST", { localId });
      await recargar(`Listo: ${r.ingredientesNuevos} ingredientes nuevos y ${r.productosConReceta} productos con receta.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo precargar");
    } finally {
      setPrecargando(false);
    }
  }

  if (!datos) return error ? <ErrorText>{error}</ErrorText> : <div className="h-96 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Cargando productos" />;

  const bajoMinimo = datos.ingredientes.filter((i) => i.activo && i.stockMinimo != null && i.stock < i.stockMinimo).length;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle subtitle="Precio, receta, costo y stock de cada producto del local" actions={<NavVentas activo="productos" />}>
        Productos
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        {locales.length > 1 && <SelectorLocal locales={locales} valor={localId} onChange={setLocalGuardado} todos={null} />}
        <SelectorSegmentado
          label="Ver"
          valor={vista}
          onChange={setVista}
          opciones={[
            { clave: "productos", label: `Productos · ${datos.productos.filter((p) => p.activo).length}` },
            { clave: "ingredientes", label: `Ingredientes · ${datos.ingredientes.length}${bajoMinimo ? ` · ${bajoMinimo} bajos` : ""}` },
          ]}
        />
      </div>

      <div aria-live="polite">
        <ErrorText>{error}</ErrorText>
        {aviso && !error && <p className="text-sm font-medium text-emerald-700 dark:text-[#4ee6b0]">{aviso}</p>}
      </div>

      {datos.ingredientes.length === 0 && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">Este local todavía no tiene ingredientes.</p>
            <p className="text-sm text-slate-500 dark:text-[#94a19c]">
              Se pueden cargar los insumos de las compras al proveedor y las recetas que ya usa la Carta.
            </p>
          </div>
          <Button onClick={precargar} disabled={precargando || !datos.permisos.update_products}>
            <Wand2 size={16} aria-hidden />
            {precargando ? "Cargando…" : "Precargar recetas"}
          </Button>
        </Panel>
      )}

      {vista === "productos" ? (
        <ListaProductos datos={datos} onEditar={setEditando} onPrecargar={precargar} precargando={precargando} />
      ) : (
        <ListaIngredientes datos={datos} onEditar={setIngrediente} />
      )}

      {editando && (
        <EditorProducto
          localId={localId}
          producto={editando === "nuevo" ? null : editando}
          datos={datos}
          onClose={() => setEditando(null)}
          onGuardado={async (mensaje) => {
            setEditando(null);
            await recargar(mensaje);
          }}
        />
      )}
      {ingrediente && (
        <EditorIngrediente
          localId={localId}
          ingrediente={ingrediente === "nuevo" ? null : ingrediente}
          permisos={datos.permisos}
          productos={datos.productos}
          onClose={() => setIngrediente(null)}
          onGuardado={async (mensaje) => {
            setIngrediente(null);
            await recargar(mensaje);
          }}
        />
      )}
    </div>
  );
}

function ListaProductos({
  datos,
  onEditar,
  onPrecargar,
  precargando,
}: {
  datos: Datos;
  onEditar: (p: Producto | "nuevo") => void;
  onPrecargar: () => void;
  precargando: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [estado, setEstado] = useState<"activos" | "inactivos" | "sinReceta" | "costoAlto">("activos");
  const [todos, setTodos] = useState(false);
  const nombreCategoria = useMemo(() => new Map(datos.categorias.map((c) => [c.id, c.nombre])), [datos.categorias]);

  const visibles = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    const hijas = new Set(datos.categorias.filter((c) => c.padreId === categoria).map((c) => c.id));
    return datos.productos.filter((p) => {
      if (q && !sinAcentos(p.nombre).includes(q) && p.codigo !== busqueda.trim()) return false;
      if (categoria && p.categoriaId !== categoria && !hijas.has(p.categoriaId)) return false;
      if (estado === "activos") return p.activo;
      if (estado === "inactivos") return !p.activo;
      if (estado === "sinReceta") return p.activo && p.receta.length === 0;
      return p.activo && (costoPct(p) ?? 0) >= COSTO_ALTO;
    });
  }, [datos, busqueda, categoria, estado]);
  const lista = todos || busqueda ? visibles : visibles.slice(0, POR_PAGINA);
  const sinReceta = datos.productos.filter((p) => p.activo && p.receta.length === 0).length;

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3 dark:border-[#1c2521]">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Buscar producto</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o código" className="pl-9" />
        </label>
        <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría" className="w-auto min-w-[12rem]">
          <option value="">Todas las categorías</option>
          {datos.categorias
            .filter((c) => !c.padreId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
        </Select>
        <SelectorSegmentado
          label="Filtrar"
          valor={estado}
          onChange={setEstado}
          opciones={[
            { clave: "activos", label: "Activos" },
            { clave: "sinReceta", label: `Sin receta (${sinReceta})` },
            { clave: "costoAlto", label: "Costo alto" },
            { clave: "inactivos", label: "Inactivos" },
          ]}
        />
        <div className="ml-auto flex gap-2">
          {datos.ingredientes.length > 0 && sinReceta > 0 && (
            <Button variant="ghost" onClick={onPrecargar} disabled={precargando || !datos.permisos.update_products} title="Carga la receta de la Carta en los productos que todavía no tienen">
              <Wand2 size={16} aria-hidden />
              <span className="hidden sm:inline">{precargando ? "Cargando…" : "Completar recetas"}</span>
            </Button>
          )}
          <Button onClick={() => onEditar("nuevo")} disabled={!datos.permisos.update_products}>
            <Plus size={16} aria-hidden />
            Nuevo producto
          </Button>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_5rem] gap-x-3 border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-500 md:grid dark:border-[#29403b] dark:text-[#94a19c]" aria-hidden>
        <span>Producto</span>
        <span className="text-right">Precio</span>
        <span className="text-right">Costo</span>
        <span className="text-right">Costo %</span>
      </div>
      {lista.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-[#94a19c]">Ningún producto coincide.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-[#1c2521]">
          {lista.map((p) => {
            const pct = costoPct(p);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onEditar(p)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 md:grid-cols-[minmax(0,1fr)_7rem_7rem_5rem] dark:hover:bg-[#172724]"
                >
                  <span className="min-w-0">
                    <span className={`flex items-center gap-1.5 font-medium ${p.activo ? "" : "text-slate-400 line-through dark:text-[#5f6d67]"}`}>
                      {p.favorito && <Star size={13} className="shrink-0 fill-amber-400 text-amber-500" aria-label="Favorito" />}
                      <span className="truncate">{p.nombre}</span>
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-[#94a19c]">
                      {nombreCategoria.get(p.categoriaId)}
                      {p.receta.length > 0 ? ` · ${p.receta.length} ingredientes` : " · sin receta"}
                      <span className="md:hidden"> · {plata(p.precio)} · costo {p.costo != null ? plata(p.costo) : "—"}</span>
                    </span>
                  </span>
                  <span className="hidden text-right tabular-nums md:block">{plata(p.precio)}</span>
                  <span className="hidden text-right tabular-nums md:block">{p.costo != null ? plata(p.costo) : "—"}</span>
                  <span className={`text-right font-semibold tabular-nums ${tonoCosto(pct)}`}>{pct != null ? `${Math.round(pct)}%` : "—"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!todos && !busqueda && visibles.length > POR_PAGINA && (
        <div className="border-t border-slate-100 px-4 py-3 text-center dark:border-[#1c2521]">
          <button type="button" onClick={() => setTodos(true)} className="text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-[#4ee6b0]">
            Ver los {visibles.length} productos
          </button>
        </div>
      )}
      <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 dark:border-[#1c2521] dark:text-[#94a19c]">
        El costo % es contra el precio sin IVA, como en la Carta. Lo que se edita acá ya no lo pisa la sincronización con Fudo.
      </p>
    </Panel>
  );
}

function EditorProducto({
  localId,
  producto,
  datos,
  onClose,
  onGuardado,
}: {
  localId: string;
  producto: Producto | null;
  datos: Datos;
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [codigo, setCodigo] = useState(producto?.codigo ?? "");
  const [categoriaId, setCategoriaId] = useState(producto?.categoriaId ?? "");
  const [cocinaId, setCocinaId] = useState(producto?.cocinaId ?? "");
  const [precio, setPrecio] = useState(producto ? String(producto.precio) : "");
  const [activo, setActivo] = useState(producto?.activo ?? true);
  const [favorito, setFavorito] = useState(producto?.favorito ?? false);
  const [receta, setReceta] = useState<{ ingredienteId: string; cantidad: string }[]>(
    producto?.receta.map((r) => ({ ingredienteId: r.ingredienteId, cantidad: String(r.cantidad) })) ?? []
  );
  const [agregar, setAgregar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const puede = datos.permisos.update_products;

  const porId = useMemo(() => new Map(datos.ingredientes.map((i) => [i.id, i])), [datos.ingredientes]);
  const costo = receta.reduce((s, r) => s + aNumero(r.cantidad) * (porId.get(r.ingredienteId)?.costo ?? 0), 0);
  const precioNum = aNumero(precio);
  const pct = precioNum > 0 && receta.length ? (costo / (precioNum / (1 + IVA))) * 100 : null;
  const disponibles = datos.ingredientes.filter((i) => i.activo && !receta.some((r) => r.ingredienteId === i.id));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      let id = producto?.id;
      if (!id) {
        const r = await pedir("/api/ventas/productos", "POST", { localId, nombre, categoriaId, precio: precioNum, codigo, cocinaId: cocinaId || null });
        id = r.id as string;
      }
      await pedir(`/api/ventas/productos/${id}`, "PATCH", {
        nombre,
        codigo,
        categoriaId,
        cocinaId: cocinaId || null,
        precio: precioNum,
        activo,
        favorito,
        receta: receta.map((r) => ({ ingredienteId: r.ingredienteId, cantidad: aNumero(r.cantidad) })),
      });
      onGuardado(producto ? `${nombre} guardado` : `${nombre} creado`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  return (
    <Modal title={producto ? producto.nombre : "Nuevo producto"} onClose={() => (guardando ? undefined : onClose())} maxWidth="max-w-3xl">
      <form onSubmit={guardar} className="flex flex-col gap-5">
        <fieldset disabled={!puede} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>
          <div>
            <Label>Categoría</Label>
            <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
              <option value="" disabled>
                Elegí una
              </option>
              {datos.categorias
                .filter((c) => !c.padreId)
                .flatMap((c) => [c, ...datos.categorias.filter((h) => h.padreId === c.id)])
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.padreId ? `   › ${c.nombre}` : c.nombre}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label>Cocina de la comanda</Label>
            <Select value={cocinaId} onChange={(e) => setCocinaId(e.target.value)}>
              <option value="">La de su categoría</option>
              {datos.cocinas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Precio de carta (con IVA)</Label>
            <Input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} required className="text-lg font-semibold tabular-nums" />
          </div>
          <div>
            <Label>Código (opcional)</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-5 sm:col-span-2">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <Checkbox checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              Se vende (activo)
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <Checkbox checked={favorito} onChange={(e) => setFavorito(e.target.checked)} />
              Favorito (aparece primero al cargar pedidos)
            </label>
          </div>
        </fieldset>

        <section className="rounded-lg border border-slate-200 dark:border-[#29403b]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
            <h3 className="flex items-center gap-2 font-semibold">
              <ChefHat size={16} aria-hidden />
              Receta
            </h3>
            <p className="text-sm tabular-nums">
              Costo <strong>{plata(costo)}</strong>
              {pct != null && <span className={`ml-2 font-semibold ${tonoCosto(pct)}`}>{Math.round(pct)}% del precio sin IVA</span>}
            </p>
          </div>
          {receta.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500 dark:text-[#94a19c]">Sin receta: no tiene costo y no descuenta stock.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-[#1c2521]">
              {receta.map((r, k) => {
                const ing = porId.get(r.ingredienteId);
                const unidad = ing?.unidad ?? "U";
                return (
                  <li key={r.ingredienteId} className="grid grid-cols-[minmax(0,1fr)_7rem_6rem_auto] items-center gap-2 px-4 py-2">
                    <span className="min-w-0 truncate text-sm">{ing?.nombre ?? "Ingrediente borrado"}</span>
                    <label className="relative">
                      <span className="sr-only">Cantidad de {ing?.nombre}</span>
                      <Input
                        inputMode="decimal"
                        value={r.cantidad}
                        disabled={!puede}
                        onChange={(e) => setReceta((rs) => rs.map((x, j) => (j === k ? { ...x, cantidad: e.target.value } : x)))}
                        className="pr-9 text-right tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{CORTA[unidad]}</span>
                    </label>
                    <span className="text-right text-sm tabular-nums text-slate-600 dark:text-[#c1cbc6]">{plata(aNumero(r.cantidad) * (ing?.costo ?? 0))}</span>
                    <button
                      type="button"
                      onClick={() => setReceta((rs) => rs.filter((_, j) => j !== k))}
                      disabled={!puede}
                      aria-label={`Sacar ${ing?.nombre} de la receta`}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 disabled:opacity-40 dark:hover:bg-[#241419]"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {puede && (
            <div className="flex gap-2 border-t border-slate-100 p-3 dark:border-[#1c2521]">
              <Select value={agregar} onChange={(e) => setAgregar(e.target.value)} aria-label="Ingrediente para agregar">
                <option value="">Agregar un ingrediente…</option>
                {disponibles.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} ({plata(i.costo * FACTOR[i.unidad])}/{POR[i.unidad]})
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="ghost"
                disabled={!agregar}
                onClick={() => {
                  setReceta((rs) => [...rs, { ingredienteId: agregar, cantidad: "" }]);
                  setAgregar("");
                }}
              >
                <Plus size={15} aria-hidden />
                Agregar
              </Button>
            </div>
          )}
        </section>

        {producto?.fudoId && !producto.editadoEn && (
          <p className="text-xs text-slate-500 dark:text-[#94a19c]">Viene de Fudo. Al guardar queda como editado en Pulso y la sincronización ya no lo cambia.</p>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando || !puede || !nombre.trim() || !categoriaId}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ListaIngredientes({ datos, onEditar }: { datos: Datos; onEditar: (i: Ingrediente | "nuevo") => void }) {
  const [busqueda, setBusqueda] = useState("");
  const [soloBajos, setSoloBajos] = useState(false);
  const visibles = datos.ingredientes.filter((i) => {
    if (busqueda && !sinAcentos(i.nombre).includes(sinAcentos(busqueda))) return false;
    if (soloBajos) return i.stockMinimo != null && i.stock < i.stockMinimo;
    return true;
  });

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3 dark:border-[#1c2521]">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Buscar ingrediente</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar ingrediente" className="pl-9" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox checked={soloBajos} onChange={(e) => setSoloBajos(e.target.checked)} />
          Sólo bajo el mínimo
        </label>
        <Button className="ml-auto" onClick={() => onEditar("nuevo")} disabled={!datos.permisos.update_ingredients}>
          <Plus size={16} aria-hidden />
          Nuevo ingrediente
        </Button>
      </div>
      <div className="hidden grid-cols-[minmax(0,1fr)_9rem_8rem_6rem] gap-x-3 border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-500 md:grid dark:border-[#29403b] dark:text-[#94a19c]" aria-hidden>
        <span>Ingrediente</span>
        <span className="text-right">Costo</span>
        <span className="text-right">Stock</span>
        <span className="text-right">Recetas</span>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-[#1c2521]">
        {visibles.map((i) => {
          const bajo = i.stockMinimo != null && i.stock < i.stockMinimo;
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => onEditar(i)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 md:grid-cols-[minmax(0,1fr)_9rem_8rem_6rem] dark:hover:bg-[#172724]"
              >
                <span className="min-w-0">
                  <span className={`block truncate font-medium ${i.activo ? "" : "text-slate-400 line-through"}`}>{i.nombre}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-[#94a19c]">
                    {i.automatico ? "precio de la última factura" : "costo manual"}
                    {!i.contadoEn && " · sin contar"}
                  </span>
                </span>
                <span className="hidden text-right tabular-nums md:block">
                  {plata(i.costo * FACTOR[i.unidad])}
                  <span className="text-xs text-slate-500 dark:text-[#94a19c]">/{POR[i.unidad]}</span>
                </span>
                <span className={`text-right font-semibold tabular-nums ${bajo ? "text-rose-600 dark:text-rose-400" : i.stock < 0 ? "text-amber-700 dark:text-amber-300" : ""}`}>
                  {bajo && <AlertTriangle size={13} className="mr-1 inline" aria-label="Bajo el mínimo" />}
                  {cantidad(i.stock, i.unidad)}
                </span>
                <span className="hidden text-right tabular-nums text-slate-500 md:block dark:text-[#94a19c]">{i.enRecetas}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 dark:border-[#1c2521] dark:text-[#94a19c]">
        El stock es el último conteo, más ingresos, menos mermas, menos lo que usaron las ventas cerradas según sus recetas. Un stock negativo
        quiere decir que todavía no se contó o que entró mercadería sin cargarla.
      </p>
    </Panel>
  );
}

function EditorIngrediente({
  localId,
  ingrediente,
  permisos,
  productos,
  onClose,
  onGuardado,
}: {
  localId: string;
  ingrediente: Ingrediente | null;
  permisos: Record<string, boolean>;
  productos: Producto[];
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState(ingrediente?.nombre ?? "");
  const [unidad, setUnidad] = useState<Unidad>(ingrediente?.unidad ?? "G");
  const [costo, setCosto] = useState(ingrediente ? String(Math.round(ingrediente.costoManual * FACTOR[ingrediente.unidad] * 100) / 100) : "");
  const [minimo, setMinimo] = useState(ingrediente?.stockMinimo != null ? String(ingrediente.stockMinimo / (ingrediente.unidad === "U" ? 1 : 1000)) : "");
  const [activo, setActivo] = useState(ingrediente?.activo ?? true);
  const [mov, setMov] = useState<{ tipo: "CONTEO" | "INGRESO" | "EGRESO"; cantidad: string; motivo: string }>({ tipo: "CONTEO", cantidad: "", motivo: "" });
  const [movimientos, setMovimientos] = useState<{ id: string; tipo: string; cantidad: number; motivo: string | null; autor: string; createdAt: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const puede = permisos.update_ingredients;
  // Stock y mínimo se cargan en kg / l / unidades, como se cuentan.
  const escala = unidad === "U" ? 1 : 1000;
  const usadoEn = ingrediente ? productos.filter((p) => p.activo && p.receta.some((r) => r.ingredienteId === ingrediente.id)) : [];

  useEffect(() => {
    if (!ingrediente) return;
    pedir(`/api/ventas/ingredientes/${ingrediente.id}/stock`)
      .then((d) => setMovimientos(d.movimientos))
      .catch(() => undefined);
  }, [ingrediente]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    const cuerpo = {
      nombre,
      unidad,
      costo: aNumero(costo) / FACTOR[unidad],
      stockMinimo: minimo ? aNumero(minimo) * escala : null,
      activo,
    };
    try {
      if (ingrediente) await pedir(`/api/ventas/ingredientes/${ingrediente.id}`, "PATCH", cuerpo);
      else await pedir("/api/ventas/ingredientes", "POST", { localId, ...cuerpo });
      onGuardado(`${nombre} guardado`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  async function moverStock(e: React.FormEvent) {
    e.preventDefault();
    if (!ingrediente) return;
    setGuardando(true);
    setError("");
    try {
      await pedir(`/api/ventas/ingredientes/${ingrediente.id}/stock`, "POST", { tipo: mov.tipo, cantidad: aNumero(mov.cantidad) * escala, motivo: mov.motivo });
      onGuardado(mov.tipo === "CONTEO" ? `Stock de ${nombre} contado` : `${mov.tipo === "INGRESO" ? "Ingreso" : "Egreso"} de ${nombre} cargado`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
      setGuardando(false);
    }
  }

  async function desvincular() {
    if (!ingrediente) return;
    setGuardando(true);
    try {
      await pedir(`/api/ventas/ingredientes/${ingrediente.id}`, "PATCH", { desvincular: true, costo: ingrediente.costo });
      onGuardado(`${nombre}: ahora con costo manual`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo");
      setGuardando(false);
    }
  }

  return (
    <Modal title={ingrediente ? ingrediente.nombre : "Nuevo ingrediente"} onClose={() => (guardando ? undefined : onClose())} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-5">
        <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required disabled={!puede} />
          </div>
          <div>
            <Label>Se usa en</Label>
            <Select value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)} disabled={!puede || Boolean(ingrediente?.enRecetas)}>
              <option value="G">Gramos (se compra por kg)</option>
              <option value="ML">Mililitros (se compra por litro)</option>
              <option value="U">Unidades</option>
            </Select>
          </div>
          <div>
            <Label>Costo por {POR[unidad]} (neto)</Label>
            {ingrediente?.automatico ? (
              <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 text-sm dark:border-[#29403b]">
                <span className="tabular-nums">
                  {plata(ingrediente.costo * FACTOR[unidad])} <Badge tone="emerald">de facturas</Badge>
                </span>
                {puede && (
                  <button type="button" onClick={desvincular} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-[#94a19c]">
                    <Link2Off size={13} aria-hidden />
                    Pasar a manual
                  </button>
                )}
              </div>
            ) : (
              <Input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} disabled={!puede} className="tabular-nums" />
            )}
          </div>
          <div>
            <Label>Stock mínimo ({POR[unidad] === "unidad" ? "unidades" : POR[unidad]})</Label>
            <Input inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} disabled={!puede} placeholder="Sin mínimo" />
          </div>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm">
            <Checkbox checked={activo} onChange={(e) => setActivo(e.target.checked)} disabled={!puede} />
            Activo
          </label>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="submit" disabled={guardando || !puede || !nombre.trim()}>
              {guardando ? "Guardando…" : ingrediente ? "Guardar" : "Crear ingrediente"}
            </Button>
          </div>
        </form>

        {ingrediente && (
          <section className="rounded-lg border border-slate-200 dark:border-[#29403b]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
              <h3 className="font-semibold">Stock</h3>
              <p className="text-sm">
                Hay <strong className="tabular-nums">{cantidad(ingrediente.stock, ingrediente.unidad)}</strong>
                <span className="text-slate-500 dark:text-[#94a19c]">
                  {ingrediente.contadoEn ? ` · contado el ${new Date(ingrediente.contadoEn).toLocaleDateString("es-AR")}` : " · nunca se contó"}
                </span>
              </p>
            </div>
            {permisos.update_stock && (
              <form onSubmit={moverStock} className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-4 dark:border-[#1c2521]">
                <SelectorSegmentado
                  label="Tipo de movimiento"
                  valor={mov.tipo}
                  onChange={(tipo) => setMov({ ...mov, tipo })}
                  opciones={[
                    { clave: "CONTEO", label: "Conté" },
                    { clave: "INGRESO", label: "Entró" },
                    { clave: "EGRESO", label: "Merma" },
                  ]}
                />
                <div className="w-32">
                  <Label>{mov.tipo === "CONTEO" ? "Hay" : "Cantidad"} ({POR[unidad] === "unidad" ? "u" : POR[unidad]})</Label>
                  <Input inputMode="decimal" value={mov.cantidad} onChange={(e) => setMov({ ...mov, cantidad: e.target.value })} />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <Label>{mov.tipo === "EGRESO" ? "Motivo" : "Nota (opcional)"}</Label>
                  <Input value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} placeholder={mov.tipo === "EGRESO" ? "Se venció" : ""} />
                </div>
                <Button type="submit" variant="ghost" disabled={guardando || !mov.cantidad || (mov.tipo === "EGRESO" && !mov.motivo.trim())}>
                  Cargar
                </Button>
              </form>
            )}
            {movimientos.length > 0 && (
              <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto dark:divide-[#1c2521]">
                {movimientos.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {m.tipo === "CONTEO" ? "Conteo" : m.tipo === "INGRESO" ? "Ingreso" : "Merma"}
                      {m.motivo && ` · ${m.motivo}`}
                      <span className="text-slate-500 dark:text-[#94a19c]"> · {m.autor} · {new Date(m.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {m.tipo === "EGRESO" ? "−" : m.tipo === "INGRESO" ? "+" : "="}
                      {cantidad(m.cantidad, ingrediente.unidad)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {usadoEn.length > 0 && (
          <p className="text-sm text-slate-500 dark:text-[#94a19c]">
            Se usa en {usadoEn.length} productos: {usadoEn.slice(0, 6).map((p) => p.nombre).join(", ")}
            {usadoEn.length > 6 ? "…" : ""}
          </p>
        )}
      </div>
    </Modal>
  );
}
