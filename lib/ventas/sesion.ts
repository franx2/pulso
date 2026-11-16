import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmpleadoApi, type SessionData } from "@/lib/session";
import { PERMISOS, permisosDe, type Permiso, type Permisos } from "./permisos";

export type ContextoVentas = { session: SessionData; empleadoId: string; permisos: Permisos };

/** La sesión y los permisos de ventas de quien llama. Null si no hay sesión. */
export async function contextoVentas(): Promise<ContextoVentas | null> {
  const session = await requireEmpleadoApi();
  if (!session?.empleadoId) return null;
  const [empleado, roles] = await Promise.all([
    db.empleado.findUnique({ where: { id: session.empleadoId }, select: { rolVenta: { select: { permisos: true } } } }),
    db.rolVenta.findMany({ select: { nombre: true, permisos: true } }),
  ]);
  return {
    session,
    empleadoId: session.empleadoId,
    permisos: permisosDe(session.rol, empleado?.rolVenta ?? null, new Map(roles.map((r) => [r.nombre, r]))),
  };
}

/** Un 403 con el nombre del permiso que falta, o null si lo tiene. */
export function sinPermiso(ctx: ContextoVentas, permiso: Permiso): NextResponse | null {
  if (ctx.permisos[permiso]) return null;
  const etiqueta = PERMISOS.find((p) => p.codigo === permiso)?.etiqueta ?? permiso;
  return NextResponse.json({ error: `Tu rol no tiene permiso para: ${etiqueta.toLowerCase()}. Pedíselo a un encargado.` }, { status: 403 });
}

export const noAutenticado = () => NextResponse.json({ error: "No autenticado" }, { status: 401 });
