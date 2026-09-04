import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

const INVITACION_DIAS = 7;
const ROLES = ["ADMIN", "ENCARGADO", "EMPLEADO"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody<{
    activo?: boolean;
    rol?: string;
    email?: string;
    localesExtra?: string[];
    categoriaId?: string | null;
    reinvitar?: boolean;
    precioHora?: number | null;
    fudoUsuarioId?: string | null;
  }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  if (body.precioHora !== undefined && body.precioHora !== null && !(Number(body.precioHora) >= 0)) {
    return NextResponse.json({ error: "Precio/hora inválido" }, { status: 400 });
  }

  const objetivo = await db.empleado.findUnique({ where: { id } });
  if (!objetivo) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

  // No dejar el sistema sin ningún admin activo con acceso.
  const perderiaAdmin =
    objetivo.rol === "ADMIN" &&
    ((body.rol !== undefined && body.rol !== "ADMIN") || body.activo === false);
  if (perderiaAdmin) {
    const otrosAdmins = await db.empleado.count({
      where: { rol: "ADMIN", activo: true, id: { not: id } },
    });
    if (otrosAdmins === 0) {
      return NextResponse.json(
        { error: "Tiene que quedar al menos un administrador activo" },
        { status: 400 }
      );
    }
  }

  // La categoría es propia de cada local: null borra, cualquier otro caso se
  // valida contra el local actual del empleado antes de aceptarla.
  let categoriaId: string | null | undefined;
  if (body.categoriaId !== undefined) {
    if (body.categoriaId === null) {
      categoriaId = null;
    } else {
      const cat = await db.categoria.findUnique({ where: { id: body.categoriaId } });
      categoriaId = cat && cat.localId === objetivo.localId ? cat.id : null;
    }
  }

  const empleado = await db.empleado.update({
    where: { id },
    data: {
      ...(body.activo !== undefined ? { activo: Boolean(body.activo) } : {}),
      ...(body.email !== undefined ? { email: body.email.trim() || null } : {}),
      ...(categoriaId !== undefined ? { categoriaId } : {}),
      ...(body.rol !== undefined && (ROLES as readonly string[]).includes(body.rol)
        ? { rol: body.rol as (typeof ROLES)[number] }
        : {}),
      ...(body.precioHora !== undefined ? { precioHora: body.precioHora } : {}),
      ...(body.fudoUsuarioId !== undefined ? { fudoUsuarioId: body.fudoUsuarioId || null } : {}),
    },
  });

  if (body.localesExtra) {
    await db.asignacionLocal.deleteMany({ where: { empleadoId: id } });
    await db.asignacionLocal.createMany({
      data: body.localesExtra
        .filter((localId) => localId !== empleado.localId)
        .map((localId) => ({ empleadoId: id, localId })),
      skipDuplicates: true,
    });
  }

  // Reinvitar sirve cuando alguien cambia de celular y perdió su passkey.
  let token: string | undefined;
  if (body.reinvitar) {
    await db.credential.deleteMany({ where: { empleadoId: id } });
    const invitacion = await db.registroInvitacion.create({
      data: {
        empleadoId: id,
        token: randomUUID(),
        expiraEn: new Date(Date.now() + INVITACION_DIAS * 24 * 60 * 60 * 1000),
      },
    });
    token = invitacion.token;
  }

  return NextResponse.json({ empleado, token });
}
