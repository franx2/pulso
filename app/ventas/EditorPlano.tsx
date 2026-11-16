"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, ErrorText, Input, Label, Panel, Select } from "@/components/ui";
import { ancho, choca, tamanoGrilla } from "@/lib/ventas/plano";

type MesaEditable = { id: string; numero: number; fila: number; columna: number; forma: "CUADRADA" | "REDONDA"; tamano: "CHICA" | "GRANDE"; ocupada: boolean };
type SalonEditable = { id: string; nombre: string; mesas: MesaEditable[] };

async function pedir(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
  return data;
}

/**
 * Armar el plano como es el local: las mesas se arrastran a su lugar (con el
 * dedo o el mouse) o se mueven con las flechas del teclado. Cada cambio se
 * guarda al soltar; si el lugar está ocupado, la mesa vuelve a donde estaba.
 */
export default function EditorPlano({
  localId,
  salones,
  salonId,
  onSalonId,
  onCambio,
}: {
  localId: string;
  salones: SalonEditable[];
  salonId: string;
  onSalonId: (id: string) => void;
  onCambio: () => Promise<void>;
}) {
  const salon = salones.find((s) => s.id === salonId) ?? salones[0];
  const [mesas, setMesas] = useState<MesaEditable[]>(salon?.mesas ?? []);
  const [sel, setSel] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<{ id: string; dx: number; fila: number; columna: number } | null>(null);
  const [error, setError] = useState("");
  const [nombre, setNombre] = useState(salon?.nombre ?? "");
  const [nuevoSalon, setNuevoSalon] = useState("");
  const grilla = useRef<HTMLDivElement>(null);

  // Lo que llega del servidor manda, salvo en medio de un arrastre.
  useEffect(() => {
    if (arrastre) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copia local editable de lo que llega del servidor
    setMesas(salon?.mesas ?? []);
    setNombre(salon?.nombre ?? "");
  }, [salon, arrastre]);

  if (!salon) return null;

  const usadas = tamanoGrilla(mesas);
  // Margen para poder llevar mesas más allá de las que ya hay.
  const columnas = Math.max(10, usadas.columnas + 2);
  const filas = Math.max(6, usadas.filas + 2);
  const elegida = mesas.find((m) => m.id === sel) ?? null;

  async function guardar(id: string, cambios: Partial<MesaEditable> & { salonId?: string }, deshacer: MesaEditable[]) {
    setError("");
    try {
      await pedir(`/api/ventas/mesas/${id}`, "PATCH", cambios);
      await onCambio();
    } catch (e) {
      setMesas(deshacer);
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  function mover(m: MesaEditable, fila: number, columna: number) {
    if (fila === m.fila && columna === m.columna) return;
    const destino = { ...m, fila, columna };
    if (fila < 0 || columna < 0 || columna + ancho(m) > columnas || choca(mesas, destino)) {
      setError("Ahí ya hay otra mesa o se sale del plano");
      return;
    }
    const antes = mesas;
    setMesas(mesas.map((x) => (x.id === m.id ? destino : x)));
    void guardar(m.id, { fila, columna }, antes);
  }

  function celdaDe(e: React.PointerEvent) {
    const g = grilla.current!;
    const estilo = getComputedStyle(g);
    const celda = parseFloat(estilo.gridTemplateColumns.split(" ")[0]);
    const hueco = parseFloat(estilo.columnGap) || 0;
    const caja = g.getBoundingClientRect();
    return {
      columna: Math.floor((e.clientX - caja.left - parseFloat(estilo.paddingLeft)) / (celda + hueco)),
      fila: Math.floor((e.clientY - caja.top - parseFloat(estilo.paddingTop)) / (celda + hueco)),
    };
  }

  const posicion = (m: MesaEditable) => (arrastre?.id === m.id ? { fila: arrastre.fila, columna: arrastre.columna } : m);
  const arrastreValido = (() => {
    if (!arrastre) return true;
    const m = mesas.find((x) => x.id === arrastre.id)!;
    return arrastre.columna >= 0 && arrastre.fila >= 0 && arrastre.columna + ancho(m) <= columnas && !choca(mesas, { ...m, ...arrastre });
  })();

  async function agregar(tamano: "CHICA" | "GRANDE") {
    setError("");
    try {
      const nueva = await pedir("/api/ventas/mesas", "POST", { salonId: salon.id, tamano });
      await onCambio();
      setSel(nueva.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar");
    }
  }

  async function accion(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => agregar("CHICA")}>
            <Plus size={15} aria-hidden />
            Mesa chica
          </Button>
          <Button variant="ghost" onClick={() => agregar("GRANDE")}>
            <Plus size={15} aria-hidden />
            Mesa grande
          </Button>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel className="min-w-0">
          <p className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-500 dark:border-[#1c2521] dark:text-[#94a19c]">
            Arrastrá cada mesa a su lugar. Tocá una para cambiarle el número, la forma o el tamaño; con una elegida, las flechas del teclado también la mueven.
          </p>
          <div className="overflow-auto p-4">
            <div
              ref={grilla}
              className="relative mx-auto grid w-max gap-1.5 rounded-lg p-2 [--u:3.6rem] sm:[--u:4.4rem]"
              style={{ gridTemplateColumns: `repeat(${columnas}, var(--u))`, gridTemplateRows: `repeat(${filas}, var(--u))` }}
            >
              {/* Los casilleros: dónde puede ir una mesa. */}
              {Array.from({ length: filas * columnas }, (_, k) => (
                <div
                  key={k}
                  aria-hidden
                  className="rounded-md border border-dashed border-slate-200 dark:border-[#1f2f2b]"
                  style={{ gridColumn: (k % columnas) + 1, gridRow: Math.floor(k / columnas) + 1 }}
                />
              ))}
              {mesas.map((m) => {
                const p = posicion(m);
                const enArrastre = arrastre?.id === m.id;
                const elegidaEsta = sel === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-label={`Mesa ${m.numero}, fila ${p.fila + 1}, columna ${p.columna + 1}${m.ocupada ? ", con venta abierta" : ""}`}
                    aria-pressed={elegidaEsta}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setSel(m.id);
                      const c = celdaDe(e);
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      setArrastre({ id: m.id, dx: c.columna - m.columna, fila: m.fila, columna: m.columna });
                    }}
                    onPointerMove={(e) => {
                      if (!arrastre || arrastre.id !== m.id) return;
                      const c = celdaDe(e);
                      const fila = Math.max(0, Math.min(filas - 1, c.fila));
                      const columna = Math.max(0, Math.min(columnas - ancho(m), c.columna - arrastre.dx));
                      if (fila !== arrastre.fila || columna !== arrastre.columna) setArrastre({ ...arrastre, fila, columna });
                    }}
                    onPointerUp={() => {
                      if (!arrastre || arrastre.id !== m.id) return;
                      const destino = { fila: arrastre.fila, columna: arrastre.columna };
                      setArrastre(null);
                      if (arrastreValido) mover(m, destino.fila, destino.columna);
                    }}
                    onPointerCancel={() => setArrastre(null)}
                    onKeyDown={(e) => {
                      const paso: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
                      const d = paso[e.key];
                      if (!d) return;
                      e.preventDefault();
                      mover(m, m.fila + d[0], m.columna + d[1]);
                    }}
                    style={{ gridColumn: `${p.columna + 1} / span ${ancho(m)}`, gridRow: p.fila + 1, touchAction: "none" }}
                    className={`relative z-10 flex cursor-grab select-none flex-col items-center justify-center border-2 text-center transition-[box-shadow,transform] duration-100 active:cursor-grabbing ${
                      m.forma === "REDONDA" ? "rounded-full" : "rounded-lg"
                    } ${
                      enArrastre
                        ? arrastreValido
                          ? "scale-105 border-[#0f766e] bg-emerald-50 shadow-[0_10px_24px_-10px_rgba(15,118,110,0.7)] dark:bg-[#123a33]"
                          : "scale-105 border-rose-500 bg-rose-50 dark:bg-[#3a1720]"
                        : elegidaEsta
                          ? "border-[#0f766e] bg-white ring-2 ring-[#37e6b0] ring-offset-2 dark:bg-[#101c19] dark:ring-offset-[#101c19]"
                          : m.ocupada
                            ? "border-[#0f766e] bg-[#0f766e] text-white dark:bg-[#1d4e48]"
                            : "border-slate-300 bg-white hover:border-slate-400 dark:border-[#29403b] dark:bg-[#101c19]"
                    }`}
                  >
                    <span className="text-lg font-bold leading-none">{m.numero}</span>
                    <span className="mt-0.5 text-[0.6875rem] leading-none opacity-70">{m.tamano === "GRANDE" ? "grande" : "chica"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel className="p-4">
            {elegida ? (
              <FichaMesa
                key={elegida.id}
                mesa={elegida}
                salones={salones}
                salonId={salon.id}
                onMover={(df, dc) => mover(elegida, elegida.fila + df, elegida.columna + dc)}
                onGuardar={(cambios) => {
                  const antes = mesas;
                  if (cambios.tamano && choca(mesas, { ...elegida, tamano: cambios.tamano })) {
                    setError("Grande no entra ahí: corré la mesa de al lado primero");
                    return;
                  }
                  setMesas(mesas.map((x) => (x.id === elegida.id ? { ...x, ...cambios } : x)));
                  void guardar(elegida.id, cambios, antes);
                }}
                onPasar={(destino) => {
                  setSel(null);
                  void accion(() => pedir(`/api/ventas/mesas/${elegida.id}`, "PATCH", { salonId: destino }));
                }}
                onSacar={() => {
                  setSel(null);
                  void accion(() => pedir(`/api/ventas/mesas/${elegida.id}`, "DELETE"));
                }}
              />
            ) : (
              <p className="text-sm text-slate-500 dark:text-[#94a19c]">Tocá una mesa para editarla.</p>
            )}
          </Panel>

          <Panel className="flex flex-col gap-3 p-4">
            <h3 className="text-sm font-semibold">Salón</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void accion(() => pedir(`/api/ventas/salones/${salon.id}`, "PATCH", { nombre }));
              }}
              className="flex gap-2"
            >
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del salón" />
              <Button type="submit" variant="ghost" disabled={!nombre.trim() || nombre === salon.nombre}>
                Guardar
              </Button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void accion(async () => {
                  const s = await pedir("/api/ventas/salones", "POST", { localId, nombre: nuevoSalon });
                  setNuevoSalon("");
                  onSalonId(s.id);
                });
              }}
              className="flex gap-2"
            >
              <Input value={nuevoSalon} onChange={(e) => setNuevoSalon(e.target.value)} placeholder="Salón nuevo (Vereda…)" aria-label="Nombre del salón nuevo" />
              <Button type="submit" variant="ghost" disabled={!nuevoSalon.trim()}>
                <Plus size={15} aria-hidden />
                Crear
              </Button>
            </form>
            {salones.length > 1 && (
              <Button variant="danger" onClick={() => void accion(() => pedir(`/api/ventas/salones/${salon.id}`, "DELETE"))}>
                <Trash2 size={15} aria-hidden />
                Borrar {salon.nombre}
              </Button>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function FichaMesa({
  mesa,
  salones,
  salonId,
  onMover,
  onGuardar,
  onPasar,
  onSacar,
}: {
  mesa: MesaEditable;
  salones: SalonEditable[];
  salonId: string;
  onMover: (df: number, dc: number) => void;
  onGuardar: (cambios: Partial<MesaEditable>) => void;
  onPasar: (salonId: string) => void;
  onSacar: () => void;
}) {
  const [numero, setNumero] = useState(String(mesa.numero));
  const [confirmar, setConfirmar] = useState(false);
  const opcion = (activo: boolean) =>
    `min-h-10 flex-1 rounded-md px-3 text-sm font-semibold transition-colors ${
      activo ? "bg-[#0f766e] text-white dark:bg-[#1d4e48]" : "text-slate-600 hover:bg-slate-100 dark:text-[#c1cbc6] dark:hover:bg-[#172724]"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">Mesa {mesa.numero}</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(numero);
          if (n !== mesa.numero) onGuardar({ numero: n });
        }}
        className="flex items-end gap-2"
      >
        <div className="flex-1">
          <Label>Número</Label>
          <Input inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))} />
        </div>
        <Button type="submit" variant="ghost" disabled={!numero || Number(numero) === mesa.numero}>
          Cambiar
        </Button>
      </form>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-[#94a19c]">Forma</p>
        <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-[#29403b]">
          <button type="button" className={opcion(mesa.forma === "CUADRADA")} aria-pressed={mesa.forma === "CUADRADA"} onClick={() => onGuardar({ forma: "CUADRADA" })}>
            Cuadrada
          </button>
          <button type="button" className={opcion(mesa.forma === "REDONDA")} aria-pressed={mesa.forma === "REDONDA"} onClick={() => onGuardar({ forma: "REDONDA" })}>
            Redonda
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-[#94a19c]">Tamaño</p>
        <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-[#29403b]">
          <button type="button" className={opcion(mesa.tamano === "CHICA")} aria-pressed={mesa.tamano === "CHICA"} onClick={() => onGuardar({ tamano: "CHICA" })}>
            Chica
          </button>
          <button type="button" className={opcion(mesa.tamano === "GRANDE")} aria-pressed={mesa.tamano === "GRANDE"} onClick={() => onGuardar({ tamano: "GRANDE" })}>
            Grande
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-[#94a19c]">Mover un casillero</p>
        <div className="grid w-32 grid-cols-3 gap-1">
          <span />
          <Button variant="ghost" className="px-0" onClick={() => onMover(-1, 0)} aria-label="Mover arriba">
            <ArrowUp size={16} aria-hidden />
          </Button>
          <span />
          <Button variant="ghost" className="px-0" onClick={() => onMover(0, -1)} aria-label="Mover a la izquierda">
            <ArrowLeft size={16} aria-hidden />
          </Button>
          <Button variant="ghost" className="px-0" onClick={() => onMover(1, 0)} aria-label="Mover abajo">
            <ArrowDown size={16} aria-hidden />
          </Button>
          <Button variant="ghost" className="px-0" onClick={() => onMover(0, 1)} aria-label="Mover a la derecha">
            <ArrowRight size={16} aria-hidden />
          </Button>
        </div>
      </div>

      {salones.length > 1 && (
        <div>
          <Label>Pasar a otro salón</Label>
          <Select value="" onChange={(e) => e.target.value && onPasar(e.target.value)}>
            <option value="">Elegí el salón</option>
            {salones
              .filter((s) => s.id !== salonId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
          </Select>
        </div>
      )}

      {confirmar ? (
        <div className="flex flex-col gap-2 rounded-lg bg-rose-50 p-3 text-sm dark:bg-[#241419]">
          <p>¿Sacar la mesa {mesa.numero} del plano? Si ya tuvo ventas, el historial la sigue mostrando.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirmar(false)}>
              No
            </Button>
            <Button variant="danger" onClick={onSacar}>
              Sí, sacarla
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirmar(true)} disabled={mesa.ocupada} title={mesa.ocupada ? "Tiene una venta abierta" : undefined}>
          <Trash2 size={15} aria-hidden />
          Sacar mesa
        </Button>
      )}
    </div>
  );
}
