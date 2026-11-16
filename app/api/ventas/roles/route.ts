import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { PERMISOS } from "@/lib/ventas/permisos";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Roles de ventas, el catálogo de permisos y quién tiene cada rol. */
export async function GET() {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_roles");
  if (prohibido) return prohibido;
  const [roles, empleados] = await Promise.all([
    db.rolVenta.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true, esMozo: true, permisos: true, fudoId: true } }),
    db.empleado.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, rol: true, rolVentaId: true, local: { select: { nombre: true } } },
    }),
  ]);
  return NextResponse.json({
    roles,
    empleados: empleados.map((e) => ({ id: e.id, nombre: e.nombre, rol: e.rol, rolVentaId: e.rolVentaId, local: e.local.nombre })),
    catalogo: PERMISOS,
  });
}

/** Crear un rol nuevo, vacío o copiando los permisos de otro. */
export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_roles");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ nombre?: string; copiarDe?: string }>(request);
  const nombre = body?.nombre?.trim() ?? "";
  if (!nombre) return NextResponse.json({ error: "Escribí el nombre del rol" }, { status: 400 });
  if (await db.rolVenta.findUnique({ where: { nombre } })) {
    return NextResponse.json({ error: "Ya hay un rol con ese nombre" }, { status: 409 });
  }
  const base = body?.copiarDe ? await db.rolVenta.findUnique({ where: { id: body.copiarDe } }) : null;
  const rol = await db.rolVenta.create({
    data: { nombre, esMozo: base?.esMozo ?? false, permisos: base?.permisos ?? [] },
    select: { id: true },
  });
  return NextResponse.json({ id: rol.id });
}

/** Asignar un rol de ventas a un empleado (null = el que le toca por su rol de Pulso). */
export async function PATCH(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_roles");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ empleadoId?: string; rolVentaId?: string | null }>(request);
  if (body?.rolVentaId && !(await db.rolVenta.findUnique({ where: { id: body.rolVentaId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Rol no encontrado" }, { status: 404 });
  }
  await db.empleado.update({ where: { id: body?.empleadoId ?? "" }, data: { rolVentaId: body?.rolVentaId || null } });
  return NextResponse.json({ ok: true });
}
