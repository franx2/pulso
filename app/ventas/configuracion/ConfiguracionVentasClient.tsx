"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, DownloadCloud, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Checkbox, ErrorText, Input, Label, PageTitle, Panel, PanelHeader, Select } from "@/components/ui";
import { NavVentas } from "../comun";

type LocalImport = { id: string; nombre: string; conFudo: boolean; salones: number; productos: number; medios: number };
type Rol = { id: string; nombre: string; esMozo: boolean; permisos: string[]; fudoId: number | null };
type Empleado = { id: string; nombre: string; rol: string; rolVentaId: string | null; local: string };
type PermisoCatalogo = { codigo: string; grupo: string; etiqueta: string };
type Medio = { id: string; nombre: string; tipo: string; activo: boolean };

const ROL_POR_DEFECTO: Record<string, string> = { ADMIN: "todo (es admin)", ENCARGADO: "Encargado", EMPLEADO: "Camarero" };

async function pedir(url: string, method = "GET", body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar");
  return data;
}

export default function ConfiguracionVentasClient() {
  const [locales, setLocales] = useState<LocalImport[]>([]);
  const [permisos, setPermisos] = useState<Record<string, boolean>>({});
  const [importando, setImportando] = useState("");
  const [resultado, setResultado] = useState<{ local: string; texto: string } | null>(null);
  const [roles, setRoles] = useState<Rol[] | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [catalogo, setCatalogo] = useState<PermisoCatalogo[]>([]);
  const [rolId, setRolId] = useState("");
  const [borrador, setBorrador] = useState<Rol | null>(null);
  const [nuevoRol, setNuevoRol] = useState("");
  const [localMedios, setLocalMedios] = useState("");
  const [medios, setMedios] = useState<Medio[]>([]);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState("");

  const cargarLocales = useCallback(async () => {
    const d = await pedir("/api/ventas/importar");
    setLocales(d.locales);
    setPermisos(d.permisos);
    setLocalMedios((actual) => actual || d.locales.find((l: LocalImport) => l.medios > 0)?.id || "");
  }, []);

  const cargarRoles = useCallback(async () => {
    try {
      const d = await pedir("/api/ventas/roles");
      setRoles(d.roles);
      setEmpleados(d.empleados);
      setCatalogo(d.catalogo);
      setRolId((actual) => actual || d.roles[0]?.id || "");
    } catch {
      setRoles(null); // sin permiso para configurar roles
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, sin librería de datos
    cargarLocales().catch((e: Error) => setError(e.message));
    cargarRoles();
  }, [cargarLocales, cargarRoles]);

  useEffect(() => {
    if (!localMedios) return;
    pedir(`/api/ventas/medios?localId=${localMedios}`)
      .then((d) => setMedios(d.medios))
      .catch(() => setMedios([]));
  }, [localMedios]);

  const rolElegido = roles?.find((r) => r.id === rolId) ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el borrador se reinicia al elegir otro rol
    setBorrador(rolElegido ? { ...rolElegido } : null);
  }, [rolElegido]);

  const grupos = useMemo(() => [...new Set(catalogo.map((p) => p.grupo))], [catalogo]);
  const cambiado = borrador && rolElegido && JSON.stringify(borrador) !== JSON.stringify(rolElegido);

  async function hacer(accion: () => Promise<unknown>, mensaje: string) {
    setError("");
    setGuardado("");
    try {
      await accion();
      setGuardado(mensaje);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
      return false;
    }
  }

  async function importar(l: LocalImport) {
    setImportando(l.id);
    setResultado(null);
    await hacer(async () => {
      const { resultado: r } = await pedir("/api/ventas/importar", "POST", { localId: l.id });
      setResultado({
        local: l.nombre,
        texto: `${r.salones} salones, ${r.mesas} mesas, ${r.categorias} categorías, ${r.productos} productos nuevos o actualizados (${r.productosSinCambios} sin cambios), ${r.mediosPago} medios de pago y ${r.roles} roles nuevos.`,
      });
      await Promise.all([cargarLocales(), cargarRoles()]);
    }, "Importación terminada");
    setImportando("");
  }

  const puedeImportar = permisos.update_products && permisos.admin_rooms;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle subtitle="Carta, plano de mesas, medios de pago y qué puede hacer cada rol" actions={<NavVentas activo="configuracion" />}>
        Configuración de ventas
      </PageTitle>

      <div aria-live="polite">
        <ErrorText>{error}</ErrorText>
        {guardado && !error && <p className="text-sm font-medium text-emerald-700">{guardado}</p>}
      </div>

      <Panel>
        <PanelHeader
          titulo="Importar de Fudo"
          descripcion="Trae salones, mesas, cocinas, categorías, productos con su precio, medios de pago y roles. Sólo lee de Fudo, y se puede repetir: actualiza lo que cambió sin duplicar."
        />
        <ul className="divide-y divide-slate-100">
          {locales.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-semibold">{l.nombre}</p>
                <p className="text-sm text-slate-500">
                  {l.salones ? `${l.salones} salones · ${l.productos} productos · ${l.medios} medios de pago` : "Todavía no importado"}
                </p>
              </div>
              {l.conFudo ? (
                <Button variant={l.salones ? "ghost" : "primary"} onClick={() => importar(l)} disabled={!puedeImportar || Boolean(importando)}>
                  <DownloadCloud size={16} aria-hidden />
                  {importando === l.id ? "Importando… puede tardar un minuto" : l.salones ? "Volver a sincronizar" : "Importar"}
                </Button>
              ) : (
                <Badge tone="slate">sin claves de Fudo</Badge>
              )}
            </li>
          ))}
        </ul>
        {resultado && (
          <p className="border-t border-slate-100 px-4 py-3 text-sm">
            <strong>{resultado.local}:</strong> {resultado.texto}
          </p>
        )}
      </Panel>

      {roles && (
        <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Panel>
            <PanelHeader titulo="Roles" />
            <ul className="p-2">
              {roles.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setRolId(r.id)}
                    aria-current={r.id === rolId}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium ${
                      r.id === rolId ? "bg-emerald-50 text-emerald-900" : "hover:bg-slate-50"
                    }`}
                  >
                    {r.nombre}
                    {r.esMozo && <Badge tone="slate">mozo</Badge>}
                  </button>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void hacer(async () => {
                  const { id } = await pedir("/api/ventas/roles", "POST", { nombre: nuevoRol, copiarDe: rolId || undefined });
                  setNuevoRol("");
                  await cargarRoles();
                  setRolId(id);
                }, "Rol creado");
              }}
              className="flex gap-2 border-t border-slate-100 p-3"
            >
              <Input value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} placeholder="Rol nuevo" aria-label="Nombre del rol nuevo" />
              <Button type="submit" variant="ghost" disabled={!nuevoRol.trim()} aria-label="Crear rol copiando el elegido" title="Copia los permisos del rol elegido">
                <Plus size={16} aria-hidden />
              </Button>
            </form>
          </Panel>

          {borrador && (
            <Panel>
              <PanelHeader
                titulo={`Permisos de ${rolElegido?.nombre}`}
                descripcion={rolElegido?.fudoId ? "Importado de Fudo. Los permisos de Fudo que este módulo todavía no usa se conservan." : undefined}
                action={
                  <Button
                    variant="danger"
                    onClick={() =>
                      void hacer(async () => {
                        await pedir(`/api/ventas/roles/${borrador.id}`, "DELETE");
                        setRolId("");
                        await cargarRoles();
                      }, "Rol borrado")
                    }
                  >
                    <Trash2 size={15} aria-hidden />
                    Borrar
                  </Button>
                }
              />
              <div className="flex flex-col gap-5 p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="min-w-[12rem] flex-1">
                    <Label>Nombre</Label>
                    <Input value={borrador.nombre} onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} />
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox checked={borrador.esMozo} onChange={(e) => setBorrador({ ...borrador, esMozo: e.target.checked })} />
                    Atiende mesas (es mozo)
                  </label>
                </div>
                {grupos.map((g) => (
                  <fieldset key={g}>
                    <legend className="mb-2 text-xs font-semibold text-slate-500">{g}</legend>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {catalogo
                        .filter((p) => p.grupo === g)
                        .map((p) => {
                          const tiene = borrador.permisos.includes(p.codigo);
                          return (
                            <label key={p.codigo} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-slate-50">
                              <Checkbox
                                checked={tiene}
                                onChange={() =>
                                  setBorrador({
                                    ...borrador,
                                    permisos: tiene ? borrador.permisos.filter((x) => x !== p.codigo) : [...borrador.permisos, p.codigo],
                                  })
                                }
                              />
                              {p.etiqueta}
                            </label>
                          );
                        })}
                    </div>
                  </fieldset>
                ))}
                <Button
                  disabled={!cambiado}
                  onClick={() =>
                    void hacer(async () => {
                      await pedir(`/api/ventas/roles/${borrador.id}`, "PATCH", { nombre: borrador.nombre, esMozo: borrador.esMozo, permisos: borrador.permisos });
                      await cargarRoles();
                    }, "Permisos guardados")
                  }
                >
                  <Check size={16} aria-hidden />
                  Guardar permisos
                </Button>
              </div>
            </Panel>
          )}
        </div>
      )}

      {roles && (
        <Panel>
          <PanelHeader
            titulo="Quién tiene cada rol"
            descripcion="Por local. Sin rol asignado, cada persona usa el que le toca por su rol en Pulso: encargados, Encargado; empleados, Camarero."
          />
          {[...new Set(empleados.map((e) => e.local))].sort().map((local) => {
            const delLocal = empleados.filter((e) => e.local === local);
            return (
              <section key={local} className="border-t border-slate-100 first:border-t-0">
                <h3 className="flex items-center justify-between bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                  {local}
                  <span className="font-normal text-slate-500">
                    {delLocal.length} {delLocal.length === 1 ? "persona" : "personas"}
                  </span>
                </h3>
                <ul className="divide-y divide-slate-100">
                  {delLocal.map((e) => (
                    <li key={e.id} className="grid items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_15rem]">
                      <span className="min-w-0 truncate font-medium">{e.nombre}</span>
                      <Select
                        aria-label={`Rol de ventas de ${e.nombre}`}
                        value={e.rolVentaId ?? ""}
                        onChange={(ev) =>
                          void hacer(async () => {
                            await pedir("/api/ventas/roles", "PATCH", { empleadoId: e.id, rolVentaId: ev.target.value || null });
                            setEmpleados((lista) => lista.map((x) => (x.id === e.id ? { ...x, rolVentaId: ev.target.value || null } : x)));
                          }, `Rol de ${e.nombre} actualizado`)
                        }
                      >
                        <option value="">Automático: {ROL_POR_DEFECTO[e.rol] ?? "—"}</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre}
                          </option>
                        ))}
                      </Select>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </Panel>
      )}

      {localMedios && (
        <PropinaSugerida key={localMedios} localId={localMedios} nombre={locales.find((l) => l.id === localMedios)?.nombre ?? ""} puede={Boolean(permisos.admin_payment_types)} />
      )}

      {localMedios && (
        <Descuentos localId={localMedios} locales={locales.filter((l) => l.medios > 0)} onCambiarLocal={setLocalMedios} permisos={permisos} />
      )}

      {locales.some((l) => l.medios > 0) && (
        <Panel>
          <PanelHeader
            titulo="Medios de pago"
            descripcion="Los que se ofrecen al cobrar."
            action={
              <Select value={localMedios} onChange={(e) => setLocalMedios(e.target.value)} aria-label="Local de los medios de pago">
                {locales
                  .filter((l) => l.medios > 0)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
              </Select>
            }
          />
          <ul className="divide-y divide-slate-100">
            {medios.map((m) => (
              <li key={m.id}>
                <label className="flex min-h-11 items-center gap-3 px-4 text-sm">
                  <Checkbox
                    checked={m.activo}
                    disabled={!permisos.admin_payment_types}
                    onChange={() =>
                      void hacer(async () => {
                        await pedir("/api/ventas/medios", "PATCH", { id: m.id, activo: !m.activo });
                        setMedios((lista) => lista.map((x) => (x.id === m.id ? { ...x, activo: !m.activo } : x)));
                      }, `${m.nombre}: ${m.activo ? "desactivado" : "activado"}`)
                    }
                  />
                  {m.nombre}
                </label>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

type Plantilla = { id: string; nombre: string; porcentaje: number | null; monto: number | null; tope: number | null; activo: boolean };

const aNumero = (t: string) => Number(t.trim().replace(/\./g, "").replace(",", ".")) || 0;
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/**
 * La lista de descuentos del local, como en Fudo: el admin los arma una vez
 * y el mozo los elige al cobrar, sin inventar números.
 */
function Descuentos({
  localId,
  locales,
  onCambiarLocal,
  permisos,
}: {
  localId: string;
  locales: { id: string; nombre: string }[];
  onCambiarLocal: (id: string) => void;
  permisos: Record<string, boolean>;
}) {
  const [lista, setLista] = useState<Plantilla[]>([]);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"pct" | "monto">("pct");
  const [valor, setValor] = useState("");
  const [tope, setTope] = useState("");
  const [error, setError] = useState("");
  const puede = permisos.admin_discount_templates;

  const cargar = useCallback(async () => {
    const d = await pedir(`/api/ventas/descuentos?localId=${localId}`);
    setLista(d.descuentos);
  }, [localId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al cambiar de local
    cargar().catch(() => setLista([]));
  }, [cargar]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await pedir("/api/ventas/descuentos", "POST", {
        localId,
        nombre,
        porcentaje: tipo === "pct" ? aNumero(valor) : null,
        monto: tipo === "monto" ? aNumero(valor) : null,
        tope: tipo === "pct" && aNumero(tope) > 0 ? aNumero(tope) : null,
      });
      setNombre("");
      setValor("");
      setTope("");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    }
  }

  async function cambiar(accion: () => Promise<unknown>) {
    setError("");
    try {
      await accion();
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo");
    }
  }

  return (
    <Panel>
      <PanelHeader
        titulo="Descuentos"
        descripcion="Los que el mozo elige de la lista, para la venta entera o para un producto. Un porcentaje puede tener tope."
        action={
          locales.length > 1 ? (
            <Select value={localId} onChange={(e) => onCambiarLocal(e.target.value)} aria-label="Local de los descuentos">
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
      {lista.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">Todavía no hay descuentos en la lista de este local.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lista.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <Checkbox
                  checked={d.activo}
                  disabled={!puede}
                  onChange={() => void cambiar(() => pedir(`/api/ventas/descuentos/${d.id}`, "PATCH", { activo: !d.activo }))}
                />
                <span className={`font-medium ${d.activo ? "" : "text-slate-400 line-through"}`}>{d.nombre}</span>
              </label>
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">
                {d.porcentaje ? `${d.porcentaje}%${d.tope ? ` · tope ${pesos(d.tope)}` : ""}` : pesos(d.monto ?? 0)}
              </span>
              {puede && (
                <button
                  type="button"
                  onClick={() => void cambiar(() => pedir(`/api/ventas/descuentos/${d.id}`, "DELETE"))}
                  aria-label={`Borrar ${d.nombre}`}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puede && (
        <form onSubmit={crear} className="flex flex-wrap items-end gap-2 border-t border-slate-100 p-4">
          <div className="min-w-[12rem] flex-1">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Empleado, Cliente frecuente, Cortesía…" />
          </div>
          <div className="flex min-h-11 items-center rounded-lg border border-slate-200 p-0.5">
            {(["pct", "monto"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                aria-pressed={tipo === t}
                className={`min-h-9 rounded-md px-3 text-sm font-semibold ${tipo === t ? "bg-violet-600 text-white" : "text-slate-500"}`}
              >
                {t === "pct" ? "%" : "$"}
              </button>
            ))}
          </div>
          <div className="w-24">
            <Label>{tipo === "pct" ? "Porcentaje" : "Monto"}</Label>
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          {tipo === "pct" && (
            <div className="w-28">
              <Label>Tope (opcional)</Label>
              <Input inputMode="decimal" value={tope} onChange={(e) => setTope(e.target.value)} placeholder="Sin tope" />
            </div>
          )}
          <Button type="submit" disabled={!nombre.trim() || !valor}>
            <Plus size={16} aria-hidden />
            Agregar
          </Button>
        </form>
      )}
      {error && <p className="px-4 pb-3 text-sm text-rose-600">{error}</p>}
    </Panel>
  );
}

/** La propina sugerida que se imprime en la precuenta, como en Fudo. */
function PropinaSugerida({ localId, nombre, puede }: { localId: string; nombre: string; puede: boolean }) {
  const [pct, setPct] = useState("");
  const [guardada, setGuardada] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    pedir(`/api/ventas/local?localId=${localId}`)
      .then((d) => {
        const v = d.propinaSugeridaPct ? String(d.propinaSugeridaPct) : "";
        setPct(v);
        setGuardada(v);
      })
      .catch((e: Error) => setError(e.message));
  }, [localId]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await pedir("/api/ventas/local", "PATCH", { localId, propinaSugeridaPct: pct ? Number(pct.replace(",", ".")) : null });
      setGuardada(pct);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  return (
    <Panel>
      <PanelHeader
        titulo="Propina sugerida"
        descripcion={`Se imprime al pie de la precuenta de ${nombre}: el porcentaje, cuánto es y el total con propina. Vacío, no se imprime.`}
      />
      <form onSubmit={guardar} className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-32">
          <Label>Porcentaje</Label>
          <Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="10" disabled={!puede} />
        </div>
        <Button type="submit" variant="ghost" disabled={!puede || guardada === null || pct === guardada}>
          Guardar
        </Button>
        {guardada !== null && pct === guardada && guardada && <p className="pb-3 text-sm text-emerald-700">Sale en la precuenta: {guardada}%</p>}
        <ErrorText>{error}</ErrorText>
      </form>
    </Panel>
  );
}
