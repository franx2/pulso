"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, TrendingUp } from "lucide-react";
import { Badge, Card, EmptyState, SectionTitle, Select, Spinner } from "@/components/ui";

type Sector = "COCINA" | "SALON" | "CAJA" | "DESPACHO" | "ENCARGADO";
type SlotPron = {
  slot: number;
  tickets: number;
  demandIndex: number;
  carga: Record<Sector, number>;
  dotacion: Record<Sector, number>;
};
type DiaPron = {
  fecha: string;
  diaSemana: number;
  tickets: number;
  ticketsMin: number;
  ticketsMax: number;
  ventas: number;
  demandIndex: number;
  kAuto: number;
  kManual: number;
  confianza: number;
  motivos: string[];
  horaPico: string | null;
  dotacionPico: Record<Sector, number>;
  slots: SlotPron[];
};
type Capacidad = {
  sector: Sector;
  capacidadPorEmpleado: number;
  origen: string;
  confianza: number;
  observaciones: number;
};
type Respuesta = {
  locales: { id: string; nombre: string; tipoLocal: string }[];
  local: { id: string; nombre: string; tipoLocal: string };
  diagnostico: Record<string, unknown>;
  capacidades: Capacidad[];
  pronostico: DiaPron[];
};

const SECTORES: Sector[] = ["COCINA", "SALON", "CAJA", "DESPACHO", "ENCARGADO"];
const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const etiquetaSlot = (s: number) => `${String(Math.floor(s / 2)).padStart(2, "0")}:${s % 2 ? "30" : "00"}`;
const fmtFecha = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });

export default function PronosticoClient() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [localId, setLocalId] = useState("");
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async (id: string) => {
    setCargando(true);
    const res = await fetch(`/api/pronostico?dias=15${id ? `&localId=${id}` : ""}`);
    setDatos(res.ok ? await res.json() : null);
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change, no data lib
    cargar(localId);
  }, [localId, cargar]);

  if (cargando) return <Spinner />;
  if (!datos || datos.locales.length === 0) {
    return <EmptyState>Todavía no hay locales con Fudo configurado para pronosticar.</EmptyState>;
  }

  const capacidadEsSupuesto = datos.capacidades.every((c) => c.origen === "DEFECTO");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pronóstico y dotación</h1>
          <p className="text-sm text-slate-500 dark:text-[#94a19c]">
            15 días por franja de 30 minutos, aprendido de los últimos 90 días de cada local
          </p>
        </div>
        <Select value={localId} onChange={(e) => setLocalId(e.target.value)} className="w-auto! py-1.5 text-sm">
          {datos.locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </Select>
      </div>

      {capacidadEsSupuesto && (
        <Card className="border-amber-200 bg-amber-50 dark:border-[#5a4a2f] dark:bg-[#241f14]">
          <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
            <Info size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">La dotación todavía es un supuesto, no una medición.</p>
              <p className="mt-1">
                La demanda sí está aprendida de las ventas reales. Pero para traducirla en personas hace falta
                saber cuánta carga sostiene una persona, y eso se aprende de los fichajes: hoy hay muy pocos
                como para calibrarlo. Los números de abajo usan la capacidad por defecto y se van a corregir
                solos a medida que el personal fiche.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <SectionTitle
          action={
            <Badge tone={datos.local.tipoLocal === "INDOOR_MALL" ? "slate" : "emerald"}>
              {datos.local.tipoLocal === "INDOOR_MALL" ? "En shopping" : "A la calle"}
            </Badge>
          }
        >
          Cómo está pensando el modelo
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-[#5d6d67]">Días aprendidos</p>
            <p className="font-semibold">{String(datos.diagnostico.diasObservados ?? "—")}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-[#5d6d67]">Franjas con patrón</p>
            <p className="font-semibold">{String(datos.diagnostico.celdasPerfil ?? "—")}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-[#5d6d67]">Tendencia (K_trend)</p>
            <p className="font-semibold">{Number(datos.diagnostico.kTrend ?? 1).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-[#5d6d67]">Capacidad</p>
            <p className="font-semibold">{capacidadEsSupuesto ? "por defecto" : "aprendida"}</p>
          </div>
        </div>
      </Card>

      {datos.pronostico.map((d) => (
        <Card key={d.fecha} className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setAbierto(abierto === d.fecha ? null : d.fecha)}
            className="flex flex-wrap items-baseline justify-between gap-2 text-left"
          >
            <span className="font-semibold">
              {NOMBRE_DIA[d.diaSemana]} <span className="font-normal text-slate-400">{fmtFecha(d.fecha)}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={d.demandIndex >= 110 ? "emerald" : d.demandIndex <= 90 ? "amber" : "slate"}>
                índice {d.demandIndex.toFixed(0)}
              </Badge>
              <span className="tabular-nums text-slate-600 dark:text-[#c1cbc6]">
                {Math.round(d.tickets)} tickets
                <span className="ml-1 text-xs text-slate-400 dark:text-[#74817b]">
                  ({Math.round(d.ticketsMin)}–{Math.round(d.ticketsMax)})
                </span>
              </span>
              {d.horaPico && (
                <span className="text-xs text-slate-400 dark:text-[#74817b]">pico {d.horaPico}</span>
              )}
            </span>
          </button>

          <div className="flex flex-wrap gap-1.5">
            {SECTORES.filter((s) => d.dotacionPico[s] > 0).map((s) => (
              <Badge key={s} tone="slate">
                {s.toLowerCase()}: {d.dotacionPico[s]} en el pico
              </Badge>
            ))}
            {d.motivos.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-[#74817b]">
                <TrendingUp size={12} />
                {d.motivos.join(" · ")}
              </span>
            )}
          </div>

          {abierto === d.fecha && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-[#26312d] dark:text-[#5d6d67]">
                    <th className="py-1.5 pr-3 font-semibold">Hora</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Tickets</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">Índice</th>
                    {SECTORES.map((s) => (
                      <th key={s} className="py-1.5 pr-3 text-right font-semibold">
                        {s.slice(0, 4).toLowerCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.slots.map((s) => (
                    <tr key={s.slot} className="border-b border-slate-100 last:border-0 dark:border-[#1c2521]">
                      <td className="py-1.5 pr-3 tabular-nums">{etiquetaSlot(s.slot)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{s.tickets.toFixed(1)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">
                        {s.demandIndex.toFixed(0)}
                      </td>
                      {SECTORES.map((sec) => (
                        <td key={sec} className="py-1.5 pr-3 text-right tabular-nums">
                          {s.dotacion[sec] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
