import { db } from "@/lib/db";
import type { ContextoVentas } from "./sesion";
import { sinPermiso } from "./sesion";

/** Lo que llega para aplicar: un descuento de la lista, uno libre o null para quitarlo. */
export type PedidoDescuento = { plantillaId?: string; pct?: number | null; monto?: number | null } | null;

/** Cómo queda guardado: porcentaje (con el monto como tope) o monto fijo, y el nombre. */
export type DescuentoResuelto = { pct: number | null; monto: number; nombre: string | null };

/**
 * Valida permisos y traduce el pedido a lo que se guarda. Un descuento de la
 * lista pide "Aplicar descuentos de la lista"; uno libre, "Hacer descuentos
 * libres"; quitarlo, cualquiera de los dos.
 */
export async function resolverDescuento(
  ctx: ContextoVentas,
  localId: string,
  pedido: PedidoDescuento
): Promise<{ ok: DescuentoResuelto } | { error: string; status: number }> {
  if (pedido === null) {
    if (!ctx.permisos.apply_discounts && !ctx.permisos.create_discounts) return { error: "Tu rol no puede tocar descuentos", status: 403 };
    return { ok: { pct: null, monto: 0, nombre: null } };
  }
  if (pedido.plantillaId) {
    const prohibido = sinPermiso(ctx, "apply_discounts");
    if (prohibido) return { error: "Tu rol no puede aplicar descuentos", status: 403 };
    const p = await db.descuentoPlantilla.findFirst({ where: { id: pedido.plantillaId, localId, activo: true } });
    if (!p) return { error: "Ese descuento no existe o está desactivado", status: 400 };
    return {
      ok: p.porcentaje ? { pct: p.porcentaje, monto: p.tope ?? 0, nombre: p.nombre } : { pct: null, monto: p.monto ?? 0, nombre: p.nombre },
    };
  }
  if (sinPermiso(ctx, "create_discounts")) return { error: "Tu rol sólo puede aplicar los descuentos de la lista", status: 403 };
  const pct = pedido.pct ?? null;
  const monto = pedido.monto ?? 0;
  if ((pct != null && (pct <= 0 || pct > 100)) || monto < 0 || (pct == null && monto <= 0)) {
    return { error: "El descuento tiene que ser un porcentaje entre 1 y 100, o un monto positivo", status: 400 };
  }
  return { ok: { pct, monto: pct ? 0 : monto, nombre: "Libre" } };
}
