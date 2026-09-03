import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { rpID, setChallenge } from "@/lib/webauthn";
import { readJsonBody } from "@/lib/http";

export async function POST(request: Request) {
  const body = await readJsonBody<{ usuario: string }>(request);
  if (!body?.usuario) {
    return NextResponse.json({ error: "Falta el usuario" }, { status: 400 });
  }
  const { usuario } = body;

  const empleado = await db.empleado.findUnique({
    where: { usuario },
    include: { credenciales: true },
  });

  if (!empleado || !empleado.activo || empleado.credenciales.length === 0) {
    return NextResponse.json(
      { error: "Usuario no encontrado o sin passkey registrada" },
      { status: 400 }
    );
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: empleado.credenciales.map((c) => ({ id: c.credentialId })),
  });

  setChallenge(usuario, options.challenge);

  return NextResponse.json(options);
}
