import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http";
import { precargarRecetas } from "@/lib/ventas/inventario";
import { contextoVentas, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

export const maxDuration = 120;

/** Cargar los insumos de compras como ingredientes y las recetas de la Carta en los productos sin receta. */
export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "update_products");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ localId?: string }>(request);
  if (!body?.localId) return NextResponse.json({ error: "Falta el local" }, { status: 400 });
  return NextResponse.json(await precargarRecetas(body.localId));
}
