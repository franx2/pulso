import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";
import { auditar } from "@/lib/auditoria";

/**
 * Resuelve una solicitud de corrección.
 *
 * Aprobar es lo único que puede tocar un fichaje ya registrado, así que todo
 * pasa por acá y queda auditado: se guarda el estado anterior del fichaje, el
 * nuevo, quién aprobó y con qué motivo.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody<{ aprobar: boolean; comentario?: string }>(request);
  if (!body || typeof body.aprobar !== "boolean") {
    return NextResponse.json({ error: "Indicá si se aprueba o se rechaza" }, { status: 400 });
  }

  const solicitud = await db.solicitudCorreccion.findUnique({
    where: { id },
    include: { fichaje: true, empleado: { select: { localId: true } } },
  });
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  if (solicitud.estado !== "PENDIENTE") {
    return NextResponse.json({ error: "Esa solicitud ya fue resuelta" }, { status: 409 });
  }

  if (!body.aprobar) {
    const rechazada = await db.solicitudCorreccion.update({
      where: { id },
      data: {
        estado: "RECHAZADA",
        resueltaPorId: session.empleadoId,
        resueltaEn: new Date(),
        comentario: body.comentario?.trim() || null,
      },
    });
    await auditar({
      entidad: "SolicitudCorreccion",
      entidadId: id,
      accion: "RECHAZAR",
      autorId: session.empleadoId!,
      motivo: body.comentario?.trim(),
    });
    return NextResponse.json({ solicitud: rechazada });
  }

  // Aprobada: aplicar el cambio al fichaje, dejando rastro del antes y el después.
  const antes = solicitud.fichaje
    ? { tipo: solicitud.fichaje.tipo, timestamp: solicitud.fichaje.timestamp.toISOString() }
    : null;
  let despues: Record<string, unknown> | null = null;

  await db.$transaction(async (tx) => {
    if (solicitud.tipo === "AGREGAR") {
      const creado = await tx.fichaje.create({
        data: {
          empleadoId: solicitud.empleadoId,
          localId: solicitud.empleado.localId,
          tipo: solicitud.tipoFichaje!,
          timestamp: solicitud.fechaHora!,
          corregido: true,
        },
      });
      despues = { id: creado.id, tipo: creado.tipo, timestamp: creado.timestamp.toISOString() };
      await tx.solicitudCorreccion.update({ where: { id }, data: { fichajeId: creado.id } });
    } else if (solicitud.tipo === "MODIFICAR" && solicitud.fichajeId) {
      const actualizado = await tx.fichaje.update({
        where: { id: solicitud.fichajeId },
        data: { tipo: solicitud.tipoFichaje!, timestamp: solicitud.fechaHora!, corregido: true },
      });
      despues = { tipo: actualizado.tipo, timestamp: actualizado.timestamp.toISOString() };
    } else if (solicitud.tipo === "ELIMINAR" && solicitud.fichajeId) {
      // La solicitud queda apuntando a null por el onDelete: SetNull, pero el
      // detalle del fichaje borrado sobrevive en la auditoría.
      await tx.fichaje.delete({ where: { id: solicitud.fichajeId } });
      despues = null;
    }

    await tx.solicitudCorreccion.update({
      where: { id },
      data: {
        estado: "APROBADA",
        resueltaPorId: session.empleadoId,
        resueltaEn: new Date(),
        comentario: body.comentario?.trim() || null,
      },
    });
  });

  await auditar({
    entidad: "Fichaje",
    entidadId: solicitud.fichajeId ?? id,
    accion: solicitud.tipo === "ELIMINAR" ? "ELIMINAR" : solicitud.tipo === "AGREGAR" ? "CREAR" : "MODIFICAR",
    autorId: session.empleadoId!,
    antes: antes ?? undefined,
    despues: despues ?? undefined,
    motivo: `Corrección aprobada: ${solicitud.motivo}`,
  });

  return NextResponse.json({ ok: true });
}
