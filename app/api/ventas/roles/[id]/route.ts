import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { PERMISOS } from "@/lib/ventas/permisos";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

const CONOCIDOS = new Set<string>(PERMISOS.map((p) => p.codigo));

/**
 * Editar un rol. Sólo se tocan los permisos que este módulo conoce: los demás
 * que trajo de Fudo (de stock, de gastos…) se conservan tal cual.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_roles");
  if (prohibido) return prohibido;
  const { id } = await params;
  const body = await readJsonBody<{ nombre?: string; esMozo?: boolean; permisos?: string[] }>(request);
  const rol = await db.rolVenta.findUnique({ where: { id } });
  if (!rol) return NextResponse.json({ error: "Rol no encontrado" }, { status: 404 });

  const data: { nombre?: string; esMozo?: boolean; permisos?: string[] } = {};
  if (body?.nombre !== undefined) {
    const nombre = body.nombre.trim();
    if (!nombre) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    const otro = await db.rolVenta.findUnique({ where: { nombre } });
    if (otro && otro.id !== id) return NextResponse.json({ error: "Ya hay un rol con ese nombre" }, { status: 409 });
    data.nombre = nombre;
  }
  if (body?.esMozo !== undefined) data.esMozo = Boolean(body.esMozo);
  if (body?.permisos) {
    const elegidos = body.permisos.filter((p) => CONOCIDOS.has(p));
    // Tildar un permiso saca su negación de Fudo ("cannot_close_sale"), si la tenía.
    const negaciones: Record<string, string> = {
      close_sales: "cannot_close_sale",
      create_discounts: "cannot_apply_discount",
      cancel_additions: "cannot_cancel_addition",
    };
    const quitar = new Set(elegidos.map((p) => negaciones[p]).filter(Boolean));
    const ajenos = rol.permisos.filter((p) => !CONOCIDOS.has(p) && !quitar.has(p));
    data.permisos = [...ajenos, ...elegidos];
  }
  await db.rolVenta.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

/** Borrar un rol: quien lo tenía vuelve al que le toca por su rol de Pulso. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_roles");
  if (prohibido) return prohibido;
  const { id } = await params;
  await db.rolVenta.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
