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

  const empleados = await db.empleado.findMany({
    include: {
      local: true,
      categoria: { select: { id: true, nombre: true } },
      asignaciones: { include: { local: { select: { id: true, nombre: true } } } },
      credenciales: { select: { id: true } },
      invitaciones: { where: { usado: false }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ empleados });
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
