import { NextResponse } from "next/server";
import { Prisma, type UnidadIngrediente } from "@prisma/client";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

const UNIDADES: UnidadIngrediente[] = ["G", "ML", "U"];

/** Un ingrediente nuevo, con costo manual por unidad. */
export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "update_ingredients");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ localId?: string; nombre?: string; unidad?: string; costo?: number; stockMinimo?: number | null }>(request);
  const nombre = body?.nombre?.trim() ?? "";
  if (!nombre) return NextResponse.json({ error: "Escribí el nombre" }, { status: 400 });
  if (!UNIDADES.includes(body?.unidad as UnidadIngrediente)) return NextResponse.json({ error: "Elegí la unidad" }, { status: 400 });
  const costo = Number(body?.costo ?? 0);
  if (!(costo >= 0)) return NextResponse.json({ error: "El costo no puede ser negativo" }, { status: 400 });
  const local = await db.local.findUnique({ where: { id: body?.localId ?? "" }, select: { id: true } });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 400 });
  try {
    const ing = await db.ingrediente.create({
      data: {
        localId: local.id,
        nombre,
        unidad: body!.unidad as UnidadIngrediente,
        costo,
        stockMinimo: body?.stockMinimo != null && body.stockMinimo >= 0 ? body.stockMinimo : null,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: ing.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ya hay un ingrediente con ese nombre" }, { status: 409 });
    }
    throw e;
  }
}
