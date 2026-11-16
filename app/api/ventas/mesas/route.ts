import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { primerLugarLibre, tamanoGrilla } from "@/lib/ventas/plano";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** Una mesa nueva en el salón: el número que sigue, en el primer lugar libre. */
export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "admin_rooms");
  if (prohibido) return prohibido;
  const body = await readJsonBody<{ salonId?: string; tamano?: string }>(request);
  const salon = await db.salon.findUnique({ where: { id: body?.salonId ?? "" }, select: { id: true, localId: true } });
  if (!salon) return NextResponse.json({ error: "Salón no encontrado" }, { status: 404 });
  if (!enLocal(ctx, salon.localId)) return fueraDeLocal();

  const tamano = body?.tamano === "GRANDE" ? "GRANDE" : "CHICA";
  const activas = await db.mesa.findMany({ where: { salonId: salon.id, activa: true }, select: { id: true, fila: true, columna: true, tamano: true } });
  // El número que sigue entre TODAS las mesas del local: el mozo no puede tener dos "mesa 4".
  const ultima = await db.mesa.findFirst({ where: { salon: { localId: salon.localId } }, orderBy: { numero: "desc" }, select: { numero: true } });
  const lugar = primerLugarLibre(activas, tamano, Math.max(8, tamanoGrilla(activas).columnas));
  const mesa = await db.mesa.create({
    data: { salonId: salon.id, numero: (ultima?.numero ?? 0) + 1, tamano, ...lugar },
    select: { id: true, numero: true },
  });
  return NextResponse.json(mesa);
}
