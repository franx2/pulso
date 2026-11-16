"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, Pencil, Phone, Trash2, Users } from "lucide-react";
import { Button, ErrorText, Input, Label, PageTitle, Panel, PanelHeader, Select, Textarea, useConfirm } from "@/components/ui";
import { SelectorLocal } from "@/components/BarraContexto";
import { horaAR, hoyAR, sumarDias, claveDiaAR } from "@/lib/fechaAR";
import { fechaLarga } from "@/lib/formato";
import { NavVentas, useLocalVentas } from "../comun";
import { ElegirCliente, type ClienteElegido } from "../ElegirCliente";

type EstadoReserva = "PENDIENTE" | "CONFIRMADA" | "SENTADA" | "CANCELADA" | "NO_VINO";
type Reserva = {
  id: string;
  fecha: string;
  personas: number;
  nombre: string;
  telefono: string | null;
  comentario: string | null;
  estado: EstadoReserva;
  clienteId: string | null;
  mesa: { id: string; numero: number } | null;
};
type Mesa = { id: string; numero: number; salon: string };

const ESTADO: Record<EstadoReserva, { label: string; clase: string }> = {
  PENDIENTE: { label: "Sin confirmar", clase: "bg-slate-100 text-slate-700" },
  CONFIRMADA: { label: "Confirmada", clase: "bg-emerald-100 text-emerald-800" },
  SENTADA: { label: "Llegó", clase: "bg-slate-950 text-[#FDFDFC]" },
  CANCELADA: { label: "Cancelada", clase: "bg-rose-50 text-rose-700" },
  NO_VINO: { label: "No vino", clase: "bg-amber-100 text-amber-800" },
};

async function pedir(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar");
  return data;
}

export default function ReservasClient() {
  const router = useRouter();
  const [localGuardado, setLocalGuardado] = useLocalVentas();
  const [locales, setLocales] = useState<{ id: string; nombre: string }[]>([]);
  const [localId, setLocalId] = useState("");
  const [dia, setDia] = useState(hoyAR);
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [editando, setEditando] = useState<Reserva | null>(null);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();

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
    const d = await pedir(`/api/ventas/reservas?localId=${localId}&dia=${dia}`, "GET");
    setReservas(d.reservas);
    setMesas(d.mesas);
  }, [localId, dia]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al cambiar de local o de día
    cargar().catch((e: Error) => setError(e.message));
  }, [cargar]);

  async function cambiarEstado(r: Reserva, estado: EstadoReserva) {
    setError("");
    try {
      await pedir(`/api/ventas/reservas/${r.id}`, "PATCH", { estado });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  }

  /** Llegaron: se abre su mesa con las personas y el cliente de la reserva. */
  async function sentar(r: Reserva) {
    setError("");
    try {
      if (r.mesa) {
        const v = await pedir("/api/ventas", "POST", {
          localId,
          tipo: "MESA",
          mesaId: r.mesa.id,
          comensales: r.personas,
          ...(r.clienteId ? { clienteId: r.clienteId } : { cliente: r.nombre }),
          comentario: r.comentario ?? undefined,
        });
        await pedir(`/api/ventas/reservas/${r.id}`, "PATCH", { estado: "SENTADA" });
        router.push(`/ventas/${v.id}`);
      } else {
        await cambiarEstado(r, "SENTADA");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la mesa");
    }
  }

  const activas = reservas?.filter((r) => r.estado === "PENDIENTE" || r.estado === "CONFIRMADA") ?? [];
  const personas = activas.reduce((s, r) => s + r.personas, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        subtitle={reservas ? `${activas.length} por llegar · ${personas} personas` : undefined}
        actions={<NavVentas activo="reservas" />}
      >
        Reservas
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        {locales.length > 1 && <SelectorLocal locales={locales} valor={localId} onChange={setLocalGuardado} todos={null} />}
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={() => setDia(sumarDias(dia, -1))} aria-label="Día anterior" className="px-3">
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <Input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="w-44 py-2" aria-label="Día" />
          <Button variant="ghost" onClick={() => setDia(sumarDias(dia, 1))} aria-label="Día siguiente" className="px-3">
            <ChevronRight size={16} aria-hidden />
          </Button>
          {dia !== hoyAR() && (
            <Button variant="ghost" onClick={() => setDia(hoyAR())}>
              Hoy
            </Button>
          )}
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel className="min-w-0">
          <PanelHeader titulo={fechaLarga(dia)} />
          {reservas === null ? (
            <div className="m-4 h-40 animate-pulse rounded-md bg-slate-100" />
          ) : reservas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <CalendarClock size={26} className="text-slate-400" aria-hidden />
              <p className="font-semibold">No hay reservas para este día.</p>
              <p className="text-sm text-slate-500">Cargá la primera con el formulario.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {reservas.map((r) => {
                const cerrada = r.estado === "SENTADA" || r.estado === "CANCELADA" || r.estado === "NO_VINO";
                return (
                  <li key={r.id} className={`flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 ${cerrada ? "opacity-60" : ""}`}>
                    <p className="w-14 text-xl font-bold tabular-nums">{horaAR(r.fecha)}</p>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {r.nombre}{" "}
                        <span className={`ml-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 align-middle text-[0.6875rem] font-semibold ${ESTADO[r.estado].clase}`}>{ESTADO[r.estado].label}</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Users size={13} aria-hidden />
                          {r.personas}
                        </span>
                        <span>{r.mesa ? `Mesa ${r.mesa.numero}` : "Sin mesa asignada"}</span>
                        {r.telefono && (
                          <a href={`tel:${r.telefono}`} className="inline-flex items-center gap-1 underline">
                            <Phone size={13} aria-hidden />
                            {r.telefono}
                          </a>
                        )}
                      </p>
                      {r.comentario && <p className="mt-0.5 text-xs italic text-slate-500">“{r.comentario}”</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!cerrada && (
                        <>
                          {r.estado === "PENDIENTE" && (
                            <Button variant="ghost" onClick={() => cambiarEstado(r, "CONFIRMADA")} className="min-h-9 px-3">
                              Confirmar
                            </Button>
                          )}
                          <Button onClick={() => sentar(r)} className="min-h-9 px-3">
                            Llegaron
                          </Button>
                          <Button variant="ghost" onClick={() => cambiarEstado(r, "NO_VINO")} className="min-h-9 px-3">
                            No vino
                          </Button>
                          <Button variant="ghost" onClick={() => cambiarEstado(r, "CANCELADA")} className="min-h-9 px-3">
                            Cancelar
                          </Button>
                        </>
                      )}
                      {cerrada && r.estado !== "SENTADA" && (
                        <Button variant="ghost" onClick={() => cambiarEstado(r, "PENDIENTE")} className="min-h-9 px-3">
                          Reactivar
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => setEditando(r)} aria-label={`Editar la reserva de ${r.nombre}`} className="min-h-9 px-2.5">
                        <Pencil size={15} aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Borrar la reserva de ${r.nombre}`}
                        className="min-h-9 px-2.5"
                        onClick={() =>
                          confirm({
                            title: "Borrar la reserva",
                            message: `${r.nombre}, ${horaAR(r.fecha)}. Si no vienen, mejor marcala "No vino": así queda registrado.`,
                            confirmLabel: "Borrar",
                            tone: "danger",
                            onConfirm: async () => {
                              await pedir(`/api/ventas/reservas/${r.id}`, "DELETE");
                              await cargar();
                            },
                          })
                        }
                      >
                        <Trash2 size={15} aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {localId && (
          <FormReserva
            key={editando?.id ?? `nueva-${dia}`}
            localId={localId}
            dia={dia}
            mesas={mesas}
            reserva={editando}
            onCancelar={() => setEditando(null)}
            onGuardada={async (diaGuardado) => {
              setEditando(null);
              if (diaGuardado !== dia) setDia(diaGuardado);
              else await cargar();
            }}
          />
        )}
      </div>
      {dialog}
    </div>
  );
}

function FormReserva({
  localId,
  dia,
  mesas,
  reserva,
  onCancelar,
  onGuardada,
}: {
  localId: string;
  dia: string;
  mesas: Mesa[];
  reserva: Reserva | null;
  onCancelar: () => void;
  onGuardada: (dia: string) => void;
}) {
  const [fecha, setFecha] = useState(reserva ? claveDiaAR(reserva.fecha) : dia);
  const [hora, setHora] = useState(reserva ? horaAR(reserva.fecha) : "21:00");
  const [personas, setPersonas] = useState(String(reserva?.personas ?? 2));
  const [cliente, setCliente] = useState<ClienteElegido>({ id: reserva?.clienteId ?? null, nombre: reserva?.nombre ?? "" });
  const [telefono, setTelefono] = useState(reserva?.telefono ?? "");
  const [mesaId, setMesaId] = useState(reserva?.mesa?.id ?? "");
  const [comentario, setComentario] = useState(reserva?.comentario ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      const datos = {
        localId,
        dia: fecha,
        hora,
        personas: Number(personas),
        nombre: cliente.nombre,
        clienteId: cliente.id,
        telefono,
        mesaId: mesaId || null,
        comentario,
      };
      if (reserva) await pedir(`/api/ventas/reservas/${reserva.id}`, "PATCH", datos);
      else await pedir("/api/ventas/reservas", "POST", datos);
      onGuardada(fecha);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  return (
    <Panel className="xl:sticky xl:top-20">
      <PanelHeader titulo={reserva ? `Editar la reserva de ${reserva.nombre}` : "Nueva reserva"} />
      <form onSubmit={guardar} className="grid grid-cols-2 gap-3 p-4">
        <div>
          <Label>Día</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </div>
        <div>
          <Label>Hora</Label>
          <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} required step={900} />
        </div>
        <div className="col-span-2">
          <ElegirCliente localId={localId} valor={cliente} onChange={setCliente} label="A nombre de" />
        </div>
        <div>
          <Label>Personas</Label>
          <Input inputMode="numeric" value={personas} onChange={(e) => setPersonas(e.target.value.replace(/\D/g, ""))} required />
        </div>
        <div>
          <Label>Teléfono</Label>
          <Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="261 …" />
        </div>
        <div className="col-span-2">
          <Label>Mesa</Label>
          <Select value={mesaId} onChange={(e) => setMesaId(e.target.value)}>
            <option value="">Se asigna al llegar</option>
            {mesas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.salon} · mesa {m.numero}
              </option>
            ))}
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Comentario</Label>
          <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} placeholder="Cumpleaños, silla para bebé…" className="min-h-16" />
        </div>
        <div className="col-span-2">
          <ErrorText>{error}</ErrorText>
        </div>
        {reserva && (
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={guardando || !cliente.nombre.trim()} className={reserva ? "" : "col-span-2"}>
          {guardando ? "Guardando…" : reserva ? "Guardar" : "Reservar"}
        </Button>
      </form>
    </Panel>
  );
}
