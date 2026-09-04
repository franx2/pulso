"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Link as LinkIcon,
  Lock,
  Plus,
  Store,
  UserPlus,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorText,
  Input,
  Label,
  PageTitle,
  Select,
  SectionTitle,
} from "@/components/ui";

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
};

const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: "Admin",
  ENCARGADO: "Encargado",
  EMPLEADO: "Empleado",
};

export default function EmpleadosClient() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [locales, setLocales] = useState<Local[]>([]);
  const [usuario, setUsuario] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<Rol>("EMPLEADO");
  const [localId, setLocalId] = useState("");
  const [localesExtra, setLocalesExtra] = useState<string[]>([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [categoriasPorLocal, setCategoriasPorLocal] = useState<Record<string, Categoria[]>>({});
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [passwordGenerada, setPasswordGenerada] = useState<{ nombre: string; password: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  // Cerrado por local por defecto: con varias sucursales, ver todo el
  // personal mezclado de entrada es más ruido que ayuda.
  const [localesAbiertos, setLocalesAbiertos] = useState<Set<string>>(new Set());

  // Carga masiva de precio/hora: modo selección + valor a aplicar.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [precioMasivo, setPrecioMasivo] = useState("");
  const [aplicandoMasivo, setAplicandoMasivo] = useState(false);

  async function cargar() {
    const [resEmpleados, resLocales] = await Promise.all([
      fetch("/api/empleados"),
      fetch("/api/locales"),
    ]);
    const dataEmpleados = await resEmpleados.json();
    const dataLocales = await resLocales.json();
    const listaLocales: Local[] = dataLocales.locales ?? [];
    setEmpleados(dataEmpleados.empleados ?? []);
    setLocales(listaLocales);
    if (!localId && listaLocales[0]) setLocalId(listaLocales[0].id);

    // Las categorías son por local: se traen todas juntas para no pedirlas
    // de a una por cada tarjeta de empleado.
    const entradas = await Promise.all(
      listaLocales.map(async (l) => {
        const r = await fetch(`/api/locales/${l.id}/categorias`);
        const d = await r.json();
        return [l.id, d.categorias ?? []] as const;
      })
    );
    setCategoriasPorLocal(Object.fromEntries(entradas));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un grupo por sucursal de origen (el mismo empleado puede tener otras
  // asignadas además de ésta; se ve en su badge de sucursales).
  const gruposPorLocal = useMemo(() => {
    const grupos = new Map<string, Empleado[]>();
    for (const l of locales) grupos.set(l.id, []);
    for (const e of empleados) {
      const lista = grupos.get(e.localId);
      if (lista) lista.push(e);
      else grupos.set(e.localId, [e]);
    }
    return grupos;
  }, [locales, empleados]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLink("");
    setCargando(true);
    const res = await fetch("/api/empleados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, nombre, email, rol, localId, localesExtra, categoriaId: categoriaId || null }),
    });
    const data = await res.json();
    setCargando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear el empleado");
      return;
    }
    setLink(`${window.location.origin}/registro/${data.token}`);
    setUsuario("");
    setNombre("");
    setEmail("");
    setRol("EMPLEADO");
    setLocalesExtra([]);
    setCategoriaId("");
    setAbierto(false);
    cargar();
  }

  async function actualizar(id: string, cambios: Record<string, unknown>) {
    setError("");
    const res = await fetch(`/api/empleados/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo actualizar");
      return;
    }
    if (data.token) setLink(`${window.location.origin}/registro/${data.token}`);
    cargar();
  }

  async function ponerContrasena(e: Empleado) {
    setError("");
    setPasswordGenerada(null);
    const res = await fetch(`/api/empleados/${e.id}/password`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo generar la contraseña");
      return;
    }
    setPasswordGenerada({ nombre: e.nombre, password: data.password });
  }

  function toggleLocalAbierto(id: string) {
    setLocalesAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExtra(id: string) {
    setLocalesExtra((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSeleccion(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    if (!res.ok) {
      setError(data.error ?? "No se pudo aplicar el precio");
      return;
    }
    setSeleccion(new Set());
    setPrecioMasivo("");
    cargar();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        subtitle="Alta de personal, roles y sucursales"
        actions={
          <Button onClick={() => setAbierto((v) => !v)}>
            {abierto ? <X size={16} /> : <Plus size={16} />}
            {abierto ? "Cerrar" : "Nuevo"}
          </Button>
        }
      >
        Empleados
      </PageTitle>

      {abierto && (
        <Card>
          <SectionTitle>Nuevo empleado</SectionTitle>
          <form onSubmit={crear} className="flex flex-col gap-3">
          <div>
            <Label>Usuario</Label>
            <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
          </div>
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>
          <div>
            <Label>Rol</Label>
            <Select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="EMPLEADO">Empleado — sólo ficha</option>
              <option value="ENCARGADO">Encargado — turnos, presencia y aprobaciones</option>
              <option value="ADMIN">Admin — todo, incluida la configuración</option>
            </Select>
          </div>
          {rol !== "EMPLEADO" && (
            <div>
              <Label>Email para avisos</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="encargado@restaurante.com"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-[#94a19c]">
                Le llegan las alertas de tardanzas, faltas y salidas olvidadas.
              </p>
            </div>
          )}
          {locales.length > 1 && (
            <>
              <div>
                <Label>Sucursal principal</Label>
                <Select value={localId} onChange={(e) => setLocalId(e.target.value)}>
                  {locales.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>También puede fichar en</Label>
                <p className="mb-1.5 text-xs text-slate-500 dark:text-[#94a19c]">
                  El usuario es único en todo el negocio: esta misma cuenta ficha en cualquiera de las
                  sucursales que marques acá, sin crear un alta por local.
                </p>
                <div className="flex flex-col gap-1.5">
                  {locales
                    .filter((l) => l.id !== localId)
                    .map((l) => (
                      <label key={l.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={localesExtra.includes(l.id)}
                          onChange={() => toggleExtra(l.id)}
                        />
                        {l.nombre}
                      </label>
                    ))}
                </div>
              </div>
            </>
          )}
          <div>
            <Label>Categoría (puesto)</Label>
            <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sin categoría</option>
              {(categoriasPorLocal[localId] ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500 dark:text-[#94a19c]">
              Se administran desde Ajustes → la sucursal → Categorías de empleado.
            </p>
          </div>
          <Button type="submit" disabled={cargando} className="mt-1">
            <UserPlus size={16} />
            {cargando ? "Creando…" : "Crear empleado"}
          </Button>
          <ErrorText>{error}</ErrorText>
          </form>
        </Card>
      )}

      {link && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-[#2f6b55] dark:bg-[#122620]">
          <LinkIcon size={16} className="mt-0.5 shrink-0 text-emerald-700 dark:text-[#4ee6b0]" />
          <p>
            Compartí este link para que registre su Face ID / huella:{" "}
            <a href={link} className="break-all font-medium underline">
              {link}
            </a>
          </p>
        </div>
      )}

      {passwordGenerada && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-[#2f6b55] dark:bg-[#122620]">
          <p>
            Contraseña de <strong>{passwordGenerada.nombre}</strong>: se muestra una sola vez, pasásela
            ahora — <span className="font-mono font-bold">{passwordGenerada.password}</span>
          </p>
          <button
            type="button"
            onClick={() => setPasswordGenerada(null)}
            aria-label="Cerrar"
            className="shrink-0 text-emerald-700 dark:text-[#4ee6b0]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {seleccion.size > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-emerald-200 bg-emerald-50 dark:border-[#2f6b55] dark:bg-[#122620]">
          <Banknote size={16} className="shrink-0 text-emerald-700 dark:text-[#4ee6b0]" />
          <span className="text-sm font-semibold">
            {seleccion.size} {seleccion.size === 1 ? "empleado" : "empleados"} seleccionados
          </span>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Precio/hora"
            value={precioMasivo}
            onChange={(e) => setPrecioMasivo(e.target.value)}
            className="w-auto! py-1.5 text-sm"
          />
          <Button onClick={aplicarPrecioMasivo} disabled={aplicandoMasivo || !precioMasivo} className="py-1.5 text-sm">
            {aplicandoMasivo ? "Aplicando…" : "Aplicar a seleccionados"}
          </Button>
          <Button variant="ghost" onClick={() => setSeleccion(new Set())} className="py-1.5 text-sm">
            Cancelar
          </Button>
        </Card>
      )}

      {empleados.length === 0 ? (
        <EmptyState>Todavía no hay empleados cargados</EmptyState>
      ) : (
        locales.map((local) => {
          const delLocal = gruposPorLocal.get(local.id) ?? [];
          if (delLocal.length === 0) return null;
          const abierto = localesAbiertos.has(local.id);
          return (
            <div key={local.id}>
              <button
                type="button"
                onClick={() => toggleLocalAbierto(local.id)}
                className="flex w-full items-center gap-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412]"
              >
                {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <SectionTitle>
                  <span className="inline-flex items-center gap-1.5">
                    <Store size={14} />
                    {local.nombre} ({delLocal.length})
                  </span>
                </SectionTitle>
              </button>
              {abierto && (
              <div className="flex flex-col gap-2 md:gap-1.5">
                {delLocal.map((e) => (
                  <Card key={e.id} className="flex flex-col gap-3 md:p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <Checkbox
                          checked={seleccion.has(e.id)}
                          onChange={() => toggleSeleccion(e.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{e.nombre}</p>
                          <p className="truncate text-sm text-slate-500 dark:text-[#94a19c]">@{e.usuario}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => actualizar(e.id, { activo: !e.activo })}
                        className="shrink-0"
                      >
                        {e.activo ? "Desactivar" : "Activar"}
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={e.rol === "EMPLEADO" ? "slate" : "amber"}>{ETIQUETA_ROL[e.rol]}</Badge>
                      {e.categoria && <Badge tone="slate">{e.categoria.nombre}</Badge>}
                      <Badge tone={e.credenciales.length > 0 ? "emerald" : "amber"}>
                        {e.credenciales.length > 0
                          ? "Passkey registrada"
                          : e.invitaciones[0]
                            ? "Invitación pendiente"
                            : "Sin invitación"}
                      </Badge>
                      <Badge tone={e.activo ? "emerald" : "slate"}>{e.activo ? "Activo" : "Inactivo"}</Badge>
                      {e.asignaciones.length > 0 && (
                        <Badge tone="slate">
                          <span className="inline-flex items-center gap-1">
                            <Store size={11} />
                            también en {e.asignaciones.map((a) => a.local.nombre).join(" · ")}
                          </span>
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={e.rol}
                        onChange={(ev) => actualizar(e.id, { rol: ev.target.value })}
                        className="w-auto! py-1.5 text-sm"
                      >
                        <option value="EMPLEADO">Empleado</option>
                        <option value="ENCARGADO">Encargado</option>
                        <option value="ADMIN">Admin</option>
                      </Select>
                      <Select
                        value={e.categoria?.id ?? ""}
                        onChange={(ev) => actualizar(e.id, { categoriaId: ev.target.value || null })}
                        className="w-auto! py-1.5 text-sm"
                      >
                        <option value="">Sin categoría</option>
                        {(categoriasPorLocal[e.localId] ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="ghost"
                        className="py-1.5 text-xs"
                        onClick={() => actualizar(e.id, { reinvitar: true })}
                      >
                        <KeyRound size={14} />
                        Regenerar passkey
                      </Button>
                      <Button
                        variant="ghost"
                        className="py-1.5 text-xs"
                        onClick={() => ponerContrasena(e)}
                      >
                        <Lock size={14} />
                        Poner contraseña
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <Label>Precio/hora</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={e.precioHora ?? ""}
                          placeholder="Sin definir"
                          className="w-auto! py-1.5 text-sm"
                          onBlur={(ev) => {
                            const valor = ev.target.value === "" ? null : Number(ev.target.value);
                            if (valor !== e.precioHora) actualizar(e.id, { precioHora: valor });
                          }}
                        />
                      </div>
                      {e.rol !== "EMPLEADO" && (
                        <div className="min-w-[14rem] flex-1">
                          <Label>Email para avisos</Label>
                          <Input
                            type="email"
                            defaultValue={e.email ?? ""}
                            placeholder="Sin email: no recibe alertas"
                            className="py-1.5 text-sm"
                            onBlur={(ev) => {
                              if (ev.target.value !== (e.email ?? "")) actualizar(e.id, { email: ev.target.value });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
