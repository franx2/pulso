import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { iniciarSesion } from "@/lib/session";
import { verificarPassword } from "@/lib/password";
import { intentoBloqueado, limpiarIntentos, registrarIntentoFallido } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const body = await readJsonBody<{ usuario: string; password: string }>(request);
  if (!body?.usuario || !body.password) {
    return NextResponse.json({ error: "Usuario y contraseña son obligatorios" }, { status: 400 });
  }
  const usuario = body.usuario.trim();

  if (intentoBloqueado(usuario)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá unos minutos y volvé a probar." },
      { status: 429 }
    );
  }

  const empleado = await db.empleado.findUnique({ where: { usuario } });

  // Mismo mensaje exista o no el usuario: no delatar qué usuarios están dados de alta.
  const invalido = () => {
    registrarIntentoFallido(usuario);
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 400 });
  };

  if (!empleado || !empleado.activo) return invalido();
  if (!verificarPassword(body.password, empleado.passwordHash)) return invalido();

  limpiarIntentos(usuario);
  await iniciarSesion(empleado);

  return NextResponse.json({ ok: true, rol: empleado.rol });
}
