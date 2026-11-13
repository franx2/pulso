import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi, requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

const INVITACION_DIAS = 7;
const ROLES = ["ADMIN", "ENCARGADO", "EMPLEADO"] as const;

export async function GET() {
  // El encargado necesita la lista para armar turnos; el alta es sólo del admin.
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  // Lista blanca, nunca la fila entera: la fila trae el hash de la contraseña,
  // la biometría del rostro y, vía `local`, las credenciales de Fudo. El
  // encargado sólo ve lo que necesita para armar turnos y reportes; el precio
  // por hora y el token de invitación (con el que cualquiera registra una
  // passkey a nombre de esa persona, admins incluidos) son sólo del admin.
  const esAdmin = session.rol === "ADMIN";
  const empleados = await db.empleado.findMany({
    select: {
      id: true,
      nombre: true,
      localId: true,
      activo: true,
      local: { select: { id: true, nombre: true } },
      asignaciones: { select: { local: { select: { id: true, nombre: true } } } },
      ...(esAdmin
        ? {
            usuario: true,
            email: true,
            rol: true,
            precioHora: true,
            categoria: { select: { id: true, nombre: true } },
            credenciales: { select: { id: true } },
            // Sólo para saber si tiene: el hash se descarta abajo.
            passwordHash: true,
            pendienteDesde: true,
            createdAt: true,
            fichajes: { orderBy: { timestamp: "desc" }, take: 1, select: { timestamp: true, tipo: true } },
            invitaciones: {
              where: { usado: false, expiraEn: { gt: new Date() } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { token: true },
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  // El hash nunca sale del servidor: la pantalla sólo necesita saber si hay.
  return NextResponse.json({
    empleados: empleados.map(({ passwordHash, fichajes, ...e }: typeof empleados[number] & { passwordHash?: string | null; fichajes?: { timestamp: Date; tipo: string }[] }) => ({
      ...e,
      ...(esAdmin ? { tieneContrasena: Boolean(passwordHash), ultimoFichaje: fichajes?.[0] ?? null } : {}),
    })),
  });
}

export async function POST(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await readJsonBody<{
    usuario: string;
    nombre: string;
    email?: string;
    rol: string;
    localId?: string;
    localesExtra?: string[];
    categoriaId?: string | null;
  }>(request);

  if (!body?.usuario?.trim() || !body.nombre?.trim()) {
    return NextResponse.json({ error: "Usuario y nombre son obligatorios" }, { status: 400 });
  }

  const rol = (ROLES as readonly string[]).includes(body.rol)
    ? (body.rol as (typeof ROLES)[number])
    : "EMPLEADO";

  const localId = body.localId || (await db.local.findFirst())?.id;
  if (!localId) return NextResponse.json({ error: "No hay un local configurado" }, { status: 500 });

  // La categoría es propia de cada local: una de otra sucursal no aplica acá.
  let categoriaId: string | null = null;
  if (body.categoriaId) {
    const cat = await db.categoria.findUnique({ where: { id: body.categoriaId } });
    if (cat && cat.localId === localId) categoriaId = cat.id;
  }

  let empleado;
  try {
    empleado = await db.empleado.create({
      data: {
        usuario: body.usuario.trim(),
        nombre: body.nombre.trim(),
        email: body.email?.trim() || null,
        rol,
        localId,
        categoriaId,
        asignaciones: {
          create: (body.localesExtra ?? [])
            .filter((id) => id !== localId)
            .map((id) => ({ localId: id })),
        },
      },
      select: { id: true, usuario: true, nombre: true, rol: true, localId: true },
    });
  } catch {
    return NextResponse.json({ error: "Ese usuario ya existe" }, { status: 409 });
  }

  const invitacion = await db.registroInvitacion.create({
    data: {
      empleadoId: empleado.id,
      token: randomUUID(),
      expiraEn: new Date(Date.now() + INVITACION_DIAS * 24 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json({ empleado, token: invitacion.token });
}
