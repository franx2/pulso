"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, Bell, Check, KeyRound, Link as LinkIcon, Lock, Pencil, Plus, Search, X } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ErrorText,
  Input,
  Label,
  Modal,
  PageTitle,
  Panel,
  Select,
  SelectorSegmentado,
} from "@/components/ui";
import { SelectorLocal } from "@/components/BarraContexto";
import { ITEMS, RANGO } from "@/components/BottomNav";
import { claveDiaAR, hoyAR } from "@/lib/fechaAR";

/**
 * Equipo: todas las personas que usan Pulso, en una sola tabla.
 *
 * Antes eran grupos por sucursal cerrados de entrada, y para cambiarle el rol
 * a alguien había que abrir su sucursal, buscarlo y abrir su tarjeta. Ahora
 * se busca por nombre, se filtra por sucursal o rol, y lo de todos los días
 * —rol, categoría— se cambia en la misma fila. Lo demás está en "Editar".
 */

type Rol = "ADMIN" | "ENCARGADO" | "EMPLEADO";
type Local = { id: string; nombre: string };
type Categoria = { id: string; nombre: string };
type Empleado = {
  id: string;
  usuario: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  activo: boolean;
  localId: string;
  local: Local;
  categoria: Categoria | null;
  precioHora: number | null;
  asignaciones: { local: Local }[];
  credenciales: { id: string }[];
  invitaciones: { token: string }[];
  tieneContrasena: boolean;
  ultimoFichaje: { timestamp: string; tipo: string } | null;
  /** Pidió la cuenta desde la pantalla de ingreso y espera activación. */
  pendienteDesde: string | null;
};

const ETIQUETA_ROL: Record<Rol, string> = { ADMIN: "Admin", ENCARGADO: "Encargado", EMPLEADO: "Empleado" };
const DESCRIPCION_ROL: Record<Rol, string> = {
  EMPLEADO: "Ficha entrada y salida, y ve sus horas",
  ENCARGADO: "Además arma turnos, ve la presencia y aprueba correcciones",
  ADMIN: "Todo, incluidas las ventas, las compras y la configuración",
};

type Pestana = "usuarios" | "roles";
type Edicion = { tipo: "nuevo" } | { tipo: "editar"; empleado: Empleado };

const celda = "px-3 py-2.5 align-middle";
const selectChico = "w-auto! py-1.5 text-sm";

function cuandoFicho(f: Empleado["ultimoFichaje"]) {
  if (!f) return "Nunca fichó";
  const dia = claveDiaAR(f.timestamp);
  const hora = new Date(f.timestamp).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  if (dia === hoyAR()) return `Hoy ${hora}`;
  const [, m, d] = dia.split("-");
  return `${d}/${m} ${hora}`;
}

function acceso(e: Empleado): { texto: string; tono: "emerald" | "amber" | "slate" } {
  if (e.credenciales.length > 0) return { texto: e.tieneContrasena ? "Passkey y contraseña" : "Passkey", tono: "emerald" };
  if (e.tieneContrasena) return { texto: "Contraseña", tono: "emerald" };
  if (e.invitaciones[0]) return { texto: "Invitación pendiente", tono: "amber" };
  return { texto: "Sin acceso", tono: "amber" };
}

export default function EmpleadosClient() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [locales, setLocales] = useState<Local[]>([]);
  const [categoriasPorLocal, setCategoriasPorLocal] = useState<Record<string, Categoria[]>>({});
  const [cargado, setCargado] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("usuarios");

  const [busqueda, setBusqueda] = useState("");
  const [filtroLocal, setFiltroLocal] = useState("");
  const [filtroRol, setFiltroRol] = useState<Rol | "">("");
  const [verInactivos, setVerInactivos] = useState(false);

  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [passwordGenerada, setPasswordGenerada] = useState<{ nombre: string; password: string } | null>(null);

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [precioMasivo, setPrecioMasivo] = useState("");
  const [aplicandoMasivo, setAplicandoMasivo] = useState(false);

  async function cargar() {
    const [resEmpleados, resLocales] = await Promise.all([fetch("/api/empleados"), fetch("/api/locales")]);
    const dataEmpleados = await resEmpleados.json();
    const listaLocales: Local[] = (await resLocales.json()).locales ?? [];
    setEmpleados(dataEmpleados.empleados ?? []);
    setLocales(listaLocales);
    // Las categorías son por local: se traen todas juntas, no una por fila.
    const entradas = await Promise.all(
      listaLocales.map(async (l) => {
        const d = await (await fetch(`/api/locales/${l.id}/categorias`)).json();
        return [l.id, d.categorias ?? []] as const;
      })
    );
    setCategoriasPorLocal(Object.fromEntries(entradas));
    setCargado(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar();
  }, []);

  async function actualizar(id: string, cambios: Record<string, unknown>): Promise<boolean> {
    setError("");
    const res = await fetch(`/api/empleados/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo actualizar");
      return false;
    }
    if (data.token) setLink(`${window.location.origin}/registro/${data.token}`);
    await cargar();
    return true;
  }

  async function ponerContrasena(e: Empleado) {
    setError("");
    setPasswordGenerada(null);
    const res = await fetch(`/api/empleados/${e.id}/password`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "No se pudo generar la contraseña");
    setPasswordGenerada({ nombre: e.nombre, password: data.password });
    cargar();
  }

  async function aplicarPrecioMasivo() {
    const precio = Number(precioMasivo);
    if (!(precio >= 0) || seleccion.size === 0) return;
    setAplicandoMasivo(true);
    setError("");
    const res = await fetch("/api/empleados/precio-masivo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empleadoIds: [...seleccion], precioHora: precio }),
    });
    const data = await res.json();
    setAplicandoMasivo(false);
    if (!res.ok) return setError(data.error ?? "No se pudo aplicar el precio");
    setSeleccion(new Set());
    setPrecioMasivo("");
    cargar();
  }

  const visibles = useMemo(() => {
    const q = busqueda
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    const sin = (s: string | null | undefined) =>
      (s ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
    return empleados
      .filter((e) => !e.pendienteDesde)
      .filter((e) => verInactivos || e.activo)
      .filter((e) => !filtroRol || e.rol === filtroRol)
      .filter((e) => !filtroLocal || e.localId === filtroLocal || e.asignaciones.some((a) => a.local.id === filtroLocal))
      .filter(
        (e) =>
          !q ||
          [e.nombre, e.usuario, e.email, e.categoria?.nombre, e.local.nombre].some((campo) => sin(campo).includes(q))
      )
      .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, "es"));
  }, [empleados, busqueda, filtroLocal, filtroRol, verInactivos]);

  const pendientes = empleados.filter((e) => e.pendienteDesde && !e.activo);
  const inactivos = empleados.filter((e) => !e.activo && !e.pendienteDesde).length;
  const todosMarcados = visibles.length > 0 && visibles.every((e) => seleccion.has(e.id));

  function alternarSeleccion(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        subtitle="Usuarios, roles, sucursales y acceso"
        actions={
          <Button onClick={() => setEdicion({ tipo: "nuevo" })}>
            <Plus size={16} aria-hidden />
            Nuevo usuario
          </Button>
        }
      >
        Equipo
      </PageTitle>

      <div className="scrollbar-hidden overflow-x-auto">
        <SelectorSegmentado
          label="Sección de Equipo"
          valor={pestana}
          onChange={setPestana}
          opciones={[
            { clave: "usuarios", label: "Usuarios" },
            { clave: "roles", label: "Roles y permisos" },
          ]}
        />
      </div>

      <ErrorText>{error}</ErrorText>

      {link && (
        <Aviso onCerrar={() => setLink("")}>
          <LinkIcon size={16} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden />
          <p>
            Compartí este link para que registre su Face ID / huella:{" "}
            <a href={link} className="break-all font-medium underline">
              {link}
            </a>
          </p>
        </Aviso>
      )}
      {passwordGenerada && (
        <Aviso onCerrar={() => setPasswordGenerada(null)}>
          <Lock size={16} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden />
          <p>
            Contraseña de <strong>{passwordGenerada.nombre}</strong>: se muestra una sola vez, pasásela ahora —{" "}
            <span className="font-mono font-bold">{passwordGenerada.password}</span>
          </p>
        </Aviso>
      )}

      {pendientes.length > 0 && (
        <Panel className="border-amber-300 bg-amber-50/60">
          <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-3">
            <Bell size={16} className="text-amber-700" aria-hidden />
            <h2 className="font-semibold text-amber-950">
              {pendientes.length === 1 ? "1 persona espera" : `${pendientes.length} personas esperan`} que actives su cuenta
            </h2>
          </div>
          <ul className="divide-y divide-amber-200/70">
            {pendientes.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{e.nombre}</p>
                  <p className="text-sm text-slate-600">
                    @{e.usuario} · {e.local.nombre}
                    {e.email && ` · ${e.email}`} · pidió la cuenta el {new Date(e.pendienteDesde!).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" className="py-1.5 text-sm" onClick={() => setEdicion({ tipo: "editar", empleado: e })}>
                    Revisar
                  </Button>
                  <Button className="py-1.5 text-sm" onClick={() => actualizar(e.id, { activo: true })}>
                    <Check size={15} aria-hidden />
                    Activar como Empleado
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {pestana === "roles" ? (
        <RolesYPermisos empleados={empleados} />
      ) : (
        <>
          <Panel className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="sm:w-72">
                  <p className="mb-2 text-xs font-semibold text-slate-500">Buscar</p>
                  <label className="relative block">
                    <span className="sr-only">Buscar por nombre, usuario, email o categoría</span>
                    <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Nombre, usuario o email"
                      className="pl-9"
                    />
                  </label>
                </div>
                {locales.length > 1 && (
                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-semibold text-slate-500">Sucursal</p>
                    <SelectorLocal locales={locales} valor={filtroLocal} onChange={setFiltroLocal} todos="Todas" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-xs font-semibold text-slate-500">Rol</p>
                <SelectorSegmentado
                  label="Filtrar por rol"
                  valor={filtroRol}
                  onChange={setFiltroRol}
                  opciones={[
                    { clave: "", label: "Todos" },
                    { clave: "ADMIN", label: "Admin" },
                    { clave: "ENCARGADO", label: "Encargado" },
                    { clave: "EMPLEADO", label: "Empleado" },
                  ]}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                {visibles.length} de {empleados.filter((e) => !e.pendienteDesde && (verInactivos || e.activo)).length} usuarios
              </span>
              {inactivos > 0 && (
                <label className="inline-flex items-center gap-2">
                  <Checkbox checked={verInactivos} onChange={() => setVerInactivos((v) => !v)} />
                  Mostrar {inactivos === 1 ? "1 inactivo" : `${inactivos} inactivos`}
                </label>
              )}
            </div>
          </Panel>

          {seleccion.size > 0 && (
            <Panel className="flex flex-wrap items-center gap-2 border-emerald-200 bg-emerald-50 p-3">
              <Banknote size={16} className="shrink-0 text-emerald-700" aria-hidden />
              <span className="text-sm font-semibold">
                {seleccion.size} {seleccion.size === 1 ? "seleccionado" : "seleccionados"}
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Precio/hora"
                aria-label="Precio por hora para los seleccionados"
                value={precioMasivo}
                onChange={(e) => setPrecioMasivo(e.target.value)}
                className="w-36! py-1.5 text-sm"
              />
              <Button onClick={aplicarPrecioMasivo} disabled={aplicandoMasivo || !precioMasivo} className="py-1.5 text-sm">
                {aplicandoMasivo ? "Aplicando…" : "Aplicar precio/hora"}
              </Button>
              <Button variant="ghost" onClick={() => setSeleccion(new Set())} className="py-1.5 text-sm">
                Cancelar
              </Button>
            </Panel>
          )}

          {!cargado ? (
            <div className="h-64 animate-pulse rounded-lg bg-slate-200/70" aria-label="Cargando equipo" />
          ) : visibles.length === 0 ? (
            <EmptyState>{empleados.length === 0 ? "Todavía no hay usuarios cargados." : "Nadie coincide con la búsqueda y los filtros."}</EmptyState>
          ) : (
            <Panel className="overflow-hidden">
              {/* Escritorio: una tabla; en el celular cada persona es una fila apilada. */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[60rem] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className={`${celda} w-10`}>
                        <Checkbox
                          checked={todosMarcados}
                          onChange={() =>
                            setSeleccion(todosMarcados ? new Set() : new Set(visibles.map((e) => e.id)))
                          }
                          aria-label="Seleccionar todos"
                        />
                      </th>
                      <th className={celda}>Nombre</th>
                      <th className={celda}>Rol</th>
                      <th className={celda}>Sucursal</th>
                      <th className={celda}>Categoría</th>
                      <th className={`${celda} text-right`}>Precio/hora</th>
                      <th className={celda}>Acceso</th>
                      <th className={celda}>Último fichaje</th>
                      <th className={`${celda} w-px`} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibles.map((e) => {
                      const a = acceso(e);
                      return (
                        <tr key={e.id} className={`hover:bg-slate-50/70 ${e.activo ? "" : "opacity-60"}`}>
                          <td className={celda}>
                            <Checkbox checked={seleccion.has(e.id)} onChange={() => alternarSeleccion(e.id)} aria-label={`Seleccionar a ${e.nombre}`} />
                          </td>
                          <td className={celda}>
                            <p className="font-semibold">{e.nombre}</p>
                            <p className="text-xs text-slate-500">
                              @{e.usuario}
                              {!e.activo && " · inactivo"}
                            </p>
                          </td>
                          <td className={celda}>
                            <Select
                              aria-label={`Rol de ${e.nombre}`}
                              value={e.rol}
                              onChange={(ev) => actualizar(e.id, { rol: ev.target.value })}
                              className={selectChico}
                            >
                              <option value="EMPLEADO">Empleado</option>
                              <option value="ENCARGADO">Encargado</option>
                              <option value="ADMIN">Admin</option>
                            </Select>
                          </td>
                          <td className={celda}>
                            <p>{e.local.nombre}</p>
                            {e.asignaciones.length > 0 && (
                              <p className="text-xs text-slate-500">
                                también {e.asignaciones.map((x) => x.local.nombre).join(" · ")}
                              </p>
                            )}
                          </td>
                          <td className={celda}>
                            <Select
                              aria-label={`Categoría de ${e.nombre}`}
                              value={e.categoria?.id ?? ""}
                              onChange={(ev) => actualizar(e.id, { categoriaId: ev.target.value || null })}
                              className={selectChico}
                            >
                              <option value="">Sin categoría</option>
                              {(categoriasPorLocal[e.localId] ?? []).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nombre}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className={`${celda} text-right tabular-nums`}>
                            {e.precioHora != null ? `$${e.precioHora.toLocaleString("es-AR")}` : <span className="text-slate-400">—</span>}
                          </td>
                          <td className={celda}>
                            <Badge tone={a.tono}>{a.texto}</Badge>
                          </td>
                          <td className={`${celda} tabular-nums text-slate-500`}>{cuandoFicho(e.ultimoFichaje)}</td>
                          <td className={`${celda} whitespace-nowrap text-right`}>
                            <Button variant="ghost" className="py-1.5 text-sm" onClick={() => setEdicion({ tipo: "editar", empleado: e })}>
                              <Pencil size={14} aria-hidden />
                              Editar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-slate-100 lg:hidden">
                {visibles.map((e) => {
                  const a = acceso(e);
                  return (
                    <li key={e.id} className={`flex gap-3 px-4 py-3 ${e.activo ? "" : "opacity-60"}`}>
                      <Checkbox checked={seleccion.has(e.id)} onChange={() => alternarSeleccion(e.id)} className="mt-1" aria-label={`Seleccionar a ${e.nombre}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{e.nombre}</p>
                            <p className="truncate text-xs text-slate-500">
                              @{e.usuario} · {e.local.nombre}
                              {e.categoria && ` · ${e.categoria.nombre}`}
                            </p>
                          </div>
                          <Button variant="ghost" className="shrink-0 py-1.5 text-sm" onClick={() => setEdicion({ tipo: "editar", empleado: e })}>
                            <Pencil size={14} aria-hidden />
                            Editar
                          </Button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <Badge tone={e.rol === "EMPLEADO" ? "slate" : "amber"}>{ETIQUETA_ROL[e.rol]}</Badge>
                          <Badge tone={a.tono}>{a.texto}</Badge>
                          {!e.activo && <Badge tone="slate">Inactivo</Badge>}
                          <span className="tabular-nums">{cuandoFicho(e.ultimoFichaje)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </>
      )}

      {edicion && (
        <FichaUsuario
          edicion={edicion}
          locales={locales}
          categoriasPorLocal={categoriasPorLocal}
          onCerrar={() => setEdicion(null)}
          onCreado={(token) => {
            setLink(`${window.location.origin}/registro/${token}`);
            setEdicion(null);
            cargar();
          }}
          onGuardar={async (id, cambios) => {
            const ok = await actualizar(id, cambios);
            if (ok) setEdicion(null);
            return ok;
          }}
          onAccion={async (e, accion) => {
            setEdicion(null);
            if (accion === "passkey") await actualizar(e.id, { reinvitar: true });
            else if (accion === "contrasena") await ponerContrasena(e);
            else if (accion === "rechazar") {
              const res = await fetch(`/api/empleados/${e.id}`, { method: "DELETE" });
              if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "No se pudo rechazar");
              await cargar();
            } else await actualizar(e.id, { activo: !e.activo });
          }}
        />
      )}
    </div>
  );
}

function Aviso({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <div className="flex min-w-0 items-start gap-2">{children}</div>
      <button type="button" onClick={onCerrar} aria-label="Cerrar" className="shrink-0 text-emerald-700">
        <X size={16} />
      </button>
    </div>
  );
}

/** Alta y edición en el mismo formulario: lo que cambia es qué se manda. */
function FichaUsuario({
  edicion,
  locales,
  categoriasPorLocal,
  onCerrar,
  onCreado,
  onGuardar,
  onAccion,
}: {
  edicion: Edicion;
  locales: Local[];
  categoriasPorLocal: Record<string, Categoria[]>;
  onCerrar: () => void;
  onCreado: (token: string) => void;
  onGuardar: (id: string, cambios: Record<string, unknown>) => Promise<boolean>;
  onAccion: (e: Empleado, accion: "passkey" | "contrasena" | "activo" | "rechazar") => void;
}) {
  const e = edicion.tipo === "editar" ? edicion.empleado : null;
  const pendiente = Boolean(e?.pendienteDesde && !e.activo);
  const [usuario, setUsuario] = useState("");
  const [nombre, setNombre] = useState(e?.nombre ?? "");
  const [email, setEmail] = useState(e?.email ?? "");
  const [rol, setRol] = useState<Rol>(e?.rol ?? "EMPLEADO");
  const [localId, setLocalId] = useState(e?.localId ?? locales[0]?.id ?? "");
  const [extras, setExtras] = useState<string[]>(e?.asignaciones.map((a) => a.local.id) ?? []);
  const [categoriaId, setCategoriaId] = useState(e?.categoria?.id ?? "");
  const [precioHora, setPrecioHora] = useState(e?.precioHora != null ? String(e.precioHora) : "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const categorias = categoriasPorLocal[localId] ?? [];

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    setGuardando(true);
    const extrasValidos = extras.filter((id) => id !== localId);
    if (e) {
      const ok = await onGuardar(e.id, {
        nombre,
        rol,
        email: rol === "EMPLEADO" ? "" : email,
        localId,
        localesExtra: extrasValidos,
        categoriaId: categoriaId || null,
        precioHora: precioHora === "" ? null : Number(precioHora),
        // Revisar a un pendiente y guardar es activarlo.
        ...(pendiente ? { activo: true } : {}),
      });
      setGuardando(false);
      if (!ok) setError("No se pudo guardar. Revisá los datos.");
      return;
    }
    const res = await fetch("/api/empleados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, nombre, email, rol, localId, localesExtra: extrasValidos, categoriaId: categoriaId || null }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo crear el usuario");
    onCreado(data.token);
  }

  return (
    <Modal title={pendiente ? `Activar la cuenta de ${e!.nombre}` : e ? `Editar a ${e.nombre}` : "Nuevo usuario"} onClose={onCerrar} maxWidth="max-w-lg">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {!e && (
            <div>
              <Label>Usuario</Label>
              <Input value={usuario} onChange={(ev) => setUsuario(ev.target.value)} required autoComplete="off" placeholder="nombre.apellido" />
            </div>
          )}
          <div className={e ? "sm:col-span-2" : ""}>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(ev) => setNombre(ev.target.value)} required />
          </div>
        </div>

        <div>
          <Label>Rol</Label>
          <div className="flex flex-col gap-1.5">
            {(["EMPLEADO", "ENCARGADO", "ADMIN"] as Rol[]).map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  rol === r
                    ? "border-emerald-600 bg-emerald-50/60"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input type="radio" name="rol" value={r} checked={rol === r} onChange={() => setRol(r)} className="mt-1 accent-emerald-700" />
                <span>
                  <span className="font-semibold">{ETIQUETA_ROL[r]}</span>
                  <span className="block text-xs text-slate-500">{DESCRIPCION_ROL[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {rol !== "EMPLEADO" && (
          <div>
            <Label>Email para avisos</Label>
            <Input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="Sin email: no recibe alertas" />
            <p className="mt-1 text-xs text-slate-500">Le llegan las alertas de tardanzas, faltas y salidas olvidadas.</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Sucursal principal</Label>
            <Select
              value={localId}
              onChange={(ev) => {
                setLocalId(ev.target.value);
                setCategoriaId("");
              }}
            >
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Categoría (puesto)</Label>
            <Select value={categoriaId} onChange={(ev) => setCategoriaId(ev.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {locales.length > 1 && (
          <div>
            <Label>También puede fichar en</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {locales
                .filter((l) => l.id !== localId)
                .map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={extras.includes(l.id)}
                      onChange={() => setExtras((prev) => (prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]))}
                    />
                    {l.nombre}
                  </label>
                ))}
            </div>
          </div>
        )}

        {e && (
          <div className="sm:w-1/2">
            <Label>Precio/hora</Label>
            <Input type="number" min="0" step="0.01" value={precioHora} onChange={(ev) => setPrecioHora(ev.target.value)} placeholder="Sin definir" />
          </div>
        )}

        {e && !pendiente && (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold">Acceso</p>
            <p className="mt-0.5 text-xs text-slate-500">{acceso(e).texto}. Si cambió de celular o se olvidó cómo entrar:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="ghost" className="py-1.5 text-sm" onClick={() => onAccion(e, "passkey")}>
                <KeyRound size={14} aria-hidden />
                Nuevo link de passkey
              </Button>
              <Button type="button" variant="ghost" className="py-1.5 text-sm" onClick={() => onAccion(e, "contrasena")}>
                <Lock size={14} aria-hidden />
                Generar contraseña
              </Button>
            </div>
          </div>
        )}

        <ErrorText>{error}</ErrorText>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          {pendiente ? (
            <Button type="button" variant="danger" onClick={() => onAccion(e!, "rechazar")}>
              Rechazar y borrar
            </Button>
          ) : e ? (
            <Button type="button" variant={e.activo ? "danger" : "ghost"} onClick={() => onAccion(e, "activo")}>
              {e.activo ? "Desactivar usuario" : "Volver a activar"}
            </Button>
          ) : (
            <p className="text-xs text-slate-500">Al crearlo te damos el link para que registre su passkey.</p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              <Check size={16} aria-hidden />
              {guardando ? "Guardando…" : pendiente ? "Activar cuenta" : e ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Qué ve cada rol. No se edita: el permiso lo decide el servidor en cada
 * pantalla según el rol, y una matriz editable que no cambiara eso sería una
 * sensación falsa de control. Esto muestra la regla tal cual se aplica.
 */
function RolesYPermisos({ empleados }: { empleados: Empleado[] }) {
  const roles: Rol[] = ["EMPLEADO", "ENCARGADO", "ADMIN"];
  const grupos = [...new Set(ITEMS.map((i) => i.grupo || "Personal"))];
  const cuantos = (r: Rol) => empleados.filter((e) => e.activo && e.rol === r).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:items-start">
      <Panel>
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Roles</h2>
          <p className="mt-0.5 text-sm text-slate-500">Cada usuario tiene uno; se cambia desde la lista o en Editar.</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {roles.map((r) => (
            <li key={r} className="flex items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-semibold">{ETIQUETA_ROL[r]}</p>
                <p className="text-sm text-slate-500">{DESCRIPCION_ROL[r]}</p>
              </div>
              <Badge tone="slate">{cuantos(r)} activos</Badge>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Qué pantallas ve cada rol</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5">Pantalla</th>
                {roles.map((r) => (
                  <th key={r} className="px-4 py-2.5 text-center">
                    {ETIQUETA_ROL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            {grupos.map((grupo) => (
              <tbody key={grupo} className="divide-y divide-slate-100">
                <tr className="bg-slate-50/60">
                  <th colSpan={4} className="px-4 py-1.5 text-left text-xs font-semibold text-slate-500">
                    {grupo}
                  </th>
                </tr>
                {ITEMS.filter((i) => (i.grupo || "Personal") === grupo).map((item) => (
                  <tr key={item.key}>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <item.Icon size={15} className="text-slate-400" aria-hidden />
                        {item.label}
                      </span>
                    </td>
                    {roles.map((r) => (
                      <td key={r} className="px-4 py-2.5 text-center">
                        {RANGO[r] >= RANGO[item.minimo] ? (
                          <Check size={16} className="mx-auto text-emerald-700" aria-label="Ve" />
                        ) : (
                          <span className="text-slate-300" aria-label="No ve">
                            —
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Panel>
    </div>
  );
}
