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
    nombre?: string;
    localId?: string;
    rol?: string;
    email?: string;
    localesExtra?: string[];
    categoriaId?: string | null;
    reinvitar?: boolean;
    precioHora?: number | null;
    fudoUsuarioId?: string | null;
    fudoCajaId?: string | null;
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

  if (body.nombre !== undefined && !body.nombre.trim()) {
    return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
  }
  let localId: string | undefined;
  if (body.localId !== undefined && body.localId !== objetivo.localId) {
    const local = await db.local.findUnique({ where: { id: body.localId }, select: { id: true } });
    if (!local) return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 400 });
    localId = local.id;
  }
  // Cambiar de sucursal principal se lleva la categoría si es de la otra:
  // las categorías son de cada local.
  const localFinal = localId ?? objetivo.localId;

  // La categoría es propia de cada local: null borra, cualquier otro caso se
  // valida contra el local actual del empleado antes de aceptarla.
  let categoriaId: string | null | undefined;
  if (body.categoriaId !== undefined) {
    if (body.categoriaId === null) {
      categoriaId = null;
    } else {
      const cat = await db.categoria.findUnique({ where: { id: body.categoriaId } });
      categoriaId = cat && cat.localId === localFinal ? cat.id : null;
    }
  } else if (localId && objetivo.categoriaId) {
    categoriaId = null;
  }

  const empleado = await db.empleado.update({
    where: { id },
    data: {
      // Activar a quien pidió la cuenta la saca de "pendientes".
      ...(body.activo !== undefined ? { activo: Boolean(body.activo), ...(body.activo ? { pendienteDesde: null } : {}) } : {}),
      ...(body.nombre !== undefined ? { nombre: body.nombre.trim() } : {}),
      ...(localId ? { localId } : {}),
      ...(body.email !== undefined ? { email: body.email.trim() || null } : {}),
      ...(categoriaId !== undefined ? { categoriaId } : {}),
      ...(body.rol !== undefined && (ROLES as readonly string[]).includes(body.rol)
        ? { rol: body.rol as (typeof ROLES)[number] }
        : {}),
      ...(body.precioHora !== undefined ? { precioHora: body.precioHora } : {}),
      ...(body.fudoUsuarioId !== undefined ? { fudoUsuarioId: body.fudoUsuarioId || null } : {}),
      ...(body.fudoCajaId !== undefined ? { fudoCajaId: body.fudoCajaId || null } : {}),
    },
    // Nunca la fila entera: trae el hash de la contraseña y la biometría.
    select: { id: true, usuario: true, nombre: true, rol: true, activo: true, localId: true },
  });

  // La nueva principal deja de ser "también puede fichar en".
  if (localId) await db.asignacionLocal.deleteMany({ where: { empleadoId: id, localId } });

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

/**
 * Rechazar una cuenta pedida desde la pantalla de ingreso. Sólo para
 * pendientes: alguien que ya trabajó tiene fichajes y horas que no se
 * borran; a esa persona se la desactiva.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const objetivo = await db.empleado.findUnique({ where: { id }, select: { pendienteDesde: true, activo: true } });
  if (!objetivo) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  if (!objetivo.pendienteDesde || objetivo.activo) {
    return NextResponse.json({ error: "Sólo se pueden rechazar cuentas pendientes; a los demás, desactivalos" }, { status: 400 });
  }
  await db.empleado.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
