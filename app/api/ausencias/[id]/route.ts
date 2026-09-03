import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";
import { auditar } from "@/lib/auditoria";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody<{ aprobar: boolean; comentario?: string }>(request);
  if (!body || typeof body.aprobar !== "boolean") {
    return NextResponse.json({ error: "Indicá si se aprueba o se rechaza" }, { status: 400 });
  }

  const ausencia = await db.ausencia.findUnique({ where: { id }, select: { estado: true } });
  if (!ausencia) return NextResponse.json({ error: "Ausencia no encontrada" }, { status: 404 });
  if (ausencia.estado !== "PENDIENTE") {
    return NextResponse.json({ error: "Esa solicitud ya fue resuelta" }, { status: 409 });
  }

  await db.ausencia.update({
    where: { id },
    data: {
      estado: body.aprobar ? "APROBADA" : "RECHAZADA",
      resueltaPorId: session.empleadoId,
      resueltaEn: new Date(),
      comentario: body.comentario?.trim() || null,
    },
  });

  await auditar({
    entidad: "Ausencia",
    entidadId: id,
    accion: body.aprobar ? "APROBAR" : "RECHAZAR",
    autorId: session.empleadoId!,
    motivo: body.comentario?.trim(),
  });

  return NextResponse.json({ ok: true });
}
