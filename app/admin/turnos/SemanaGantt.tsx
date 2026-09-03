"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, EmptyState, Select, Spinner } from "@/components/ui";
import { posicionBarra } from "@/lib/ganttBarra";
import { claveFechaSql } from "@/lib/fechas";

type Local = { id: string; nombre: string };
type Turno = {
  id: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  empleado?: { nombre: string };
};
type DiaHorario = { diaSemana: number; cerrado: boolean; abre: string | null; cierra: string | null };
type Demanda = { diaSemana: number; hora: number; ventasProm: number };

const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const COLORES = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-fuchsia-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function inicioDeSemana(d: Date): Date {
  const dia = d.getDay(); // 0 = domingo
  const diff = dia === 0 ? -6 : 1 - dia; // retrocede hasta el lunes
  const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return lunes;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SemanaGantt({ locales }: { locales: Local[] }) {
  const [localId, setLocalId] = useState(locales[0]?.id ?? "");
  const [inicioSemana, setInicioSemana] = useState(() => inicioDeSemana(new Date()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [horarios, setHorarios] = useState<DiaHorario[]>([]);
  const [demanda, setDemanda] = useState<Demanda[]>([]);
  const [cargando, setCargando] = useState(true);

  const dias = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(inicioSemana.getFullYear(), inicioSemana.getMonth(), inicioSemana.getDate() + i)),
    [inicioSemana]
  );

  useEffect(() => {
    if (!localId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    setCargando(true);
    const desde = iso(dias[0]);
    const hasta = iso(dias[6]);
    Promise.all([
      fetch(`/api/turnos?desde=${desde}&hasta=${hasta}&localId=${localId}`).then((r) => r.json()),
      fetch(`/api/locales/${localId}/horarios`).then((r) => r.json()),
      fetch(`/api/locales/${localId}/demanda`).then((r) => r.json()),
    ]).then(([t, h, dem]) => {
      setTurnos(t.turnos ?? []);
      setHorarios(h.horarios ?? []);
      setDemanda(dem.demanda ?? []);
      setCargando(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `dias` se deriva de inicioSemana, no hace falta como dep propia
  }, [localId, inicioSemana]);

  const turnosPorDia = useMemo(() => {
    const m = new Map<string, Turno[]>();
    for (const t of turnos) {
      const k = claveFechaSql(new Date(t.fecha));
      (m.get(k) ?? m.set(k, []).get(k)!).push(t);
    }
    return m;
  }, [turnos]);

  // Un color estable por empleado, para reconocer a la misma persona entre días.
  const colorPorEmpleado = useMemo(() => {
    const nombres = [...new Set(turnos.map((t) => t.empleado?.nombre ?? ""))].sort();
    return new Map(nombres.map((n, i) => [n, COLORES[i % COLORES.length]]));
  }, [turnos]);

  const demandaPorDia = useMemo(() => {
    const m = new Map<number, Demanda[]>();
    for (const d of demanda) (m.get(d.diaSemana) ?? m.set(d.diaSemana, []).get(d.diaSemana)!).push(d);
    return m;
  }, [demanda]);
  const demandaMaxima = Math.max(1, ...demanda.map((d) => d.ventasProm));

  if (locales.length === 0) return <EmptyState>Todavía no hay sucursales cargadas</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      {locales.length > 1 && (
        <Select value={localId} onChange={(e) => setLocalId(e.target.value)} className="max-w-xs">
          {locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </Select>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setInicioSemana((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))}
          className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-[#18201d]"
          aria-label="Semana anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-medium">
          {dias[0].toLocaleDateString("es-AR", { day: "2-digit", month: "short" })} –{" "}
          {dias[6].toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
        </p>
        <button
          type="button"
          onClick={() => setInicioSemana((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))}
          className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-[#18201d]"
          aria-label="Semana siguiente"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {cargando ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-2">
          {demanda.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="inline-block h-2 w-4 rounded bg-amber-500/70" />
              Franja ámbar = intensidad de demanda histórica (ventas/hora promedio de los últimos 3
              meses)
            </p>
          )}
          {/* Los 7 días en una sola tarjeta continua (en vez de 7 tarjetas separadas)
              para ver las superposiciones de la semana de un vistazo, sin scrollear
              tarjeta por tarjeta. */}
          <Card className="flex flex-col divide-y divide-slate-100 p-0 dark:divide-[#26312d]">
          {dias.map((dia) => {
            const clave = iso(dia);
            const horario = horarios.find((h) => h.diaSemana === dia.getDay());
            const delDia = turnosPorDia.get(clave) ?? [];

            return (
              <div key={clave} className="flex flex-col gap-2 p-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold">
                    {NOMBRE_DIA[dia.getDay()]}{" "}
                    <span className="font-normal text-slate-400">
                      {dia.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                    </span>
                  </p>
                  {horario && !horario.cerrado && (
                    <p className="text-xs text-slate-400">
                      {horario.abre}–{horario.cierra}
                    </p>
                  )}
                </div>

                {!horario || horario.cerrado ? (
                  <p className="text-xs text-slate-400">Cerrado</p>
                ) : (
                  <>
                    {(demandaPorDia.get(dia.getDay()) ?? []).length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="w-20 shrink-0" />
                        <div className="relative h-2 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-[#18201d]">
                          {(demandaPorDia.get(dia.getDay()) ?? []).map((d) => {
                            const pos = posicionBarra(
                              horario.abre!,
                              horario.cierra!,
                              `${String(d.hora).padStart(2, "0")}:00`,
                              `${String((d.hora + 1) % 24).padStart(2, "0")}:00`
                            );
                            if (!pos) return null;
                            const intensidad = 0.15 + (d.ventasProm / demandaMaxima) * 0.75;
                            return (
                              <div
                                key={d.hora}
                                className="absolute inset-y-0 bg-amber-500"
                                style={{
                                  left: `${pos.leftPct}%`,
                                  width: `${pos.widthPct}%`,
                                  opacity: intensidad,
                                }}
                                title={`${d.hora}:00–${d.hora + 1}:00 · ${d.ventasProm.toFixed(1)} ventas/hora en promedio`}
                              />
                            );
                          })}
                        </div>
                        <span className="w-24 shrink-0" />
                      </div>
                    )}
                    {delDia.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin turnos</p>
                    ) : (
                  <div className="flex flex-col gap-1">
                    {delDia.map((t) => {
                      const pos = posicionBarra(horario.abre!, horario.cierra!, t.horaInicio, t.horaFin);
                      return (
                        <div key={t.id} className="flex items-center gap-2">
                          <span className="w-20 shrink-0 truncate text-xs text-slate-500 dark:text-[#94a19c]">
                            {t.empleado?.nombre}
                          </span>
                          <div className="relative h-5 flex-1 rounded bg-slate-100 dark:bg-[#18201d]">
                            {pos && (
                              <div
                                className={`absolute inset-y-0 rounded ${colorPorEmpleado.get(t.empleado?.nombre ?? "") ?? "bg-emerald-500"}`}
                                style={{ left: `${pos.leftPct}%`, width: `${Math.max(pos.widthPct, 2)}%` }}
                                title={`${t.horaInicio}–${t.horaFin}`}
                              />
                            )}
                          </div>
                          <span className="w-24 shrink-0 text-right text-xs text-slate-400">
                            {t.horaInicio}–{t.horaFin}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
          </Card>
        </div>
      )}
    </div>
  );
}
