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

const ALTO_CURVA = 36;

/**
 * Curva de demanda de un día como paths SVG, en la misma escala horizontal
 * que las barras de turnos (posicionBarra) y una escala vertical COMPARTIDA
 * entre los 7 días (`maxVal`), para que la altura de la curva sea comparable
 * entre un domingo tranquilo y un viernes a full.
 */
function curvaDemanda(
  abre: string,
  cierra: string,
  porHora: Map<number, number>,
  maxVal: number
): { area: string; linea: string; pico: { xPct: number; valor: number } | null } {
  const puntos: { x: number; y: number; valor: number }[] = [];
  for (let h = 0; h < 24; h++) {
    const pos = posicionBarra(abre, cierra, `${String(h).padStart(2, "0")}:00`, `${String((h + 1) % 24).padStart(2, "0")}:00`);
    if (!pos) continue;
    const valor = porHora.get(h) ?? 0;
    const y = ALTO_CURVA - (valor / maxVal) * ALTO_CURVA;
    puntos.push({ x: pos.leftPct, y, valor });
    // Último tramo del día: cierra la curva en el borde derecho de la ventana.
    if (pos.leftPct + pos.widthPct >= 100 - 0.01) {
      puntos.push({ x: pos.leftPct + pos.widthPct, y, valor });
    }
  }
  if (puntos.length === 0) return { area: "", linea: "", pico: null };

  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${linea} L ${puntos[puntos.length - 1].x} ${ALTO_CURVA} L ${puntos[0].x} ${ALTO_CURVA} Z`;
  const pico = puntos.reduce((max, p) => (p.valor > max.valor ? p : max), puntos[0]);
  return { area, linea, pico: { xPct: pico.x, valor: pico.valor } };
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

  // Por día: mapa hora -> ventasProm, para la curva; y total del día, para
  // comparar de un vistazo si conviene más gente el domingo o el martes.
  const demandaPorDia = useMemo(() => {
    const m = new Map<number, Map<number, number>>();
    for (const d of demanda) {
      const dia = m.get(d.diaSemana) ?? m.set(d.diaSemana, new Map()).get(d.diaSemana)!;
      dia.set(d.hora, d.ventasProm);
    }
    return m;
  }, [demanda]);
  const totalPorDia = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of demanda) m.set(d.diaSemana, (m.get(d.diaSemana) ?? 0) + d.ventasProm);
    return m;
  }, [demanda]);
  // Escala vertical ÚNICA para las 7 curvas: si cada una tuviera su propio
  // máximo, un martes flojo se vería tan "lleno" como un viernes a full.
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
            <p className="text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <svg width="16" height="10" viewBox="0 0 16 10" className="shrink-0">
                  <path d="M0 8 Q4 1 8 5 T16 2" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                </svg>
                Curva ámbar = demanda histórica (ventas/hora promedio, últimos 3 meses)
              </span>
              {" · misma escala vertical los 7 días (0 a "}
              {demandaMaxima.toFixed(1)}
              {" ventas/hora) — compará la altura entre días, no sólo la forma"}
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
                <div className="flex items-baseline justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {NOMBRE_DIA[dia.getDay()]}{" "}
                    <span className="font-normal text-slate-400">
                      {dia.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                    </span>
                    {totalPorDia.has(dia.getDay()) && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        ≈{totalPorDia.get(dia.getDay())!.toFixed(0)} ventas/día
                      </span>
                    )}
                  </p>
                  {horario && !horario.cerrado && (
                    <p className="shrink-0 text-xs text-slate-400">
                      {horario.abre}–{horario.cierra}
                    </p>
                  )}
                </div>

                {!horario || horario.cerrado ? (
                  <p className="text-xs text-slate-400">Cerrado</p>
                ) : (
                  <>
                    {demandaPorDia.has(dia.getDay()) &&
                      (() => {
                        const { area, linea, pico } = curvaDemanda(
                          horario.abre!,
                          horario.cierra!,
                          demandaPorDia.get(dia.getDay())!,
                          demandaMaxima
                        );
                        if (!linea) return null;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="w-20 shrink-0" />
                            <div className="relative flex-1 overflow-hidden rounded bg-slate-50 dark:bg-[#18201d]" style={{ height: ALTO_CURVA }}>
                              <svg
                                viewBox={`0 0 100 ${ALTO_CURVA}`}
                                preserveAspectRatio="none"
                                className="absolute inset-0 h-full w-full"
                              >
                                {/* Grilla de referencia: 50% y 100% de la escala compartida. */}
                                <line x1="0" y1={ALTO_CURVA / 2} x2="100" y2={ALTO_CURVA / 2} stroke="currentColor" strokeWidth="0.5" className="text-slate-200 dark:text-[#26312d]" vectorEffect="non-scaling-stroke" />
                                <path d={area} fill="#f59e0b" fillOpacity="0.18" />
                                <path d={linea} fill="none" stroke="#f59e0b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                              </svg>
                              {pico && pico.valor > 0 && (
                                <span
                                  className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-amber-700 px-1 py-0.5 text-[10px] font-semibold leading-none text-white dark:bg-amber-600"
                                  style={{ left: `${Math.min(Math.max(pico.xPct, 8), 92)}%` }}
                                >
                                  pico {pico.valor.toFixed(1)}/h
                                </span>
                              )}
                            </div>
                            <span className="w-24 shrink-0" />
                          </div>
                        );
                      })()}
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
