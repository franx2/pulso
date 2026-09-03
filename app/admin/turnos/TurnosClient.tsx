"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, List, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorText,
  IconButton,
  Input,
  Label,
  PageTitle,
  Select,
  SectionTitle,
  useConfirm,
} from "@/components/ui";
import { formatearFechaSql } from "@/lib/fechas";
import SemanaGantt from "./SemanaGantt";

type Empleado = {
  id: string;
  nombre: string;
  localId: string;
  asignaciones: { local: { id: string } }[];
};
type Local = { id: string; nombre: string };
type Turno = {
  id: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  empleado?: { nombre: string };
  local?: { nombre: string };
};

/**
 * Convierte fecha + "HH:MM" al instante absoluto, usando la zona horaria del
 * navegador (que es la del local). El servidor guarda esto y no necesita saber
 * nada de zonas horarias para calcular tardanzas.
 */
function instante(fecha: string, hhmm: string, sumarDia = false): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d + (sumarDia ? 1 : 0), hh, mm, 0, 0).toISOString();
}

/** N días después de `base` ("YYYY-MM-DD"), como fecha local (no UTC). */
function fechaMasDias(base: string, dias: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, m - 1, d + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

type DiaIndividual = { activo: boolean; horaInicio: string; horaFin: string };
const DIA_INICIAL = (): DiaIndividual => ({ activo: true, horaInicio: "09:00", horaFin: "17:00" });

export default function TurnosClient() {
  const [vista, setVista] = useState<"lista" | "semana">("lista");
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [locales, setLocales] = useState<Local[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [localId, setLocalId] = useState("");
  const [fecha, setFecha] = useState("");
  const [horaInicioDefault, setHoraInicioDefault] = useState("09:00");
  const [horaFinDefault, setHoraFinDefault] = useState("17:00");
  // Empleado -> su horario propio para este turno (puede diferir del default).
  const [seleccion, setSeleccion] = useState<Record<string, { horaInicio: string; horaFin: string }>>({});
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { confirm, dialog } = useConfirm();

  // Modo individual: un empleado, toda la semana de una vez.
  const [modo, setModo] = useState<"grupo" | "individual">("grupo");
  const [empIndividualId, setEmpIndividualId] = useState("");
  const [desdeIndividual, setDesdeIndividual] = useState("");
  const [diasIndividual, setDiasIndividual] = useState<DiaIndividual[]>(
    Array.from({ length: 7 }, DIA_INICIAL)
  );
  const [errorIndividual, setErrorIndividual] = useState("");
  const [cargandoIndividual, setCargandoIndividual] = useState(false);

  async function cargar() {
    const [resEmpleados, resTurnos, resLocales] = await Promise.all([
      fetch("/api/empleados"),
      fetch("/api/turnos"),
      fetch("/api/locales"),
    ]);
    const dataEmpleados = await resEmpleados.json();
    const dataTurnos = await resTurnos.json();
    const dataLocales = await resLocales.json();
    setEmpleados(dataEmpleados.empleados ?? []);
    setTurnos(dataTurnos.turnos ?? []);
    setLocales(dataLocales.locales ?? []);
    if (!localId && dataLocales.locales?.[0]) setLocalId(dataLocales.locales[0].id);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sólo se ofrecen empleados que trabajan en la sucursal elegida (principal o asignada).
  const empleadosDelLocal = useMemo(
    () =>
      empleados.filter(
        (e) => e.localId === localId || e.asignaciones.some((a) => a.local.id === localId)
      ),
    [empleados, localId]
  );

  function toggleEmpleado(id: string, marcado: boolean) {
    setSeleccion((prev) => {
      const next = { ...prev };
      if (marcado) next[id] = { horaInicio: horaInicioDefault, horaFin: horaFinDefault };
      else delete next[id];
      return next;
    });
  }

  function actualizarHorario(id: string, cambios: Partial<{ horaInicio: string; horaFin: string }>) {
    setSeleccion((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const ids = Object.keys(seleccion);
    if (ids.length === 0) return setError("Elegí al menos un empleado");
    if (!fecha) return setError("Elegí la fecha");

    setCargando(true);
    const turnosACrear = ids.map((empleadoId) => {
      const { horaInicio, horaFin } = seleccion[empleadoId];
      const cruzaMedianoche = horaFin <= horaInicio;
      return {
        empleadoId,
        localId,
        fecha,
        horaInicio,
        horaFin,
        inicioAt: instante(fecha, horaInicio),
        finAt: instante(fecha, horaFin, cruzaMedianoche),
      };
    });

    const res = await fetch("/api/turnos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnos: turnosACrear }),
    });
    const data = await res.json();
    setCargando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear el turno");
      return;
    }
    setFecha("");
    setSeleccion({});
    cargar();
  }

  function eliminar(id: string, nombre?: string) {
    confirm({
      title: "Eliminar turno",
      message: `¿Seguro que querés borrar el turno de ${nombre ?? "este empleado"}? No se puede deshacer.`,
      confirmLabel: "Eliminar",
      tone: "danger",
      onConfirm: async () => {
        await fetch(`/api/turnos/${id}`, { method: "DELETE" });
        cargar();
      },
    });
  }

  function actualizarDiaIndividual(offset: number, cambios: Partial<DiaIndividual>) {
    setDiasIndividual((prev) => prev.map((d, i) => (i === offset ? { ...d, ...cambios } : d)));
  }

  async function crearIndividual(e: React.FormEvent) {
    e.preventDefault();
    setErrorIndividual("");
    if (!empIndividualId) return setErrorIndividual("Elegí un empleado");
    if (!desdeIndividual) return setErrorIndividual("Elegí desde qué día arranca la semana");
    const activos = diasIndividual
      .map((d, offset) => ({ ...d, offset }))
      .filter((d) => d.activo);
    if (activos.length === 0) return setErrorIndividual("Marcá al menos un día");

    setCargandoIndividual(true);
    const turnosACrear = activos.map((d) => {
      const fecha = fechaMasDias(desdeIndividual, d.offset);
      const cruzaMedianoche = d.horaFin <= d.horaInicio;
      return {
        empleadoId: empIndividualId,
        localId,
        fecha,
        horaInicio: d.horaInicio,
        horaFin: d.horaFin,
        inicioAt: instante(fecha, d.horaInicio),
        finAt: instante(fecha, d.horaFin, cruzaMedianoche),
      };
    });

    const res = await fetch("/api/turnos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnos: turnosACrear }),
    });
    const data = await res.json();
    setCargandoIndividual(false);
    if (!res.ok) {
      setErrorIndividual(data.error ?? "No se pudieron crear los turnos");
      return;
    }
    setDesdeIndividual("");
    setDiasIndividual(Array.from({ length: 7 }, DIA_INICIAL));
    cargar();
  }

  const seleccionados = Object.keys(seleccion);
  const NOMBRE_DIA_CORTO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  return (
    <div className="flex flex-col gap-6">
      <PageTitle subtitle="Planificá quién trabaja cada día">Turnos</PageTitle>

      <div className="flex gap-2 rounded-xl bg-slate-100 p-1 dark:bg-[#18201d]">
        <button
          type="button"
          onClick={() => setVista("lista")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition ${
            vista === "lista"
              ? "bg-white shadow-sm dark:bg-[#131816]"
              : "text-slate-500 dark:text-[#94a19c]"
          }`}
        >
          <List size={15} />
          Lista
        </button>
        <button
          type="button"
          onClick={() => setVista("semana")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition ${
            vista === "semana"
              ? "bg-white shadow-sm dark:bg-[#131816]"
              : "text-slate-500 dark:text-[#94a19c]"
          }`}
        >
          <CalendarDays size={15} />
          Semana
        </button>
      </div>

      {vista === "semana" ? (
        <SemanaGantt locales={locales} />
      ) : (
        <>
          <Card>
        <SectionTitle>Nuevo turno</SectionTitle>
        <div className="mb-3 flex gap-2 rounded-xl bg-slate-100 p-1 dark:bg-[#18201d]">
          <button
            type="button"
            onClick={() => setModo("grupo")}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
              modo === "grupo" ? "bg-white shadow-sm dark:bg-[#131816]" : "text-slate-500 dark:text-[#94a19c]"
            }`}
          >
            Varios empleados, un día
          </button>
          <button
            type="button"
            onClick={() => setModo("individual")}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
              modo === "individual"
                ? "bg-white shadow-sm dark:bg-[#131816]"
                : "text-slate-500 dark:text-[#94a19c]"
            }`}
          >
            Un empleado, la semana
          </button>
        </div>

        {modo === "individual" ? (
          <form onSubmit={crearIndividual} className="flex flex-col gap-3">
            {locales.length > 1 && (
              <div>
                <Label>Sucursal</Label>
                <Select
                  value={localId}
                  onChange={(e) => {
                    setLocalId(e.target.value);
                    setEmpIndividualId("");
                  }}
                >
                  {locales.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label>Empleado</Label>
              {empleadosDelLocal.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-[#94a19c]">
                  No hay empleados asignados a esta sucursal.
                </p>
              ) : (
                <Select value={empIndividualId} onChange={(e) => setEmpIndividualId(e.target.value)}>
                  <option value="">Elegí un empleado</option>
                  {empleadosDelLocal.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div>
              <Label>La semana arranca el</Label>
              <Input
                type="date"
                value={desdeIndividual}
                onChange={(e) => setDesdeIndividual(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Días y horario</Label>
              <div className="flex flex-col gap-1.5">
                {diasIndividual.map((d, offset) => {
                  const fecha = desdeIndividual ? fechaMasDias(desdeIndividual, offset) : "";
                  const [, mm, dd] = fecha ? fecha.split("-") : ["", "", ""];
                  const nombreDia = fecha
                    ? new Date(fecha + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short" })
                    : NOMBRE_DIA_CORTO[offset].slice(0, 3);
                  const cruza = d.horaFin <= d.horaInicio;
                  return (
                    <div
                      key={offset}
                      className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 dark:border-[#26312d] ${
                        d.activo ? "border-slate-200" : "border-slate-100 opacity-60 dark:border-[#1c2521]"
                      }`}
                    >
                      <label className="flex w-24 shrink-0 items-center gap-2 text-sm font-medium capitalize">
                        <Checkbox
                          checked={d.activo}
                          onChange={(e) => actualizarDiaIndividual(offset, { activo: e.target.checked })}
                        />
                        {nombreDia}
                        {dd && <span className="text-xs font-normal text-slate-400">{dd}/{mm}</span>}
                      </label>
                      <Input
                        type="time"
                        value={d.horaInicio}
                        disabled={!d.activo}
                        onChange={(e) => actualizarDiaIndividual(offset, { horaInicio: e.target.value })}
                        className="w-auto! py-1.5"
                      />
                      <span className="text-slate-400">a</span>
                      <Input
                        type="time"
                        value={d.horaFin}
                        disabled={!d.activo}
                        onChange={(e) => actualizarDiaIndividual(offset, { horaFin: e.target.value })}
                        className="w-auto! py-1.5"
                      />
                      {d.activo && cruza && (
                        <span className="w-full text-xs text-amber-700 dark:text-amber-300">
                          Termina al día siguiente
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <Button type="submit" disabled={cargandoIndividual} className="mt-1">
              <CalendarPlus size={16} />
              {cargandoIndividual
                ? "Creando…"
                : `Crear ${diasIndividual.filter((d) => d.activo).length} turnos`}
            </Button>
            <ErrorText>{errorIndividual}</ErrorText>
          </form>
        ) : (
        <form onSubmit={crear} className="flex flex-col gap-3">
          {locales.length > 1 && (
            <div>
              <Label>Sucursal</Label>
              <Select
                value={localId}
                onChange={(e) => {
                  setLocalId(e.target.value);
                  setSeleccion({});
                }}
              >
                {locales.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Desde (por defecto)</Label>
              <Input
                type="time"
                value={horaInicioDefault}
                onChange={(e) => setHoraInicioDefault(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label>Hasta (por defecto)</Label>
              <Input
                type="time"
                value={horaFinDefault}
                onChange={(e) => setHoraFinDefault(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-[#94a19c]">
            Este horario se aplica a cada empleado que marques. Podés ajustarlo individualmente
            abajo antes de guardar.
          </p>

          <div>
            <Label>Empleados</Label>
            {empleadosDelLocal.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-[#94a19c]">
                No hay empleados asignados a esta sucursal.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-2 dark:border-[#26312d]">
                {empleadosDelLocal.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <Checkbox
                      checked={emp.id in seleccion}
                      onChange={(e) => toggleEmpleado(emp.id, e.target.checked)}
                    />
                    {emp.nombre}
                  </label>
                ))}
              </div>
            )}
          </div>

          {seleccionados.length > 0 && (
            <div>
              <Label>Horario por persona</Label>
              <div className="flex flex-col gap-2">
                {seleccionados.map((id) => {
                  const emp = empleados.find((e) => e.id === id);
                  const h = seleccion[id];
                  const cruza = h.horaFin <= h.horaInicio;
                  return (
                    <div key={id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-[#26312d]">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{emp?.nombre}</span>
                      <Input
                        type="time"
                        value={h.horaInicio}
                        onChange={(e) => actualizarHorario(id, { horaInicio: e.target.value })}
                        className="w-auto! py-1.5"
                      />
                      <span className="text-slate-400">a</span>
                      <Input
                        type="time"
                        value={h.horaFin}
                        onChange={(e) => actualizarHorario(id, { horaFin: e.target.value })}
                        className="w-auto! py-1.5"
                      />
                      {cruza && (
                        <span className="w-full text-xs text-amber-700 dark:text-amber-300">
                          Termina al día siguiente
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Button type="submit" disabled={cargando} className="mt-1">
            <CalendarPlus size={16} />
            {cargando
              ? "Creando…"
              : seleccionados.length > 1
                ? `Crear ${seleccionados.length} turnos`
                : "Crear turno"}
          </Button>
          <ErrorText>{error}</ErrorText>
        </form>
        )}
      </Card>

      <div>
        <SectionTitle>Próximos turnos</SectionTitle>
        {turnos.length === 0 ? (
          <EmptyState>No hay turnos programados</EmptyState>
        ) : (
          <div className="flex flex-col gap-2 md:gap-1.5">
            {turnos.map((t) => (
              <Card key={t.id} className="flex items-center justify-between gap-3 md:p-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.empleado?.nombre}</p>
                  <p className="text-sm text-slate-500 dark:text-[#94a19c]">
                    {formatearFechaSql(t.fecha, { weekday: "short", day: "2-digit", month: "short" })}
                    {" · "}
                    {t.horaInicio}–{t.horaFin}
                    {locales.length > 1 && t.local ? ` · ${t.local.nombre}` : ""}
                  </p>
                </div>
                <IconButton label="Eliminar turno" onClick={() => eliminar(t.id, t.empleado?.nombre)}>
                  <Trash2 size={18} />
                </IconButton>
              </Card>
            ))}
          </div>
        )}
          </div>
        </>
      )}
      {dialog}
    </div>
  );
}
