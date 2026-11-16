import { db } from "@/lib/db";
import { instanteAR } from "@/lib/fechaAR";

export const ESTADOS_RESERVA = ["PENDIENTE", "CONFIRMADA", "SENTADA", "CANCELADA", "NO_VINO"] as const;
export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

export const SELECT_RESERVA = {
  id: true,
  fecha: true,
  personas: true,
  nombre: true,
  telefono: true,
  comentario: true,
  estado: true,
  clienteId: true,
  mesa: { select: { id: true, numero: true } },
} as const;

export function aReserva(r: {
  id: string;
  fecha: Date;
  personas: number;
  nombre: string;
  telefono: string | null;
  comentario: string | null;
  estado: string;
  clienteId: string | null;
  mesa: { id: string; numero: number } | null;
}) {
  return { ...r, fecha: r.fecha.toISOString() };
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Los campos de una reserva, limpios. Todo es opcional (sirve para editar);
 * el alta valida aparte que estén día, hora, personas y nombre.
 */
export async function datosDeReserva(localId: string, body: Record<string, unknown> | null) {
  const str = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string).trim() : undefined);
  const ok: {
    fecha?: Date;
    personas?: number;
    nombre?: string;
    telefono?: string | null;
    comentario?: string | null;
    estado?: EstadoReserva;
    mesaId?: string | null;
    clienteId?: string | null;
  } = {};

  const dia = str("dia");
  const hora = str("hora");
  if (dia !== undefined || hora !== undefined) {
    if (!dia || !hora || !DIA.test(dia) || !HORA.test(hora)) return { error: "Elegí el día y la hora" };
    ok.fecha = instanteAR(dia, hora);
  }
  if (body?.personas !== undefined) {
    const n = Number(body.personas);
    if (!Number.isInteger(n) || n < 1 || n > 200) return { error: "Las personas van de 1 a 200" };
    ok.personas = n;
  }
  const nombre = str("nombre");
  if (nombre !== undefined) {
    if (!nombre) return { error: "Escribí a nombre de quién" };
    ok.nombre = nombre.slice(0, 80);
  }
  const telefono = str("telefono");
  if (telefono !== undefined) ok.telefono = telefono.slice(0, 40) || null;
  const comentario = str("comentario");
  if (comentario !== undefined) ok.comentario = comentario.slice(0, 300) || null;
  if (body?.estado !== undefined) {
    const e = ESTADOS_RESERVA.find((x) => x === body.estado);
    if (!e) return { error: "Estado inválido" };
    ok.estado = e;
  }
  if (body?.mesaId !== undefined) {
    if (!body.mesaId) ok.mesaId = null;
    else {
      const mesa = await db.mesa.findFirst({ where: { id: String(body.mesaId), salon: { localId } }, select: { id: true } });
      if (!mesa) return { error: "Esa mesa no es de este local" };
      ok.mesaId = mesa.id;
    }
  }
  if (body?.clienteId !== undefined) {
    if (!body.clienteId) ok.clienteId = null;
    else {
      const c = await db.cliente.findFirst({ where: { id: String(body.clienteId), localId }, select: { id: true } });
      if (!c) return { error: "Ese cliente no es de este local" };
      ok.clienteId = c.id;
    }
  }
  return { ok };
}
