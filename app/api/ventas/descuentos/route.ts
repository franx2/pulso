import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** La lista de descuentos del local (todos, para configurar; la pantalla de pedido usa los activos). */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const localId = new URL(request.url).searchParams.get("localId") ?? "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();
  const descuentos = await db.descuentoPlantilla.findMany({
    where: { localId },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    select: { id: true, nombre: true, porcentaje: true, monto: true, tope: true, activo: true },
  });
  return NextResponse.json({ descuentos, permisos: ctx.permisos });
}

/** Un descuento nuevo: porcentaje (con tope opcional) o monto fijo. */
export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_discount_templates");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ localId?: string; nombre?: string; porcentaje?: number | null; monto?: number | null; tope?: number | null }>(request);
  if (!enLocal(ctx, body?.localId)) return fueraDeLocal();
  const nombre = body?.nombre?.trim() ?? "";
  const porcentaje = body?.porcentaje ?? null;
  const monto = body?.monto ?? null;
  if (!nombre) return NextResponse.json({ error: "Escribí el nombre" }, { status: 400 });
  if (porcentaje == null && monto == null) return NextResponse.json({ error: "Cargá un porcentaje o un monto" }, { status: 400 });
  if ((porcentaje != null && (porcentaje <= 0 || porcentaje > 100)) || (monto != null && monto <= 0)) {
    return NextResponse.json({ error: "El porcentaje va de 1 a 100 y el monto tiene que ser positivo" }, { status: 400 });
  }
  try {
    const d = await db.descuentoPlantilla.create({
      data: {
        localId: body!.localId!,
        nombre,
        porcentaje,
        monto: porcentaje != null ? null : monto,
        tope: porcentaje != null && body?.tope && body.tope > 0 ? body.tope : null,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: d.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ya hay un descuento con ese nombre" }, { status: 409 });
    }
    throw e;
  }
}
