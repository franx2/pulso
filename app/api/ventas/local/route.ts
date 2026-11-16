import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Ajustes de ventas del local. Por ahora, la propina sugerida de la precuenta. */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const localId = new URL(request.url).searchParams.get("localId") ?? "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();
  const local = await db.local.findUnique({ where: { id: localId }, select: { propinaSugeridaPct: true } });
  return NextResponse.json({ propinaSugeridaPct: local?.propinaSugeridaPct ?? null });
}

export async function PATCH(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_payment_types");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ localId?: string; propinaSugeridaPct?: number | null }>(request);
  if (!enLocal(ctx, body?.localId)) return fueraDeLocal();
  const pct = body?.propinaSugeridaPct == null ? null : Number(body.propinaSugeridaPct);
  if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 50)) {
    return NextResponse.json({ error: "La propina sugerida va de 0 a 50%" }, { status: 400 });
  }
  await db.local.update({ where: { id: body!.localId! }, data: { propinaSugeridaPct: pct && pct > 0 ? pct : null } });
  return NextResponse.json({ ok: true });
}
