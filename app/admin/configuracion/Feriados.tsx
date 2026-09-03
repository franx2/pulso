"use client";

import { useEffect, useState } from "react";
import { CalendarHeart, Plus, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, ErrorText, IconButton, Input, SectionTitle } from "@/components/ui";
import { formatearFechaSql } from "@/lib/fechas";

type Feriado = { id: string; fecha: string; nombre: string };

export default function Feriados() {
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    const res = await fetch("/api/feriados");
    const data = await res.json();
    setFeriados(data.feriados ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar();
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const res = await fetch("/api/feriados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha, nombre }),
    });
    const data = await res.json();
    setCargando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo cargar el feriado");
    setFecha("");
    setNombre("");
    cargar();
  }

  async function eliminar(id: string) {
    await fetch(`/api/feriados/${id}`, { method: "DELETE" });
    cargar();
  }

  return (
    <Card>
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <CalendarHeart size={15} />
          Feriados
        </span>
      </SectionTitle>
      <p className="mb-4 text-sm text-slate-500 dark:text-[#94a19c]">
        Calendario único para todo el negocio: cada sucursal paga su propio multiplicador sobre estos
        días (Ajustes → la sucursal → Cálculo de horas). Ya están cargados los feriados nacionales de
        fecha fija; los trasladables (Carnaval, Semana Santa, los que el gobierno mueve al lunes más
        cercano, o los &ldquo;puentes turísticos&rdquo;) cambian año a año — agregalos acá cuando se
        confirme la fecha.
      </p>
      <form onSubmit={crear} className="mb-4 flex flex-wrap gap-2">
        <Input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-auto!"
          required
        />
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Carnaval"
          className="min-w-[10rem] flex-1"
          required
        />
        <Button type="submit" disabled={cargando} className="shrink-0">
          <Plus size={16} />
          Agregar
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>

      {feriados.length === 0 ? (
        <EmptyState inCard={false}>Sin feriados cargados</EmptyState>
      ) : (
        <div className="flex flex-col gap-1.5">
          {feriados.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#26312d]"
            >
              <span>
                <span className="font-medium">
                  {formatearFechaSql(f.fecha, { day: "2-digit", month: "long", year: "numeric" })}
                </span>{" "}
                <span className="text-slate-500 dark:text-[#94a19c]">· {f.nombre}</span>
              </span>
              <IconButton label={`Quitar ${f.nombre}`} onClick={() => eliminar(f.id)}>
                <Trash2 size={16} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
