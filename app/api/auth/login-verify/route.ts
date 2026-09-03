import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { origin, rpID, popChallenge } from "@/lib/webauthn";
import { readJsonBody } from "@/lib/http";
import { iniciarSesion } from "@/lib/session";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export async function POST(request: Request) {
  const body = await readJsonBody<{ usuario: string; response: AuthenticationResponseJSON }>(request);
  if (!body?.usuario || !body.response) {
    return NextResponse.json({ error: "Faltan datos de la ceremonia" }, { status: 400 });
  }
  const { usuario, response } = body;

  const empleado = await db.empleado.findUnique({
    where: { usuario },
    include: { credenciales: true },
  });

  if (!empleado || !empleado.activo) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 400 });
  }

  const expectedChallenge = popChallenge(usuario);
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Reto expirado, reintentá" }, { status: 400 });
  }

  const cred = empleado.credenciales.find((c) => c.credentialId === response.id);
  if (!cred) {
    return NextResponse.json({ error: "Passkey no reconocida" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(cred.publicKey),
        counter: cred.counter,
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo verificar" }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Login no verificado" }, { status: 400 });
  }

  await db.credential.update({
    where: { id: cred.id },
    data: { counter: verification.authenticationInfo.newCounter },
  });

  await iniciarSesion(empleado);

  return NextResponse.json({ ok: true, rol: empleado.rol });
}
