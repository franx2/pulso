"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Minus, Plus, ShoppingBag, Users } from "lucide-react";
import { Button, ErrorText, Input, Label, Modal, PageTitle, Panel, PanelHeader, SelectorSegmentado } from "@/components/ui";
import { SelectorLocal } from "@/components/BarraContexto";
import { plata } from "@/lib/formato";
import { NavVentas, tiempoDesde, useLocalVentas } from "./comun";

type VentaResumen = {
  id: string;
  numero: number;
  abiertaEn: string;
  comensales: number | null;
  cliente: string | null;
  mozo: string | null;
  total: number;
  sinEnviar: number;
  cobrado: number;
};
type Mesa = { id: string; numero: number; fila: number; columna: number; forma: "CUADRADA" | "REDONDA"; tamano: "CHICA" | "GRANDE"; venta: VentaResumen | null };
type Salon = { id: string; nombre: string; mesas: Mesa[] };
type Estado = {
  locales: { id: string; nombre: string }[];
  localId: string | null;
  salones: Salon[];
  mostrador: VentaResumen[];
  caja: { id: string; nombre: string; abiertaEn: string } | null;
  permisos: Record<string, boolean>;
};

const REFRESCO_MS = 15_000;

export default function SalonClient() {
  const router = useRouter();
  const [localGuardado, setLocalGuardado] = useLocalVentas();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [salonId, setSalonId] = useState("");
  const [error, setError] = useState("");
  const [abriendo, setAbriendo] = useState<{ tipo: "MESA"; mesa: Mesa } | { tipo: "MOSTRADOR" } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/ventas/salon${localGuardado ? `?localId=${localGuardado}` : ""}`);
    if (!res.ok) throw new Error("No pudimos cargar el salón");
    const data: Estado = await res.json();
    setEstado(data);
    setAhora(Date.now());
    setError("");
  }, [localGuardado]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch + refresco periódico, sin librería de datos
    cargar().catch((e: Error) => setError(e.message));
    const id = setInterval(() => cargar().catch(() => undefined), REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  const salon = useMemo(
    () => estado?.salones.find((s) => s.id === salonId) ?? estado?.salones[0] ?? null,
    [estado, salonId]
  );

  if (error && !estado) return <ErrorText>{error}</ErrorText>;
  if (!estado) return <div className="h-96 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Cargando el salón" />;

  if (!estado.localId) {
    return (
      <div className="flex flex-col gap-5">
        <PageTitle actions={<NavVentas activo="salon" />}>Ventas</PageTitle>
        <Panel className="p-6 text-center">
          <p className="font-semibold">Todavía no hay ningún local con salones cargados.</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#94a19c]">Importá la carta y el plano de Fudo desde Configuración.</p>
          <Link href="/ventas/configuracion" className="mt-4 inline-flex font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-[#4ee6b0]">
            Ir a Configuración
          </Link>
        </Panel>
      </div>
    );
  }

  const todas = estado.salones.flatMap((s) => s.mesas);
  const ocupadas = todas.filter((m) => m.venta);
  const abierto = [...ocupadas.map((m) => m.venta!.total), ...estado.mostrador.map((v) => v.total)].reduce((s, t) => s + t, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        subtitle={`${ocupadas.length} de ${todas.length} mesas ocupadas · ${plata(abierto)} en ventas abiertas`}
        actions={<NavVentas activo="salon" />}
      >
        Ventas
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">beta</span>
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        {estado.locales.length > 1 && (
          <SelectorLocal locales={estado.locales} valor={estado.localId} onChange={setLocalGuardado} todos={null} />
        )}
        {estado.salones.length > 1 && (
          <SelectorSegmentado
            label="Salón"
            valor={salon?.id ?? ""}
            onChange={setSalonId}
            opciones={estado.salones.map((s) => ({
              clave: s.id,
              label: `${s.nombre} · ${s.mesas.filter((m) => m.venta).length}/${s.mesas.length}`,
            }))}
          />
        )}
        <div className="ml-auto">
          <Button onClick={() => setAbriendo({ tipo: "MOSTRADOR" })} disabled={!estado.permisos.create_additions}>
            <ShoppingBag size={16} aria-hidden />
            Venta en mostrador
          </Button>
        </div>
      </div>

      {!estado.caja && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-[#5a4a2f] dark:bg-[#241f14] dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            No hay caja abierta. Se pueden tomar pedidos, pero para cobrar hay que{" "}
            <Link href="/ventas/caja" className="font-semibold underline underline-offset-2">
              abrir la caja
            </Link>
            .
          </span>
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          <PanelHeader titulo={salon?.nombre ?? "Salón"} descripcion="Tocá una mesa libre para abrirla, o una ocupada para ver el pedido." />
          {salon && salon.mesas.length > 0 ? (
            <Plano mesas={salon.mesas} ahora={ahora} onMesa={(m) => (m.venta ? router.push(`/ventas/${m.venta.id}`) : setAbriendo({ tipo: "MESA", mesa: m }))} />
          ) : (
            <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-[#94a19c]">Este salón no tiene mesas.</p>
          )}
        </Panel>

        <Panel>
          <PanelHeader titulo="Mostrador" descripcion={estado.mostrador.length ? undefined : "Sin pedidos abiertos."} />
          {estado.mostrador.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-[#1c2521]">
              {estado.mostrador.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/ventas/${v.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 dark:hover:bg-[#172724]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        #{v.numero}
                        {v.cliente && ` · ${v.cliente}`}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-[#94a19c]">
                        hace {tiempoDesde(v.abiertaEn, ahora)}
                        {v.sinEnviar > 0 && ` · ${v.sinEnviar} sin enviar`}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{plata(v.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {abriendo && (
        <AbrirVenta
          localId={estado.localId}
          destino={abriendo}
          onClose={() => setAbriendo(null)}
          onAbierta={(id) => router.push(`/ventas/${id}`)}
        />
      )}
    </div>
  );
}

/**
 * El plano: las mesas en la grilla de Fudo (cada mesa ocupa 2×2 casilleros).
 * Libre es papel; ocupada es teal con el total y el tiempo; un punto ámbar
 * avisa que hay productos cargados sin enviar a cocina.
 */
function Plano({ mesas, ahora, onMesa }: { mesas: Mesa[]; ahora: number; onMesa: (m: Mesa) => void }) {
  const columnas = Math.max(...mesas.map((m) => m.columna)) + 2;
  const filas = Math.max(...mesas.map((m) => m.fila)) + 2;
  return (
    <div className="overflow-auto p-4">
      <div
        className="mx-auto grid w-max gap-1.5 rounded-lg bg-[radial-gradient(circle,rgba(100,116,139,0.18)_1px,transparent_1px)] bg-[length:1.5rem_1.5rem] p-2 [--u:2.6rem] sm:[--u:3.1rem] dark:bg-[radial-gradient(circle,rgba(148,161,156,0.14)_1px,transparent_1px)]"
        style={{ gridTemplateColumns: `repeat(${columnas}, var(--u))`, gridTemplateRows: `repeat(${filas}, var(--u))` }}
      >
        {mesas.map((m) => {
          const v = m.venta;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onMesa(m)}
              aria-label={v ? `Mesa ${m.numero}, ocupada, ${plata(v.total)}` : `Mesa ${m.numero}, libre`}
              style={{ gridColumn: `${m.columna + 1} / span 2`, gridRow: `${m.fila + 1} / span 2` }}
              className={`relative flex flex-col items-center justify-center border text-center transition-[transform,background-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 active:scale-[0.96] dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#101c19] ${
                m.forma === "REDONDA" ? "rounded-full" : "rounded-lg"
              } ${
                v
                  ? "border-[#0f766e] bg-[#0f766e] text-white shadow-[0_6px_14px_-8px_rgba(15,118,110,0.8)] hover:bg-[#115e59] dark:border-[#37e6b0] dark:bg-[#1d4e48]"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#c1cbc6] dark:hover:bg-[#172724]"
              }`}
            >
              <span className="text-lg font-bold leading-none sm:text-xl">{m.numero}</span>
              {v ? (
                <>
                  <span className="mt-1 text-[0.6875rem] font-semibold tabular-nums leading-none sm:text-xs">{plata(v.total)}</span>
                  <span className="mt-0.5 text-[0.6875rem] leading-none text-white/75">{tiempoDesde(v.abiertaEn, ahora)}</span>
                </>
              ) : (
                <span className="mt-1 text-[0.6875rem] leading-none text-slate-400 dark:text-[#5f6d67]">libre</span>
              )}
              {v && v.sinEnviar > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[0.6875rem] font-bold text-[#241703] ring-2 ring-white dark:ring-[#101c19]"
                  title={`${v.sinEnviar} sin enviar a cocina`}
                >
                  {v.sinEnviar}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AbrirVenta({
  localId,
  destino,
  onClose,
  onAbierta,
}: {
  localId: string;
  destino: { tipo: "MESA"; mesa: Mesa } | { tipo: "MOSTRADOR" };
  onClose: () => void;
  onAbierta: (id: string) => void;
}) {
  const [comensales, setComensales] = useState(2);
  const [cliente, setCliente] = useState("");
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState("");
  const esMesa = destino.tipo === "MESA";

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    setAbriendo(true);
    setError("");
    try {
      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId,
          tipo: destino.tipo,
          ...(esMesa ? { mesaId: destino.mesa.id, comensales } : { cliente }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo abrir");
      onAbierta(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir");
      setAbriendo(false);
    }
  }

  return (
    <Modal title={esMesa ? `Abrir la mesa ${destino.mesa.numero}` : "Venta en mostrador"} onClose={onClose} maxWidth="max-w-sm">
      <form onSubmit={abrir} className="flex flex-col gap-4">
        {esMesa ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Users size={15} aria-hidden />
              Comensales
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button type="button" variant="ghost" onClick={() => setComensales((n) => Math.max(1, n - 1))} aria-label="Uno menos">
                <Minus size={16} aria-hidden />
              </Button>
              <span className="w-12 text-center text-3xl font-bold tabular-nums" aria-live="polite">
                {comensales}
              </span>
              <Button type="button" variant="ghost" onClick={() => setComensales((n) => Math.min(40, n + 1))} aria-label="Uno más">
                <Plus size={16} aria-hidden />
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Label>Nombre para llamar (opcional)</Label>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Juan" autoFocus />
          </div>
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={abriendo}>
          {abriendo ? "Abriendo…" : esMesa ? "Abrir mesa" : "Empezar pedido"}
        </Button>
      </form>
    </Modal>
  );
}
