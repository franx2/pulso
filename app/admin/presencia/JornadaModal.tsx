"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Coffee, LogIn, LogOut, PencilLine, Play, Plus, ScanFace, Trash2, X } from "lucide-react";
import { Badge, Button, ErrorText, Input, Label, Modal, Select, Spinner } from "@/components/ui";
import { duracion } from "@/lib/formato";
import { horaAR, hoyAR, sumarDias } from "@/lib/fechaAR";

type Tipo = "ENTRADA" | "SALIDA" | "DESCANSO_INICIO" | "DESCANSO_FIN";
type FichajeDia = {
  id: string;
  tipo: Tipo;
  timestamp: string;
  corregido: boolean;
  rostro: string;
  distanciaM: number | null;
  local: string;
};
type Jornada = {
  empleado: { id: string; nombre: string };
  dia: string;
  turno: { horaInicio: string; horaFin: string; local: string } | null;
  horasTrabajadas: number;
  fichajes: FichajeDia[];
};

const ETIQUETA: Record<Tipo, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  DESCANSO_INICIO: "Inicio de descanso",
  DESCANSO_FIN: "Fin de descanso",
};
const ICONO: Record<Tipo, typeof LogIn> = { ENTRADA: LogIn, SALIDA: LogOut, DESCANSO_INICIO: Coffee, DESCANSO_FIN: Play };
const ROSTRO_DUDOSO = new Set(["NO_COINCIDE", "SIN_ROSTRO", "NO_REGISTRADO"]);

function diaLargo(dia: string) {
  if (dia === hoyAR()) return "Hoy";
  if (dia === sumarDias(hoyAR(), -1)) return "Ayer";
  const texto = new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * La jornada de una persona en un día, editable por el encargado: cargar lo
 * que faltó, corregir una hora, borrar lo que se marcó de más. Cada cambio
 * pide un motivo, que queda en el registro de cambios con quién lo hizo.
 */
export default function JornadaModal({
  empleadoId,
  nombre,
  diaInicial,
  onClose,
  onCambio,
}: {
  empleadoId: string;
  nombre: string;
  diaInicial?: string;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [dia, setDia] = useState(diaInicial ?? hoyAR());
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [motivo, setMotivo] = useState("");
  const [editando, setEditando] = useState<{ id: string; tipo: Tipo; hora: string } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<{ tipo: Tipo; hora: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/fichajes/jornada?empleadoId=${empleadoId}&dia=${dia}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "No se pudo cargar la jornada");
    setJornada(data);
  }, [empleadoId, dia]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reactivo al cambiar el día
    setJornada(null);
    cargar().catch((e: Error) => setError(e.message));
  }, [cargar]);

  async function enviar(url: string, method: "POST" | "PATCH" | "DELETE", body: object, mensaje: string) {
    if (!motivo.trim()) {
      setError("Escribí el motivo antes de guardar: queda registrado.");
      return;
    }
    setGuardando(true);
    setError("");
    setHecho("");
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, motivo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar");
        return;
      }
      setEditando(null);
      setNuevo(null);
      setBorrando(null);
      setHecho(mensaje);
      await cargar();
      onCambio();
    } catch {
      setError("No pudimos conectar con el servidor. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  const futuro = dia >= hoyAR();
  const sinMotivo = !motivo.trim();

  return (
    <Modal title={`Jornada de ${nombre}`} onClose={() => (guardando ? undefined : onClose())} maxWidth="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-1 py-1">
          <button
            type="button"
            onClick={() => setDia(sumarDias(dia, -1))}
            aria-label="Día anterior"
            className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <label className="flex min-w-0 flex-1 flex-col items-center">
            <span className="text-sm font-semibold">{diaLargo(dia)}</span>
            <input
              type="date"
              value={dia}
              max={hoyAR()}
              onChange={(e) => e.target.value && setDia(e.target.value)}
              className="bg-transparent text-xs text-slate-500 focus-visible:outline-none"
              aria-label="Elegir día"
            />
          </label>
          <button
            type="button"
            onClick={() => setDia(sumarDias(dia, 1))}
            disabled={futuro}
            aria-label="Día siguiente"
            className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:opacity-30"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>

        {!jornada ? (
          error ? <ErrorText>{error}</ErrorText> : <Spinner />
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-500">
                {jornada.turno ? `Turno ${jornada.turno.horaInicio}–${jornada.turno.horaFin} · ${jornada.turno.local}` : "Sin turno ese día"}
              </span>
              <span className="font-semibold tabular-nums">{duracion(jornada.horasTrabajadas)}</span>
            </div>

            {jornada.fichajes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
                No fichó nada este día.
              </p>
            ) : (
              <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {jornada.fichajes.map((f) => {
                  const Icono = ICONO[f.tipo];
                  const enEdicion = editando?.id === f.id;
                  return (
                    <li key={f.id} className="px-3 py-2">
                      {borrando === f.id ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm">
                            ¿Borrar {ETIQUETA[f.tipo].toLowerCase()} de las <strong className="tabular-nums">{horaAR(f.timestamp)}</strong>?
                          </p>
                          <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setBorrando(null)} disabled={guardando}>
                              No
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => enviar(`/api/fichajes/${f.id}`, "DELETE", {}, "Fichaje borrado.")}
                              disabled={guardando || sinMotivo}
                            >
                              <Trash2 size={15} aria-hidden />
                              {guardando ? "Borrando…" : "Sí, borrar"}
                            </Button>
                          </div>
                          {sinMotivo && <p className="w-full text-xs text-amber-800">Escribí el motivo abajo para poder borrarlo.</p>}
                        </div>
                      ) : enEdicion ? (
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[9rem] flex-1">
                            <Label>Tipo</Label>
                            <Select value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as Tipo })}>
                              {(Object.keys(ETIQUETA) as Tipo[]).map((t) => (
                                <option key={t} value={t}>
                                  {ETIQUETA[t]}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div className="w-28">
                            <Label>Hora</Label>
                            <Input type="time" value={editando.hora} onChange={(e) => setEditando({ ...editando, hora: e.target.value })} />
                          </div>
                          <Button
                            onClick={() =>
                              enviar(`/api/fichajes/${f.id}`, "PATCH", { tipo: editando.tipo, hora: editando.hora }, "Fichaje corregido.")
                            }
                            disabled={guardando || sinMotivo}
                          >
                            <Check size={15} aria-hidden />
                            Guardar
                          </Button>
                          <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando} aria-label="Cancelar la edición">
                            <X size={15} aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <Icono size={16} className="shrink-0 text-slate-500" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">{ETIQUETA[f.tipo]}</p>
                            <div className="mt-0.5 flex flex-wrap gap-1.5">
                              {f.corregido && <Badge tone="slate">corregido</Badge>}
                              {ROSTRO_DUDOSO.has(f.rostro) && (
                                <Badge tone="amber">
                                  <span className="inline-flex items-center gap-1">
                                    <ScanFace size={11} aria-hidden />
                                    rostro sin verificar
                                  </span>
                                </Badge>
                              )}
                            </div>
                          </div>
                          <span className="text-sm font-semibold tabular-nums">{horaAR(f.timestamp)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setNuevo(null);
                              setBorrando(null);
                              setEditando({ id: f.id, tipo: f.tipo, hora: horaAR(f.timestamp) });
                            }}
                            aria-label={`Corregir ${ETIQUETA[f.tipo].toLowerCase()} de las ${horaAR(f.timestamp)}`}
                            className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                          >
                            <PencilLine size={16} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditando(null);
                              setBorrando(f.id);
                            }}
                            disabled={guardando}
                            aria-label={`Borrar ${ETIQUETA[f.tipo].toLowerCase()} de las ${horaAR(f.timestamp)}`}
                            className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            {nuevo ? (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
                <div className="min-w-[9rem] flex-1">
                  <Label>Qué falta</Label>
                  <Select value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as Tipo })}>
                    {(Object.keys(ETIQUETA) as Tipo[]).map((t) => (
                      <option key={t} value={t}>
                        {ETIQUETA[t]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-28">
                  <Label>Hora</Label>
                  <Input type="time" value={nuevo.hora} onChange={(e) => setNuevo({ ...nuevo, hora: e.target.value })} />
                </div>
                <Button
                  onClick={() => enviar("/api/fichajes/jornada", "POST", { empleadoId, dia, tipo: nuevo.tipo, hora: nuevo.hora }, "Fichaje cargado.")}
                  disabled={guardando || sinMotivo || !nuevo.hora}
                >
                  <Check size={15} aria-hidden />
                  Cargar
                </Button>
                <Button variant="ghost" onClick={() => setNuevo(null)} disabled={guardando} aria-label="Cancelar la carga">
                  <X size={15} aria-hidden />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditando(null);
                  const ultimo = jornada.fichajes[jornada.fichajes.length - 1];
                  // Lo más común es que falte la salida: se propone lo que sigue.
                  const siguiente: Tipo = !ultimo || ultimo.tipo === "SALIDA" ? "ENTRADA" : ultimo.tipo === "DESCANSO_INICIO" ? "DESCANSO_FIN" : "SALIDA";
                  setNuevo({ tipo: siguiente, hora: siguiente === "ENTRADA" ? (jornada.turno?.horaInicio ?? "09:00") : (jornada.turno?.horaFin ?? "") });
                }}
              >
                <Plus size={15} aria-hidden />
                Cargar un fichaje que falta
              </Button>
            )}

            <div>
              <Label>Motivo del cambio</Label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se quedó sin batería y avisó por WhatsApp" />
              <p className="mt-1 text-xs text-slate-500">
                Obligatorio. Queda en el registro de cambios con tu nombre, y el fichaje figura como corregido.
              </p>
            </div>

            <div aria-live="polite">
              <ErrorText>{error}</ErrorText>
              {hecho && !error && <p className="text-sm font-medium text-emerald-700">{hecho}</p>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
