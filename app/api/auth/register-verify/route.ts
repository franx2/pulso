import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { origin, rpID, popChallenge } from "@/lib/webauthn";
import { readJsonBody } from "@/lib/http";
import { iniciarSesion } from "@/lib/session";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export async function POST(request: Request) {
  const body = await readJsonBody<{ token: string; response: RegistrationResponseJSON }>(request);
  if (!body?.token || !body.response) {
    return NextResponse.json({ error: "Faltan datos de la ceremonia" }, { status: 400 });
  }
  const { token, response } = body;

  const invitacion = await db.registroInvitacion.findUnique({
    where: { token },
    include: { empleado: true },
  });

  // `usado` no bloquea: desde el mismo link se puede registrar el passkey y
  // también crear una contraseña, en cualquier orden.
  if (!invitacion || invitacion.expiraEn < new Date()) {
    return NextResponse.json(
      { error: "Invitación inválida o expirada" },
      { status: 400 }
    );
  }

  const expectedChallenge = popChallenge(token);
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Reto expirado, reintentá" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo verificar el dispositivo" }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Registro no verificado" }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;

  await db.$transaction([
    db.credential.create({
      data: {
        empleadoId: invitacion.empleadoId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
      },
    }),
    db.registroInvitacion.update({
      where: { id: invitacion.id },
      data: { usado: true },
    }),
  ]);

  await iniciarSesion(invitacion.empleado);

  return NextResponse.json({ ok: true });
}
