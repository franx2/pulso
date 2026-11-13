import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { hashPassword, passwordValida } from "@/lib/password";
import { intentoBloqueado, registrarIntentoFallido } from "@/lib/rateLimit";

/**
 * Cada persona crea su cuenta desde la pantalla de ingreso, como en cualquier
 * app. La cuenta nace **inactiva y pendiente**: no puede entrar hasta que un
 * admin la active desde Equipo. Así crearse una cuenta no da acceso a nada, y
 * el admin no tiene que tipear los datos de cada empleado nuevo.
 *
 * Ruta pública: no hay sesión todavía. Por eso devuelve sólo lo mínimo y
 * limita las altas por IP.
 */

/** Las sucursales para el selector del formulario: sólo id y nombre. */
export async function GET() {
  const locales = await db.local.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });
  return NextResponse.json({ locales });
}

const USUARIO = /^[a-zA-Z0-9._-]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  // ponytail: el límite en memoria de lib/rateLimit, por IP; alcanza para que
  // nadie llene la lista de pendientes con un script.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip";
  const clave = `crear-cuenta:${ip}`;
  if (intentoBloqueado(clave)) {
    return NextResponse.json({ error: "Se crearon demasiadas cuentas desde acá. Probá más tarde." }, { status: 429 });
  }

  const body = await readJsonBody<{ nombre?: string; usuario?: string; password?: string; localId?: string; email?: string }>(request);
  const nombre = body?.nombre?.trim() ?? "";
  const usuario = body?.usuario?.trim() ?? "";
  const email = body?.email?.trim() ?? "";

  if (!nombre || nombre.length > 80) return NextResponse.json({ error: "Escribí tu nombre y apellido" }, { status: 400 });
  if (!USUARIO.test(usuario)) {
    return NextResponse.json(
      { error: "El usuario tiene que tener entre 3 y 30 letras, números, puntos o guiones, sin espacios" },
      { status: 400 }
    );
  }
  if (!passwordValida(body?.password ?? "")) {
    return NextResponse.json({ error: "La contraseña tiene que tener al menos 8 caracteres" }, { status: 400 });
  }
  if (email && !EMAIL.test(email)) return NextResponse.json({ error: "El email no es válido" }, { status: 400 });

  const local = body?.localId ? await db.local.findUnique({ where: { id: body.localId }, select: { id: true } }) : null;
  if (!local) return NextResponse.json({ error: "Elegí la sucursal donde trabajás" }, { status: 400 });

  const existe = await db.empleado.findUnique({ where: { usuario }, select: { id: true } });
  if (existe) return NextResponse.json({ error: "Ese usuario ya está en uso, probá con otro" }, { status: 409 });

  registrarIntentoFallido(clave);
  await db.empleado.create({
    data: {
      nombre,
      usuario,
      email: email || null,
      passwordHash: hashPassword(body!.password!),
      localId: local.id,
      rol: "EMPLEADO",
      activo: false,
      pendienteDesde: new Date(),
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
