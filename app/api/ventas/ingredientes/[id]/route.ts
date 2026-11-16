import { NextResponse } from "next/server";
import { Prisma, type UnidadIngrediente } from "@prisma/client";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

const UNIDADES: UnidadIngrediente[] = ["G", "ML", "U"];

/**
 * Editar un ingrediente. `desvincular` corta el lazo con las facturas: desde
 * ahí manda el costo manual.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "update_ingredients");
  if (prohibido) return prohibido;
  const { id } = await params;
  const body = await readJsonBody<{
    nombre?: string;
    unidad?: string;
    costo?: number;
    stockMinimo?: number | null;
    activo?: boolean;
    desvincular?: boolean;
  }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const propio = await db.ingrediente.findUnique({ where: { id }, select: { localId: true } });
  if (!propio) return NextResponse.json({ error: "Ingrediente no encontrado" }, { status: 404 });
  if (!enLocal(ctx, propio.localId)) return fueraDeLocal();

  const data: Record<string, unknown> = {};
  if (body.nombre !== undefined) {
    if (!body.nombre.trim()) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    data.nombre = body.nombre.trim();
  }
  if (body.unidad !== undefined) {
    if (!UNIDADES.includes(body.unidad as UnidadIngrediente)) return NextResponse.json({ error: "Unidad inválida" }, { status: 400 });
    data.unidad = body.unidad;
  }
  if (body.costo !== undefined) {
    if (!(Number(body.costo) >= 0)) return NextResponse.json({ error: "El costo no puede ser negativo" }, { status: 400 });
    data.costo = Number(body.costo);
  }
  if (body.stockMinimo !== undefined) data.stockMinimo = body.stockMinimo != null && body.stockMinimo >= 0 ? body.stockMinimo : null;
  if (body.activo !== undefined) data.activo = Boolean(body.activo);
  if (body.desvincular) data.insumo = null;

  try {
    await db.ingrediente.update({ where: { id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ya hay un ingrediente con ese nombre" }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
