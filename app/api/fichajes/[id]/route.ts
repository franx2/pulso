import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";
import { auditar } from "@/lib/auditoria";
import { claveDiaAR, instanteAR } from "@/lib/fechaAR";

const TIPOS = ["ENTRADA", "SALIDA", "DESCANSO_INICIO", "DESCANSO_FIN"] as const;
type Tipo = (typeof TIPOS)[number];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * El encargado corrige un fichaje: la hora (del mismo día) o el tipo. Queda
 * marcado como corregido y auditado con el antes y el después.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody<{ hora?: string; tipo?: string; motivo?: string }>(request);
  const motivo = body?.motivo?.trim() ?? "";
  if (!motivo) return NextResponse.json({ error: "Escribí el motivo: queda en el registro de cambios" }, { status: 400 });
  if (body?.hora !== undefined && !HORA.test(body.hora)) return NextResponse.json({ error: "Hora inválida" }, { status: 400 });
  if (body?.tipo !== undefined && !(TIPOS as readonly string[]).includes(body.tipo)) {
    return NextResponse.json({ error: "Tipo de fichaje inválido" }, { status: 400 });
  }

  const actual = await db.fichaje.findUnique({ where: { id }, select: { id: true, tipo: true, timestamp: true } });
  if (!actual) return NextResponse.json({ error: "Fichaje no encontrado" }, { status: 404 });

  const timestamp = body?.hora ? instanteAR(claveDiaAR(actual.timestamp), body.hora) : actual.timestamp;
  if (timestamp.getTime() > Date.now() + 60_000) {
    return NextResponse.json({ error: "No se puede llevar un fichaje al futuro" }, { status: 400 });
  }

  const nuevo = await db.fichaje.update({
    where: { id },
    data: { timestamp, ...(body?.tipo ? { tipo: body.tipo as Tipo } : {}), corregido: true },
    select: { tipo: true, timestamp: true },
  });

  await auditar({
    entidad: "Fichaje",
    entidadId: id,
    accion: "MODIFICAR",
    autorId: session.empleadoId!,
    antes: { tipo: actual.tipo, timestamp: actual.timestamp.toISOString() },
    despues: { tipo: nuevo.tipo, timestamp: nuevo.timestamp.toISOString() },
    motivo: `Corregido por el encargado: ${motivo}`,
  });

  return NextResponse.json({ ok: true });
}

/** Borrar un fichaje marcado de más. El detalle sobrevive en la auditoría. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody<{ motivo?: string }>(request);
  const motivo = body?.motivo?.trim() ?? "";
  if (!motivo) return NextResponse.json({ error: "Escribí el motivo: queda en el registro de cambios" }, { status: 400 });

  const actual = await db.fichaje.findUnique({ where: { id }, select: { tipo: true, timestamp: true, empleadoId: true } });
  if (!actual) return NextResponse.json({ error: "Fichaje no encontrado" }, { status: 404 });

  await db.fichaje.delete({ where: { id } });
  await auditar({
    entidad: "Fichaje",
    entidadId: id,
    accion: "ELIMINAR",
    autorId: session.empleadoId!,
    antes: { empleadoId: actual.empleadoId, tipo: actual.tipo, timestamp: actual.timestamp.toISOString() },
    motivo: `Borrado por el encargado: ${motivo}`,
  });

  return NextResponse.json({ ok: true });
}
