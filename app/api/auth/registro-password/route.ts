import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { iniciarSesion } from "@/lib/session";
import { hashPassword, passwordValida } from "@/lib/password";
import { auditar } from "@/lib/auditoria";

/** Crea la contraseña propia desde el link de invitación (mismo link que el passkey). */
export async function POST(request: Request) {
  const body = await readJsonBody<{ token: string; password: string }>(request);
  if (!body?.token || !body.password) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }
  if (!passwordValida(body.password)) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  const invitacion = await db.registroInvitacion.findUnique({
    where: { token: body.token },
    include: { empleado: true },
  });

  if (!invitacion || invitacion.expiraEn < new Date()) {
    return NextResponse.json({ error: "Invitación inválida o expirada" }, { status: 400 });
  }

  const empleado = await db.empleado.update({
    where: { id: invitacion.empleadoId },
    data: { passwordHash: hashPassword(body.password) },
  });

  await db.registroInvitacion.update({ where: { id: invitacion.id }, data: { usado: true } });

  await auditar({
    entidad: "Empleado",
    entidadId: empleado.id,
    accion: "MODIFICAR",
    autorId: empleado.id,
    despues: { passwordCreada: true },
    motivo: "Alta de contraseña propia",
  });

  await iniciarSesion(empleado);

  return NextResponse.json({ ok: true });
}
