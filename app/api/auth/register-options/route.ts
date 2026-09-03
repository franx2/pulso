import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { rpName, rpID, setChallenge } from "@/lib/webauthn";
import { readJsonBody } from "@/lib/http";

export async function POST(request: Request) {
  const body = await readJsonBody<{ token: string }>(request);
  if (!body?.token) {
    return NextResponse.json({ error: "Falta el token de invitación" }, { status: 400 });
  }
  const { token } = body;

  const invitacion = await db.registroInvitacion.findUnique({
    where: { token },
    include: { empleado: { include: { credenciales: true } } },
  });

  if (!invitacion || invitacion.usado || invitacion.expiraEn < new Date()) {
    return NextResponse.json(
      { error: "Invitación inválida o expirada" },
      { status: 400 }
    );
  }

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: invitacion.empleado.usuario,
    userDisplayName: invitacion.empleado.nombre,
    attestationType: "none",
    excludeCredentials: invitacion.empleado.credenciales.map((c) => ({
      id: c.credentialId,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
  });

  setChallenge(token, options.challenge);

  return NextResponse.json(options);
}
