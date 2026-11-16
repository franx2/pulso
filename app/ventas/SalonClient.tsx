"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChefHat,
  Minus,
  Move,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  SquarePen,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Button, ErrorText, Input, Label, Modal, PageTitle, Panel, PanelHeader, Select, SelectorSegmentado, Textarea } from "@/components/ui";
import { SelectorLocal } from "@/components/BarraContexto";
import { plata } from "@/lib/formato";
import { horaAR } from "@/lib/fechaAR";
import type { VentaCompleta } from "@/lib/ventas/consultas";
import { ETIQUETA_MOTIVO, imprimir, NavVentas, tiempoDesde, useLocalVentas } from "./comun";
import { ElegirCliente, type ClienteElegido } from "./ElegirCliente";
import EditorPlano from "./EditorPlano";
import { ancho, tamanoGrilla } from "@/lib/ventas/plano";

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
type Reserva = { id: string; fecha: string; personas: number; nombre: string; telefono: string | null; comentario: string | null; clienteId: string | null; mesaId: string | null };
type Estado = {
  locales: { id: string; nombre: string }[];
  localId: string | null;
  salones: Salon[];
  mostrador: VentaResumen[];
  caja: { id: string; nombre: string; abiertaEn: string } | null;
  mozos: { id: string; nombre: string }[];
  reservas: Reserva[];
  yo: string;
  permisos: Record<string, boolean>;
};

const REFRESCO_MS = 15_000;

async function pedir(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar");
  return data;
}

export default function SalonClient() {
  const router = useRouter();
  const [localGuardado, setLocalGuardado] = useLocalVentas();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [salonId, setSalonId] = useState("");
  const [error, setError] = useState("");
  const [mostrador, setMostrador] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [editando, setEditando] = useState(false);
  const [mesaSel, setMesaSel] = useState<string | null>(null);

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
  const todas = useMemo(() => estado?.salones.flatMap((s) => s.mesas.map((m) => ({ ...m, salonId: s.id }))) ?? [], [estado]);
  const elegida = todas.find((m) => m.id === mesaSel) ?? null;

  /** "Ir a mesa": salta al salón de esa mesa y la abre en el panel. */
  function irAMesa(numero: number) {
    const m = todas.find((x) => x.numero === numero);
    if (!m) return false;
    setSalonId(m.salonId);
    setMesaSel(m.id);
    return true;
  }

  async function abrirExpress() {
    try {
      const r = await pedir("/api/ventas", "POST", { localId: estado!.localId, tipo: "MOSTRADOR" });
      router.push(`/ventas/${r.id}?express=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la venta");
    }
  }

  if (error && !estado) return <ErrorText>{error}</ErrorText>;
  if (!estado) return <div className="h-96 animate-pulse rounded-lg bg-slate-200/70" aria-label="Cargando el salón" />;

  if (!estado.localId) {
    return (
      <div className="flex flex-col gap-5">
        <PageTitle actions={<NavVentas activo="salon" />}>Ventas</PageTitle>
        <Panel className="p-6 text-center">
          <p className="font-semibold">Todavía no hay ningún local con salones cargados.</p>
          <p className="mt-1 text-sm text-slate-500">Importá la carta y el plano de Fudo desde Configuración.</p>
          <Link href="/ventas/configuracion" className="mt-4 inline-flex font-semibold text-slate-950 underline">
            Ir a Configuración
          </Link>
        </Panel>
      </div>
    );
  }

  const ocupadas = todas.filter((m) => m.venta);
  const abierto = [...ocupadas.map((m) => m.venta!.total), ...estado.mostrador.map((v) => v.total)].reduce((s, t) => s + t, 0);
  const reservaDe = (mesaId: string) => estado.reservas.find((r) => r.mesaId === mesaId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        subtitle={`${ocupadas.length} de ${todas.length} mesas ocupadas · ${plata(abierto)} en ventas abiertas`}
        actions={<NavVentas activo="salon" />}
      >
        Ventas
        <span className="rounded-sm border border-arena-300 bg-arena-50 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-[0.12em] text-arena-700">BETA</span>
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        {estado.locales.length > 1 && (
          <SelectorLocal
            locales={estado.locales}
            valor={estado.localId}
            onChange={(id) => {
              setMesaSel(null);
              setLocalGuardado(id);
            }}
            todos={null}
          />
        )}
        {estado.salones.length > 1 && (
          <SelectorSegmentado
            label="Salón"
            valor={salon?.id ?? ""}
            onChange={(id) => {
              setMesaSel(null);
              setSalonId(id);
            }}
            opciones={estado.salones.map((s) => ({
              clave: s.id,
              label: `${s.nombre} · ${s.mesas.filter((m) => m.venta).length}/${s.mesas.length}`,
            }))}
          />
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {estado.permisos.admin_rooms && (
            <Button
              variant={editando ? "primary" : "ghost"}
              onClick={() => {
                setMesaSel(null);
                setEditando(!editando);
              }}
            >
              {editando ? <Check size={16} aria-hidden /> : <Move size={16} aria-hidden />}
              {editando ? "Listo" : "Editar plano"}
            </Button>
          )}
          {!editando && (
            <>
              <Button variant="ghost" onClick={() => setMostrador(true)} disabled={!estado.permisos.create_additions}>
                <ShoppingBag size={16} aria-hidden />
                Mostrador
              </Button>
              <Button onClick={abrirExpress} disabled={!estado.permisos.create_additions}>
                <Zap size={16} aria-hidden />
                Mostrador express
              </Button>
            </>
          )}
        </div>
      </div>

      {editando && salon && (
        <EditorPlano
          localId={estado.localId}
          salones={estado.salones.map((s) => ({ ...s, mesas: s.mesas.map((m) => ({ ...m, ocupada: Boolean(m.venta) })) }))}
          salonId={salon.id}
          onSalonId={setSalonId}
          onCambio={cargar}
        />
      )}

      {!estado.caja && !editando && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
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

      <div className={`grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] ${editando ? "hidden" : ""}`}>
        <Panel className="min-w-0">
          <PanelHeader titulo={salon?.nombre ?? "Salón"} descripcion="Tocá una mesa para ver su pedido o abrirla." action={<IrAMesa onIr={irAMesa} />} />
          <Leyenda mesas={salon?.mesas ?? []} ahora={ahora} reservaDe={reservaDe} />
          {salon && salon.mesas.length > 0 ? (
            <Plano mesas={salon.mesas} ahora={ahora} seleccionada={mesaSel} reservaDe={reservaDe} onMesa={(m) => setMesaSel(m.id === mesaSel ? null : m.id)} />
          ) : (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Este salón no tiene mesas.</p>
          )}
        </Panel>

        {elegida ? (
          <PanelMesa
            key={elegida.id}
            mesa={elegida}
            estado={estado}
            reserva={reservaDe(elegida.id)}
            ahora={ahora}
            onClose={() => setMesaSel(null)}
            onCambio={cargar}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <Panel>
              <PanelHeader titulo="Mostrador" descripcion={estado.mostrador.length ? undefined : "Sin pedidos abiertos."} />
              {estado.mostrador.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {estado.mostrador.map((v) => (
                    <li key={v.id}>
                      <Link
                        href={`/ventas/${v.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-950"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            #{v.numero}
                            {v.cliente && ` · ${v.cliente}`}
                          </span>
                          <span className="text-xs text-slate-500">
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
            <Panel>
              <PanelHeader
                titulo="Reservas de hoy"
                descripcion={estado.reservas.length ? undefined : "No hay reservas por llegar."}
                action={
                  <Link href="/ventas/reservas" className="text-sm font-semibold text-slate-950 underline underline-offset-2">
                    Ver todas
                  </Link>
                }
              />
              {estado.reservas.length > 0 && (
                <ul className="divide-y divide-slate-100 text-sm">
                  {estado.reservas.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-12 font-semibold tabular-nums">{horaAR(r.fecha)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {r.nombre} <span className="text-slate-500">· {r.personas} p.</span>
                      </span>
                      <span className="text-xs text-slate-500">{r.mesaId ? `Mesa ${todas.find((m) => m.id === r.mesaId)?.numero ?? "?"}` : "Sin mesa"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </div>

      {mostrador && <AbrirMostrador localId={estado.localId} onClose={() => setMostrador(false)} onAbierta={(id) => router.push(`/ventas/${id}`)} />}
    </div>
  );
}

function IrAMesa({ onIr }: { onIr: (numero: number) => boolean }) {
  const [texto, setTexto] = useState("");
  const [noEsta, setNoEsta] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const ok = onIr(Number(texto));
        setNoEsta(!ok);
        if (ok) setTexto("");
      }}
      className="flex items-center gap-1.5"
    >
      <label className="relative">
        <span className="sr-only">Ir a la mesa número</span>
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          inputMode="numeric"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value.replace(/\D/g, ""));
            setNoEsta(false);
          }}
          placeholder="Ir a mesa"
          aria-invalid={noEsta}
          className={`w-32 py-1.5 pl-8 text-sm ${noEsta ? "border-rose-400" : ""}`}
        />
      </label>
      {noEsta && <span className="text-xs text-rose-700">No existe</span>}
    </form>
  );
}

/** Más de esto abierta, la mesa se marca: puede estar esperando o haberse olvidado de cerrar. */
const MINUTOS_DEMORA = 90;

type EstadoMesa = "libre" | "reservada" | "ocupada" | "cobrando" | "demorada";

function estadoMesa(m: Mesa, ahora: number, reservada: boolean): EstadoMesa {
  const v = m.venta;
  if (!v) return reservada ? "reservada" : "libre";
  if (v.cobrado > 0 && v.cobrado < v.total) return "cobrando";
  if (ahora - new Date(v.abiertaEn).getTime() > MINUTOS_DEMORA * 60_000) return "demorada";
  return "ocupada";
}

/** Libre es papel; ocupada es tinta, como el negro de la marca; cobrando, arena. */
const ESTILO_MESA: Record<EstadoMesa, { mesa: string; muestra: string; nota: string }> = {
  libre: { mesa: "border-slate-300 bg-[#FDFDFC] text-slate-800 hover:border-slate-500", muestra: "border-slate-300 bg-[#FDFDFC]", nota: "text-slate-400" },
  reservada: {
    mesa: "border-dashed border-emerald-600 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
    muestra: "border-dashed border-emerald-600 bg-emerald-50",
    nota: "text-emerald-800",
  },
  ocupada: { mesa: "border-slate-950 bg-slate-950 text-[#FDFDFC] hover:bg-slate-800", muestra: "border-slate-950 bg-slate-950", nota: "text-[#FDFDFC]/70" },
  cobrando: { mesa: "border-arena-500 bg-arena-300 text-slate-950 hover:bg-arena-200", muestra: "border-arena-500 bg-arena-300", nota: "text-slate-700" },
  demorada: {
    mesa: "border-rose-700 bg-slate-950 text-[#FDFDFC] ring-2 ring-rose-600 ring-offset-2 ring-offset-[#FDFDFC] hover:bg-slate-800",
    muestra: "border-rose-700 bg-slate-950 ring-1 ring-rose-600",
    nota: "text-[#FDFDFC]/70",
  },
};

const ETIQUETA_ESTADO: Record<EstadoMesa, string> = {
  libre: "Libre",
  reservada: "Reservada hoy",
  ocupada: "Ocupada",
  cobrando: "Pagando (cobro parcial)",
  demorada: `Abierta hace más de ${MINUTOS_DEMORA} min`,
};

/** Qué significa cada color, con cuántas mesas hay en cada estado. */
function Leyenda({ mesas, ahora, reservaDe }: { mesas: Mesa[]; ahora: number; reservaDe: (id: string) => Reserva | null }) {
  const cuenta = (e: EstadoMesa) => mesas.filter((m) => estadoMesa(m, ahora, Boolean(reservaDe(m.id))) === e).length;
  const sinEnviar = mesas.filter((m) => (m.venta?.sinEnviar ?? 0) > 0).length;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-600">
      {(Object.keys(ESTILO_MESA) as EstadoMesa[]).map((e) => (
        <li key={e} className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-[2px] border ${ESTILO_MESA[e].muestra}`} aria-hidden />
          {ETIQUETA_ESTADO[e]} <span className="font-semibold tabular-nums">{cuenta(e)}</span>
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-amber-500" aria-hidden />
        Con pedido sin enviar <span className="font-semibold tabular-nums">{sinEnviar}</span>
      </li>
    </ul>
  );
}

function Plano({
  mesas,
  ahora,
  seleccionada,
  reservaDe,
  onMesa,
}: {
  mesas: Mesa[];
  ahora: number;
  seleccionada: string | null;
  reservaDe: (id: string) => Reserva | null;
  onMesa: (m: Mesa) => void;
}) {
  // La grilla real del local: cada mesa en su fila y columna, las grandes
  // ocupan dos columnas. Se arma en "Editar plano".
  const { columnas, filas } = tamanoGrilla(mesas);
  return (
    <div className="overflow-auto p-4">
      <div
        className="mx-auto grid w-max gap-1.5 rounded-lg bg-[radial-gradient(circle,rgba(112,107,96,0.2)_1px,transparent_1px)] bg-[length:1.5rem_1.5rem] p-2 [--u:3.6rem] sm:[--u:4.4rem]"
        style={{ gridTemplateColumns: `repeat(${columnas}, var(--u))`, gridTemplateRows: `repeat(${filas}, var(--u))` }}
      >
        {mesas.map((m) => {
          const v = m.venta;
          const reserva = reservaDe(m.id);
          const estado = estadoMesa(m, ahora, Boolean(reserva));
          const estilo = ESTILO_MESA[estado];
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onMesa(m)}
              aria-pressed={seleccionada === m.id}
              aria-label={v ? `Mesa ${m.numero}, ${ETIQUETA_ESTADO[estado].toLowerCase()}, ${plata(v.total)}` : `Mesa ${m.numero}, ${ETIQUETA_ESTADO[estado].toLowerCase()}`}
              style={{ gridColumn: `${m.columna + 1} / span ${ancho(m)}`, gridRow: m.fila + 1 }}
              className={`relative flex flex-col items-center justify-center border text-center transition-[transform,background-color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 active:scale-[0.96] ${
                m.forma === "REDONDA" ? "rounded-full" : "rounded-md"
              } ${estilo.mesa} ${seleccionada === m.id ? "outline-2 outline-offset-[3px] outline-arena-500" : ""}`}
            >
              <span className="text-lg font-bold leading-none sm:text-xl">{m.numero}</span>
              {v ? (
                <>
                  <span className="mt-1 text-[0.6875rem] font-semibold tabular-nums leading-none sm:text-xs">{plata(v.total)}</span>
                  <span className={`mt-0.5 text-[0.6875rem] leading-none ${estilo.nota}`}>{tiempoDesde(v.abiertaEn, ahora)}</span>
                </>
              ) : (
                <span className={`mt-1 text-[0.6875rem] leading-none ${estilo.nota}`}>{reserva ? horaAR(reserva.fecha) : "libre"}</span>
              )}
              {v && v.sinEnviar > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[0.6875rem] font-bold text-[#241703] ring-2 ring-[#FDFDFC]"
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

/**
 * El panel de la mesa, a la derecha como en Fudo (en el celular, una hoja que
 * sube desde abajo). Libre: el formulario para abrirla. Ocupada: el pedido,
 * con lo que falta enviar, lo que está en cocina y lo anulado, y las acciones.
 */
function PanelMesa({
  mesa,
  estado,
  reserva,
  ahora,
  onClose,
  onCambio,
}: {
  mesa: Mesa;
  estado: Estado;
  reserva: Reserva | null;
  ahora: number;
  onClose: () => void;
  onCambio: () => Promise<void>;
}) {
  const ocupada = Boolean(mesa.venta);
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-slate-950/40 motion-safe:animate-[velo_160ms_ease-out] xl:hidden" onClick={onClose} aria-hidden />
      <aside
        aria-label={`Mesa ${mesa.numero}`}
        className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[88vh] flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-[#FDFDFC] shadow-[0_-12px_32px_rgba(22,19,17,0.18)] motion-safe:animate-[subir_220ms_cubic-bezier(0.16,1,0.3,1)] xl:sticky xl:top-20 xl:z-auto xl:max-h-[calc(100vh-6rem)] xl:rounded-lg xl:shadow-none xl:motion-safe:animate-[deslizar_200ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        <header className={`flex items-center justify-between gap-3 px-4 py-3 ${ocupada ? "bg-slate-950 text-[#FDFDFC]" : "bg-emerald-700 text-[#FDFDFC]"}`}>
          <div>
            <h2 className="titulo-marca text-lg font-bold leading-none">Mesa {mesa.numero}</h2>
            <p className="mt-1 text-xs opacity-80">
              {ocupada
                ? `#${mesa.venta!.numero} · abierta hace ${tiempoDesde(mesa.venta!.abiertaEn, ahora)}`
                : reserva
                  ? `Reservada ${horaAR(reserva.fecha)} · ${reserva.nombre}`
                  : "Libre"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar el panel"
            className="grid h-10 w-10 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDFDFC]"
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {ocupada ? (
            <PedidoDeMesa ventaId={mesa.venta!.id} version={`${mesa.venta!.total}-${mesa.venta!.sinEnviar}-${mesa.venta!.cobrado}`} onCambio={onCambio} />
          ) : (
            <AbrirMesa mesa={mesa} estado={estado} reserva={reserva} />
          )}
        </div>
      </aside>
    </>
  );
}

/** El formulario de Fudo para abrir una mesa: personas, cliente, camarero, comentario. */
function AbrirMesa({ mesa, estado, reserva }: { mesa: Mesa; estado: Estado; reserva: Reserva | null }) {
  const router = useRouter();
  const [usarReserva, setUsarReserva] = useState(false);
  const [personas, setPersonas] = useState(2);
  const [cliente, setCliente] = useState<ClienteElegido>({ id: null, nombre: "" });
  // Quien abre queda de camarero (como en Fudo), salvo que elija a otro.
  const [mozoId, setMozoId] = useState(estado.mozos.some((m) => m.id === estado.yo) ? estado.yo : "");
  const [comentario, setComentario] = useState("");
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState("");

  function sentarReserva() {
    if (!reserva) return;
    setUsarReserva(true);
    setPersonas(reserva.personas);
    setCliente({ id: reserva.clienteId, nombre: reserva.nombre });
    if (reserva.comentario) setComentario(reserva.comentario);
  }

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    setAbriendo(true);
    setError("");
    try {
      const r = await pedir("/api/ventas", "POST", {
        localId: estado.localId,
        tipo: "MESA",
        mesaId: mesa.id,
        comensales: personas,
        ...(cliente.id ? { clienteId: cliente.id } : { cliente: cliente.nombre }),
        mozoId: mozoId || undefined,
        comentario,
      });
      if (usarReserva && reserva) await pedir(`/api/ventas/reservas/${reserva.id}`, "PATCH", { estado: "SENTADA" }).catch(() => undefined);
      router.push(`/ventas/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir");
      setAbriendo(false);
    }
  }

  return (
    <form onSubmit={abrir} className="flex flex-col gap-4 p-4">
      {reserva && !usarReserva && (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-emerald-600 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <CalendarClock size={16} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <strong>{horaAR(reserva.fecha)}</strong> · {reserva.nombre} · {reserva.personas} personas
            {reserva.telefono && <span className="block text-xs">{reserva.telefono}</span>}
          </span>
          <Button type="button" variant="ghost" onClick={sentarReserva} className="min-h-9 px-3">
            Llegaron
          </Button>
        </div>
      )}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <Users size={15} aria-hidden />
          Personas
        </p>
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => setPersonas((n) => Math.max(1, n - 1))} aria-label="Una persona menos" className="px-3">
            <Minus size={16} aria-hidden />
          </Button>
          <span className="w-12 text-center text-3xl font-bold tabular-nums" aria-live="polite">
            {personas}
          </span>
          <Button type="button" variant="ghost" onClick={() => setPersonas((n) => Math.min(40, n + 1))} aria-label="Una persona más" className="px-3">
            <Plus size={16} aria-hidden />
          </Button>
        </div>
      </div>
      <ElegirCliente localId={estado.localId!} valor={cliente} onChange={setCliente} />
      <div>
        <Label>Camarero</Label>
        <Select value={mozoId} onChange={(e) => setMozoId(e.target.value)} disabled={!estado.permisos.assign_waiter}>
          {!estado.mozos.some((m) => m.id === estado.yo) && <option value="">Yo (quien abre la mesa)</option>}
          {estado.mozos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Comentario</Label>
        <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} placeholder="Sale impreso en las comandas" className="min-h-16" />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={abriendo || !estado.permisos.create_additions} className="min-h-12 text-base">
        {abriendo ? "Abriendo…" : "Abrir mesa"}
      </Button>
    </form>
  );
}

const ETIQUETA_COCINA: Record<string, string> = { PENDIENTE: "en cola", PREPARANDO: "preparando", LISTO: "listo", ENTREGADO: "entregado" };

/** Lo que tiene la mesa pedido, con lo justo para atenderla sin salir del salón. */
function PedidoDeMesa({ ventaId, version, onCambio }: { ventaId: string; version: string; onCambio: () => Promise<void> }) {
  const [datos, setDatos] = useState<{ venta: VentaCompleta; permisos: Record<string, boolean> } | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => pedir(`/api/ventas/${ventaId}`, "GET").then(setDatos), [ventaId]);
  useEffect(() => {
    cargar().catch((e: Error) => setError(e.message));
  }, [cargar, version]);

  if (!datos) return error ? <p className="p-4"><ErrorText>{error}</ErrorText></p> : <div className="m-4 h-48 animate-pulse rounded-md bg-slate-100" />;
  const { venta, permisos } = datos;
  const sinEnviar = venta.items.filter((i) => !i.anulado && !i.enviadoEn);
  const enviados = venta.items.filter((i) => !i.anulado && i.enviadoEn);
  const anulados = venta.items.filter((i) => i.anulado);

  async function enviar() {
    setEnviando(true);
    setError("");
    try {
      const r = await pedir(`/api/ventas/${ventaId}/enviar`, "POST");
      imprimir(`/ventas/${ventaId}/imprimir?tipo=comanda&enviadoEn=${encodeURIComponent(r.enviadoEn)}`);
      await Promise.all([cargar(), onCambio()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setEnviando(false);
    }
  }

  const fila = (i: (typeof venta.items)[number], extra: string) => (
    <li key={i.id} className="flex items-baseline gap-2 px-4 py-1.5 text-sm">
      <span className="w-7 shrink-0 font-semibold tabular-nums text-slate-500">{i.cantidad}×</span>
      <span className="min-w-0 flex-1">
        {i.nombre}
        {(extra || i.comentario) && <span className="block text-xs text-slate-500">{[extra, i.comentario].filter(Boolean).join(" · ")}</span>}
      </span>
      <span className="tabular-nums">{plata(i.precio * i.cantidad)}</span>
    </li>
  );

  return (
    <div className="flex flex-col">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Camarero</dt>
          <dd className="font-medium">{venta.mozo?.nombre ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Personas</dt>
          <dd className="font-medium tabular-nums">{venta.comensales ?? "—"}</dd>
        </div>
        {venta.cliente && (
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Cliente</dt>
            <dd className="font-medium">{venta.cliente}</dd>
          </div>
        )}
        {venta.comentario && <p className="col-span-2 text-xs italic text-slate-500">“{venta.comentario}”</p>}
      </dl>

      {venta.items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Todavía no se cargó nada.</p>
      ) : (
        <div className="py-2">
          {sinEnviar.length > 0 && (
            <>
              <p className="titulo-marca px-4 pb-1 pt-2 text-[0.6875rem] font-semibold text-amber-800">Sin enviar a cocina</p>
              <ul className="bg-amber-50/70">{sinEnviar.map((i) => fila(i, ""))}</ul>
            </>
          )}
          {enviados.length > 0 && (
            <>
              <p className="titulo-marca px-4 pb-1 pt-3 text-[0.6875rem] font-semibold text-slate-500">Adiciones</p>
              <ul>{enviados.map((i) => fila(i, `${i.cocina?.nombre ?? "Sin cocina"} · ${ETIQUETA_COCINA[i.estadoCocina]}`))}</ul>
            </>
          )}
          {anulados.length > 0 && (
            <ul className="mt-1 text-slate-400">
              {anulados.map((i) => (
                <li key={i.id} className="flex items-baseline gap-2 px-4 py-1 text-xs">
                  <span className="w-7 shrink-0 tabular-nums">{i.cantidad}×</span>
                  <span className="min-w-0 flex-1 line-through">{i.nombre}</span>
                  <span>Cancelado: {ETIQUETA_MOTIVO[i.motivoAnulacion ?? ""] ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="sticky bottom-0 mt-auto border-t border-slate-200 bg-[#FDFDFC] px-4 py-3">
        <dl className="grid grid-cols-[1fr_auto] gap-y-0.5 text-sm">
          {(venta.descuento > 0 || venta.descuentoItems > 0) && (
            <>
              <dt className="text-slate-500">Descuentos</dt>
              <dd className="text-right tabular-nums text-violet-700">−{plata(venta.descuento + venta.descuentoItems)}</dd>
            </>
          )}
          <dt className="titulo-marca self-end text-sm font-semibold">Total</dt>
          <dd className="text-right text-2xl font-bold tabular-nums">{plata(venta.total)}</dd>
          {venta.pagado > 0 && (
            <>
              <dt className="text-slate-500">Cobrado · falta</dt>
              <dd className="text-right tabular-nums">
                {plata(venta.pagado)} · <strong>{plata(venta.falta)}</strong>
              </dd>
            </>
          )}
        </dl>
        <ErrorText>{error}</ErrorText>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {sinEnviar.length > 0 && (
            <Button className="col-span-2" onClick={enviar} disabled={enviando || !permisos.create_additions}>
              <ChefHat size={16} aria-hidden />
              {enviando ? "Enviando…" : `Enviar a cocina (${sinEnviar.reduce((s, i) => s + i.cantidad, 0)})`}
            </Button>
          )}
          <Link
            href={`/ventas/${ventaId}`}
            className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-[#FDFDFC] px-4 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
          >
            <SquarePen size={16} aria-hidden />
            Agregar o editar productos
          </Link>
          <Button variant="ghost" onClick={() => imprimir(`/ventas/${ventaId}/imprimir?tipo=precuenta`)} disabled={!permisos.print_control || venta.items.length === 0}>
            <Printer size={16} aria-hidden />
            Precuenta
          </Button>
          <Link
            href={`/ventas/${ventaId}?cobrar=1`}
            aria-disabled={!permisos.create_payments || venta.total <= 0}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 ${
              !permisos.create_payments || venta.total <= 0
                ? "pointer-events-none bg-slate-200 text-slate-500"
                : sinEnviar.length > 0
                  ? "border border-slate-300 bg-[#FDFDFC] text-slate-800 hover:bg-slate-50"
                  : "bg-slate-950 text-[#FDFDFC] hover:bg-slate-800"
            }`}
          >
            <Wallet size={16} aria-hidden />
            Cobrar
          </Link>
        </div>
      </div>
    </div>
  );
}

function AbrirMostrador({ localId, onClose, onAbierta }: { localId: string; onClose: () => void; onAbierta: (id: string) => void }) {
  const [cliente, setCliente] = useState<ClienteElegido>({ id: null, nombre: "" });
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState("");

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    setAbriendo(true);
    setError("");
    try {
      const r = await pedir("/api/ventas", "POST", { localId, tipo: "MOSTRADOR", ...(cliente.id ? { clienteId: cliente.id } : { cliente: cliente.nombre }) });
      onAbierta(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir");
      setAbriendo(false);
    }
  }

  return (
    <Modal title="Venta en mostrador" onClose={onClose} maxWidth="max-w-sm">
      <form onSubmit={abrir} className="flex flex-col gap-4">
        <ElegirCliente localId={localId} valor={cliente} onChange={setCliente} label="Nombre para llamar (opcional)" />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={abriendo}>
          {abriendo ? "Abriendo…" : "Empezar pedido"}
        </Button>
      </form>
    </Modal>
  );
}
