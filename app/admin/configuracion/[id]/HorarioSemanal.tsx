"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button, Card, Checkbox, ErrorText, Input, SectionTitle } from "@/components/ui";

type DiaHorario = { diaSemana: number; cerrado: boolean; abre: string | null; cierra: string | null };

const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function HorarioSemanal({ localId }: { localId: string }) {
  const [dias, setDias] = useState<DiaHorario[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    fetch(`/api/locales/${localId}/horarios`)
      .then((r) => r.json())
      .then((d) => setDias(d.horarios ?? []));
  }, [localId]);

  function actualizar(diaSemana: number, cambios: Partial<DiaHorario>) {
    setDias((prev) =>
      prev ? prev.map((d) => (d.diaSemana === diaSemana ? { ...d, ...cambios } : d)) : prev
    );
  }

  async function guardar() {
    if (!dias) return;
    setError("");
    setGuardado(false);
    setGuardando(true);
    const res = await fetch(`/api/locales/${localId}/horarios`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dias }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo guardar el horario");
    setGuardado(true);
  }

  if (!dias) return null;

  return (
    <Card>
      <SectionTitle>Horario de atención</SectionTitle>
      <p className="mb-4 text-sm text-slate-500 dark:text-[#94a19c]">
        Define los límites del diagrama de turnos semanal y a qué franja horaria se ajustan los
        turnos de cada día.
      </p>
      <div className="flex flex-col gap-2">
        {dias
          .slice()
          .sort((a, b) => a.diaSemana - b.diaSemana)
          .map((d) => (
            <div key={d.diaSemana} className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-[#26312d]">
              <span className="w-24 shrink-0 text-sm font-medium">{NOMBRE_DIA[d.diaSemana]}</span>
              <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-[#94a19c]">
                <Checkbox
                  checked={d.cerrado}
                  onChange={(e) => actualizar(d.diaSemana, { cerrado: e.target.checked })}
                />
                Cerrado
              </label>
              {!d.cerrado && (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={d.abre ?? ""}
                    onChange={(e) => actualizar(d.diaSemana, { abre: e.target.value })}
                    className="w-auto! py-1.5"
                  />
                  <span className="text-slate-400">a</span>
                  <Input
                    type="time"
                    value={d.cierra ?? ""}
                    onChange={(e) => actualizar(d.diaSemana, { cierra: e.target.value })}
                    className="w-auto! py-1.5"
                  />
                </div>
              )}
            </div>
          ))}
      </div>
      <Button onClick={guardar} disabled={guardando} className="mt-4">
        <Save size={16} />
        {guardando ? "Guardando…" : "Guardar horario"}
      </Button>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
        {guardado && <p className="text-sm font-medium text-emerald-700 dark:text-[#4ee6b0]">Guardado.</p>}
      </div>
    </Card>
  );
}
