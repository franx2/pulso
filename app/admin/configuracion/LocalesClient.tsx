"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus, Store, Users } from "lucide-react";
import { Button, Card, EmptyState, ErrorText, Input, Label, PageTitle, SectionTitle } from "@/components/ui";
import Feriados from "./Feriados";

type Estado = {
  ubicacion: boolean;
  fudo: boolean;
  horario: boolean;
  categorias: boolean;
  compras: boolean;
  costos: boolean;
};

type Local = { id: string; nombre: string; _count: { empleados: number }; estado?: Estado };

/** Qué nombre tiene cada cosa que puede faltar, para poder decirlo. */
const FALTANTES: { clave: keyof Estado; label: string }[] = [
  { clave: "fudo", label: "Fudo" },
  { clave: "compras", label: "CUIT de compras" },
  { clave: "costos", label: "costos del mes" },
  { clave: "horario", label: "horario" },
  { clave: "categorias", label: "puestos" },
  { clave: "ubicacion", label: "ubicación" },
];

export default function LocalesClient() {
  const [locales, setLocales] = useState<Local[]>([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    const res = await fetch("/api/locales");
    const data = await res.json();
    setLocales(data.locales ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar();
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const res = await fetch("/api/locales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    const data = await res.json();
    setCargando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo crear el local");
    setNombre("");
    cargar();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle subtitle="Sucursales, horarios, ubicación y puestos de cada una">Locales</PageTitle>

      <Card>
        <SectionTitle>Nueva sucursal</SectionTitle>
        <form onSubmit={crear} className="flex flex-col gap-3">
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Sucursal Centro" required />
          </div>
          <Button type="submit" disabled={cargando}>
            <Plus size={16} />
            {cargando ? "Creando…" : "Crear sucursal"}
          </Button>
          <ErrorText>{error}</ErrorText>
        </form>
      </Card>

      <div>
        <SectionTitle>Todas las sucursales</SectionTitle>
        {locales.length === 0 ? (
          <EmptyState>Todavía no hay sucursales cargadas</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {locales.map((l) => (
              <Link key={l.id} href={`/admin/configuracion/${l.id}`}>
                <Card className="flex items-center justify-between gap-3 transition hover:border-emerald-300 dark:hover:border-[#2f6b55]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-[#122620] dark:text-[#4ee6b0]">
                      <Store size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{l.nombre}</p>
                      <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-[#94a19c]">
                        <Users size={12} />
                        {l._count.empleados} {l._count.empleados === 1 ? "empleado" : "empleados"}
                      </p>
                      {(() => {
                        // Lo que falta se dice acá y no se deja para adentro:
                        // "por qué esta sucursal no tiene compras" se
                        // contestaba abriendo las cuatro, una por una.
                        const faltan = l.estado
                          ? FALTANTES.filter((f) => !l.estado![f.clave]).map((f) => f.label)
                          : [];
                        if (faltan.length === 0) return null;
                        return (
                          <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                            <span>Falta {faltan.join(", ")}</span>
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-slate-400" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Feriados />
    </div>
  );
}
