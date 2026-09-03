"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, ErrorText, Input, SectionTitle } from "@/components/ui";

type Categoria = { id: string; nombre: string };

export default function CategoriasLocal({ localId }: { localId: string }) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    const res = await fetch(`/api/locales/${localId}/categorias`);
    const data = await res.json();
    setCategorias(data.categorias ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const res = await fetch(`/api/locales/${localId}/categorias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    const data = await res.json();
    setCargando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo crear la categoría");
    setNombre("");
    cargar();
  }

  async function eliminar(id: string) {
    await fetch(`/api/categorias/${id}`, { method: "DELETE" });
    cargar();
  }

  return (
    <Card>
      <SectionTitle>Categorías de empleado</SectionTitle>
      <p className="mb-4 text-sm text-slate-500 dark:text-[#94a19c]">
        Puestos propios de esta sucursal: mozo, cocinero, cajero, repartidor… Los que borrés dejan
        a esos empleados sin categoría, no los desactivan.
      </p>
      <form onSubmit={crear} className="mb-4 flex gap-2">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Mozo" required />
        <Button type="submit" disabled={cargando} className="shrink-0">
          <Plus size={16} />
          Agregar
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>

      {categorias.length === 0 ? (
        <EmptyState inCard={false}>Sin categorías todavía</EmptyState>
      ) : (
        <div className="flex flex-wrap gap-2">
          {categorias.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-sm dark:bg-[#18201d]"
            >
              {c.nombre}
              <button
                type="button"
                onClick={() => eliminar(c.id)}
                aria-label={`Eliminar ${c.nombre}`}
                className="grid h-5 w-5 place-items-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/40"
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
