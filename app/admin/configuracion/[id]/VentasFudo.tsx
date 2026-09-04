"use client";

import { useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { Badge, Button, Card, ErrorText, Select, SectionTitle } from "@/components/ui";

type Mozo = {
  fudoUsuarioId: string;
  nombreFudo: string;
  cantidadVentas: number;
  totalVentas: number;
  empleadoId: string | null;
};
type Empleado = { id: string; nombre: string };
type Resumen = {
  cantidadVentas: number;
  totalVentas: number;
  personasAtendidas: number;
  porMozo: Mozo[];
  empleadosLocal: Empleado[];
};

const PERIODOS = [
  { dias: 7, label: "7 días" },
  { dias: 30, label: "30 días" },
];

function fechaISO(hace: number) {
  return new Date(Date.now() - hace * 86400000).toISOString().slice(0, 10);
}

async function ponerFudoUsuarioId(empleadoId: string, fudoUsuarioId: string | null) {
  await fetch(`/api/empleados/${empleadoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fudoUsuarioId }),
  });
}

/** Ventas y mozos de la sucursal, leído en vivo de Fudo: cuántas personas
 * atendió (EAT-IN), y qué mozo cerró cuántas ventas — sólo cuando Fudo
 * registró quién fue, que en la práctica es una minoría de las ventas. */
export default function VentasFudo({ localId }: { localId: string }) {
  const [dias, setDias] = useState(7);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(false);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function buscar(diasElegidos: number) {
    setDias(diasElegidos);
    setCargando(true);
    setError("");
    const params = new URLSearchParams({ desde: fechaISO(diasElegidos), hasta: fechaISO(0) });
    const res = await fetch(`/api/locales/${localId}/ventas?${params}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo consultar Fudo");
      setResumen(null);
    } else {
      setResumen(data);
    }
    setCargando(false);
  }

  async function vincular(mozo: Mozo, nuevoEmpleadoId: string) {
    if (nuevoEmpleadoId === (mozo.empleadoId ?? "")) return;
    setVinculando(mozo.fudoUsuarioId);
    // Un empleado sólo puede estar linkeado a un usuario de Fudo a la vez:
    // si ya había otro empleado con este id, se lo saca antes de asignarlo.
    if (mozo.empleadoId) await ponerFudoUsuarioId(mozo.empleadoId, null);
    if (nuevoEmpleadoId) await ponerFudoUsuarioId(nuevoEmpleadoId, mozo.fudoUsuarioId);
    await buscar(dias);
    setVinculando(null);
  }

  return (
    <Card>
      <SectionTitle
        action={
          <div className="flex gap-1">
            {PERIODOS.map((p) => (
              <Button
                key={p.dias}
                type="button"
                variant={dias === p.dias && resumen ? "primary" : "ghost"}
                onClick={() => buscar(p.dias)}
                disabled={cargando}
              >
                {p.label}
              </Button>
            ))}
          </div>
        }
      >
        Ventas y mozos
      </SectionTitle>
      <p className="mb-4 text-sm text-slate-500 dark:text-[#94a19c]">
        Personas atendidas y desglose por mozo, según Fudo. El mozo sólo aparece en las ventas
        donde Fudo lo registró — es habitual que sea una parte, no todas. Si el nombre no matchea
        solo, elegí a mano qué empleado de Pulso es cada uno: queda guardado para la próxima vez.
      </p>

      {cargando && <p className="text-sm text-slate-400 dark:text-[#74817b]">Consultando Fudo…</p>}
      <ErrorText>{error}</ErrorText>

      {resumen && !cargando && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-slate-100 p-3 dark:border-[#1c2521]">
              <p className="text-lg font-bold">{resumen.cantidadVentas}</p>
              <p className="text-xs text-slate-500 dark:text-[#94a19c]">Ventas</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 dark:border-[#1c2521]">
              <p className="text-lg font-bold">${resumen.totalVentas.toFixed(2)}</p>
              <p className="text-xs text-slate-500 dark:text-[#94a19c]">Total</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 dark:border-[#1c2521]">
              <p className="text-lg font-bold">{resumen.personasAtendidas}</p>
              <p className="text-xs text-slate-500 dark:text-[#94a19c]">Personas atendidas</p>
            </div>
          </div>

          {resumen.porMozo.length === 0 ? (
            <p className="text-center text-sm text-slate-400 dark:text-[#74817b]">
              Ninguna venta tiene mozo asignado en este período
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {resumen.porMozo.map((m) => (
                <li
                  key={m.fudoUsuarioId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm dark:border-[#1c2521]"
                >
                  <span className="flex items-center gap-2">
                    <Users size={14} />
                    {m.nombreFudo}
                    {!m.empleadoId && <Badge tone="slate">sin vincular en Pulso</Badge>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-slate-600 dark:text-[#c1cbc6]">
                      {m.cantidadVentas} ventas · ${m.totalVentas.toFixed(2)}
                    </span>
                    <Select
                      value={m.empleadoId ?? ""}
                      onChange={(e) => vincular(m, e.target.value)}
                      disabled={vinculando === m.fudoUsuarioId}
                      className="w-auto! py-1 text-xs"
                    >
                      <option value="">Sin vincular</option>
                      {resumen.empleadosLocal.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                        </option>
                      ))}
                    </Select>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!resumen && !cargando && !error && (
        <Button type="button" variant="ghost" onClick={() => buscar(7)}>
          <RefreshCw size={16} />
          Consultar
        </Button>
      )}
    </Card>
  );
}
