import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmpleadoApi, type SessionData } from "@/lib/session";
import { PERMISOS, permisosDe, type Permiso, type Permisos } from "./permisos";

export type ContextoVentas = {
  session: SessionData;
  empleadoId: string;
  permisos: Permisos;
  /** Los locales donde puede operar: el suyo y los asignados. Null = todos (admin). */
  locales: string[] | null;
};

/** La sesión y los permisos de ventas de quien llama. Null si no hay sesión. */
export async function contextoVentas(): Promise<ContextoVentas | null> {
  const session = await requireEmpleadoApi();
  if (!session?.empleadoId) return null;
  const [empleado, roles] = await Promise.all([
    db.empleado.findUnique({
      where: { id: session.empleadoId },
      select: { localId: true, asignaciones: { select: { localId: true } }, rolVenta: { select: { permisos: true } } },
    }),
    db.rolVenta.findMany({ select: { nombre: true, permisos: true } }),
  ]);
  return {
    session,
    empleadoId: session.empleadoId,
    permisos: permisosDe(session.rol, empleado?.rolVenta ?? null, new Map(roles.map((r) => [r.nombre, r]))),
    locales: session.rol === "ADMIN" ? null : empleado ? [empleado.localId, ...empleado.asignaciones.map((a) => a.localId)] : [],
  };
}

/**
 * Cada operación es de un solo local, y sólo de uno donde quien la hace
 * trabaja: un mozo de Las Cañas no abre mesas ni cobra en Chacras.
 */
export function enLocal(ctx: ContextoVentas, localId: string | null | undefined): boolean {
  return Boolean(localId) && (ctx.locales === null || ctx.locales.includes(localId!));
}

export const fueraDeLocal = () => NextResponse.json({ error: "Eso es de otro local: no trabajás ahí." }, { status: 403 });

/** Un 403 con el nombre del permiso que falta, o null si lo tiene. */
export function sinPermiso(ctx: ContextoVentas, permiso: Permiso): NextResponse | null {
  if (ctx.permisos[permiso]) return null;
  const etiqueta = PERMISOS.find((p) => p.codigo === permiso)?.etiqueta ?? permiso;
  return NextResponse.json({ error: `Tu rol no tiene permiso para: ${etiqueta.toLowerCase()}. Pedíselo a un encargado.` }, { status: 403 });
}

export const noAutenticado = () => NextResponse.json({ error: "No autenticado" }, { status: 401 });
