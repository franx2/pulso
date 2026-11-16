"use client";

import { useEffect, useId, useState } from "react";
import { Input, Label } from "@/components/ui";

export type ClienteElegido = { id: string | null; nombre: string };
type ClienteLibreta = { id: string; nombre: string; telefono: string | null; descuentoPct: number | null };

/**
 * Cliente de una venta: se escribe un nombre libre ("Juan") o se elige uno de
 * la libreta, que trae su descuento y habilita la cuenta corriente. Usa la
 * lista nativa del navegador (datalist) en vez de un buscador propio.
 */
export function ElegirCliente({
  localId,
  valor,
  onChange,
  label = "Cliente",
}: {
  localId: string;
  valor: ClienteElegido;
  onChange: (v: ClienteElegido) => void;
  label?: string;
}) {
  const lista = useId();
  const [libreta, setLibreta] = useState<ClienteLibreta[]>([]);

  useEffect(() => {
    let vigente = true;
    fetch(`/api/ventas/clientes?localId=${localId}`)
      .then((r) => (r.ok ? r.json() : { clientes: [] }))
      .then((d) => vigente && setLibreta(d.clientes))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [localId]);

  const elegido = valor.id ? libreta.find((c) => c.id === valor.id) : null;

  return (
    <div>
      <Label>{label}</Label>
      <Input
        list={lista}
        value={valor.nombre}
        onChange={(e) => {
          const nombre = e.target.value;
          const ficha = libreta.find((c) => c.nombre.toLowerCase() === nombre.trim().toLowerCase());
          onChange({ id: ficha?.id ?? null, nombre });
        }}
        placeholder="Nombre, o buscalo en la libreta"
        autoComplete="off"
      />
      <datalist id={lista}>
        {libreta.map((c) => (
          <option key={c.id} value={c.nombre}>
            {[c.telefono, c.descuentoPct ? `${c.descuentoPct}% off` : null].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
      {elegido && (
        <p className="mt-1 text-xs text-emerald-700">
          De la libreta{elegido.descuentoPct ? ` · se aplica su ${elegido.descuentoPct}% de descuento` : ""} · puede pagar a cuenta corriente
        </p>
      )}
    </div>
  );
}
