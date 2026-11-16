"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChefHat, Undo2 } from "lucide-react";
import { Button, ErrorText, PageTitle, SelectorSegmentado } from "@/components/ui";
import { SelectorLocal } from "@/components/BarraContexto";
import { horaAR } from "@/lib/fechaAR";
import { NavVentas, tiempoDesde, useLocalVentas } from "../comun";

type EstadoCocina = "PENDIENTE" | "PREPARANDO" | "LISTO" | "ENTREGADO";
type Item = {
  id: string;
  nombre: string;
  cantidad: number;
  comentario: string | null;
  cocinaId: string | null;
  estadoCocina: EstadoCocina;
  enviadoEn: string;
  listoEn: string | null;
  venta: { id: string; numero: number; tipo: string; cliente: string | null; mesa: { numero: number } | null; mozo: { nombre: string } | null };
};

const REFRESCO_MS = 8_000;
/** Pasado esto, la comanda se marca: alguien está esperando. */
const MIN_AVISO = 15;
const MIN_TARDE = 25;
const SIGUIENTE: Record<EstadoCocina, EstadoCocina> = { PENDIENTE: "PREPARANDO", PREPARANDO: "LISTO", LISTO: "ENTREGADO", ENTREGADO: "ENTREGADO" };
const ETIQUETA: Record<EstadoCocina, string> = { PENDIENTE: "En cola", PREPARANDO: "Preparando", LISTO: "Listo", ENTREGADO: "Entregado" };

/**
 * El monitor de cocina: cada comanda (lo que se envió junto de una venta) es
 * una tarjeta, de la más vieja a la más nueva. Se toca un producto para
 * avanzarlo, o la tarjeta entera; al entregarla desaparece.
 */
export default function CocinaClient() {
  const [localGuardado, setLocalGuardado] = useLocalVentas();
  const [locales, setLocales] = useState<{ id: string; nombre: string }[]>([]);
  const [localId, setLocalId] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [cocinas, setCocinas] = useState<{ id: string; nombre: string }[]>([]);
  const [cocina, setCocina] = useState("todas");
  const [error, setError] = useState("");
  const [ahora, setAhora] = useState(() => Date.now());

  // El local: el mismo que se eligió en el salón.
  useEffect(() => {
    fetch(`/api/ventas/salon${localGuardado ? `?localId=${localGuardado}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setLocales(d.locales ?? []);
        setLocalId(d.localId ?? "");
      })
      .catch(() => setError("No pudimos cargar los locales"));
  }, [localGuardado]);

  const cargar = useCallback(async () => {
    if (!localId) return;
    const res = await fetch(`/api/ventas/cocina?localId=${localId}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? "No pudimos cargar la cocina");
    setItems(d.items);
    setCocinas(d.cocinas);
    setAhora(Date.now());
    setError("");
  }, [localId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch + refresco periódico, sin librería de datos
    cargar().catch((e: Error) => setError(e.message));
    const id = setInterval(() => cargar().catch(() => undefined), REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  async function mover(ids: string[], estado: EstadoCocina) {
    // Se ve al instante; la recarga deja lo que dice el servidor.
    setItems((xs) => xs?.map((i) => (ids.includes(i.id) ? { ...i, estadoCocina: estado } : i)).filter((i) => i.estadoCocina !== "ENTREGADO") ?? null);
    const res = await fetch("/api/ventas/cocina", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, estado }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "No se pudo actualizar");
    await cargar().catch(() => undefined);
  }

  const comandas = useMemo(() => {
    const visibles = (items ?? []).filter((i) => cocina === "todas" || i.cocinaId === cocina);
    const grupos = new Map<string, Item[]>();
    for (const i of visibles) {
      const k = `${i.venta.id}|${i.enviadoEn}`;
      grupos.set(k, [...(grupos.get(k) ?? []), i]);
    }
    return [...grupos.entries()].map(([clave, items]) => ({ clave, items, venta: items[0].venta, enviadoEn: items[0].enviadoEn }));
  }, [items, cocina]);

  const cuenta = (e: EstadoCocina) => (items ?? []).filter((i) => (cocina === "todas" || i.cocinaId === cocina) && i.estadoCocina === e).length;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle subtitle="Lo enviado a cocina, de lo más viejo a lo más nuevo. Se actualiza solo." actions={<NavVentas activo="cocina" />}>
        Monitor de cocina
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        {locales.length > 1 && <SelectorLocal locales={locales} valor={localId} onChange={setLocalGuardado} todos={null} />}
        {cocinas.length > 1 && (
          <SelectorSegmentado
            label="Cocina"
            valor={cocina}
            onChange={setCocina}
            opciones={[{ clave: "todas", label: "Todas" }, ...cocinas.map((c) => ({ clave: c.id, label: c.nombre }))]}
          />
        )}
        <p className="ml-auto flex gap-4 text-sm text-slate-600">
          {(["PENDIENTE", "PREPARANDO", "LISTO"] as EstadoCocina[]).map((e) => (
            <span key={e}>
              {ETIQUETA[e]} <strong className="tabular-nums text-slate-950">{cuenta(e)}</strong>
            </span>
          ))}
        </p>
      </div>

      <ErrorText>{error}</ErrorText>

      {items === null ? (
        <div className="h-64 animate-pulse rounded-lg bg-slate-200/70" aria-label="Cargando la cocina" />
      ) : comandas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 py-16 text-center">
          <ChefHat size={28} className="text-slate-400" aria-hidden />
          <p className="font-semibold">No hay nada pendiente.</p>
          <p className="text-sm text-slate-500">Cuando un mozo envíe una comanda, aparece acá.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {comandas.map(({ clave, items, venta, enviadoEn }) => {
            const min = Math.floor((ahora - new Date(enviadoEn).getTime()) / 60_000);
            const todosListos = items.every((i) => i.estadoCocina === "LISTO");
            const algunoEnCola = items.some((i) => i.estadoCocina === "PENDIENTE");
            const tono = min >= MIN_TARDE ? "border-rose-600" : min >= MIN_AVISO ? "border-amber-500" : "border-slate-200";
            return (
              <li key={clave} className={`flex flex-col overflow-hidden rounded-lg border-2 bg-[#FDFDFC] ${tono}`}>
                <div className={`flex items-baseline justify-between gap-2 px-3 py-2 ${todosListos ? "bg-emerald-700 text-[#FDFDFC]" : "bg-slate-950 text-[#FDFDFC]"}`}>
                  <p className="titulo-marca text-base font-bold">
                    {venta.mesa ? `Mesa ${venta.mesa.numero}` : `Mostrador #${venta.numero}`}
                    {!venta.mesa && venta.cliente && <span className="ml-1 font-medium normal-case tracking-normal"> · {venta.cliente}</span>}
                  </p>
                  <p className="shrink-0 text-xs tabular-nums opacity-80">
                    {horaAR(enviadoEn)} · {tiempoDesde(enviadoEn, ahora)}
                  </p>
                </div>
                {venta.mozo && <p className="border-b border-slate-100 px-3 py-1 text-xs text-slate-500">{venta.mozo.nombre}</p>}
                <ul className="flex-1 divide-y divide-slate-100">
                  {items.map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => mover([i.id], SIGUIENTE[i.estadoCocina])}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-950"
                        aria-label={`${i.cantidad} ${i.nombre}, ${ETIQUETA[i.estadoCocina].toLowerCase()}. Tocar para pasar a ${ETIQUETA[SIGUIENTE[i.estadoCocina]].toLowerCase()}`}
                      >
                        <span className="w-7 shrink-0 text-lg font-bold tabular-nums">{i.cantidad}</span>
                        <span className={`min-w-0 flex-1 ${i.estadoCocina === "LISTO" ? "text-slate-400 line-through" : ""}`}>
                          <span className="block text-base font-semibold leading-snug">{i.nombre}</span>
                          {i.comentario && <span className="block text-sm font-medium text-amber-800">» {i.comentario}</span>}
                        </span>
                        <span
                          className={`mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-semibold ${
                            i.estadoCocina === "LISTO"
                              ? "bg-emerald-100 text-emerald-800"
                              : i.estadoCocina === "PREPARANDO"
                                ? "bg-arena-200 text-arena-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {ETIQUETA[i.estadoCocina]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-2">
                  {todosListos ? (
                    <>
                      <Button variant="ghost" onClick={() => mover(items.map((i) => i.id), "PREPARANDO")} className="min-h-10">
                        <Undo2 size={15} aria-hidden />
                        Volver
                      </Button>
                      <Button onClick={() => mover(items.map((i) => i.id), "ENTREGADO")} className="min-h-10">
                        Entregado
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" onClick={() => mover(items.filter((i) => i.estadoCocina === "PENDIENTE").map((i) => i.id), "PREPARANDO")} disabled={!algunoEnCola} className="min-h-10">
                        Empezar
                      </Button>
                      <Button onClick={() => mover(items.map((i) => i.id), "LISTO")} className="min-h-10">
                        <Check size={15} aria-hidden />
                        Todo listo
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
