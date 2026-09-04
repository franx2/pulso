import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEncargadoApi } from "@/lib/session";
import { desdeISO, finDelDia, inicioDelDia } from "@/lib/fechas";

/** Arqueos de caja: salidas fichadas en un local con Fudo, con lo esperado
 * (según Fudo) y lo contado (cargado por el empleado). */
export async function GET(request: Request) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const localId = searchParams.get("localId") || undefined;
  const desdeParam = searchParams.get("desde");
  const hastaParam = searchParams.get("hasta");

  // Por defecto, últimos 7 días: es una vista de seguimiento diario, no un
  // reporte histórico que necesite rango obligatorio.
  const desde = desdeParam ? desdeISO(desdeParam) : inicioDelDia(new Date(Date.now() - 6 * 86400000));
  const hasta = hastaParam ? finDelDia(desdeISO(hastaParam)) : finDelDia();

  const fichajes = await db.fichaje.findMany({
    where: {
      tipo: "SALIDA",
      efectivoEsperado: { not: null },
      timestamp: { gte: desde, lte: hasta },
      ...(localId ? { localId } : {}),
    },
    include: { empleado: { select: { nombre: true } }, local: { select: { nombre: true } } },
    orderBy: { timestamp: "desc" },
  });

  return NextResponse.json({
    arqueos: fichajes.map((f) => ({
      id: f.id,
      empleado: f.empleado.nombre,
      local: f.local.nombre,
      timestamp: f.timestamp.toISOString(),
      efectivoEsperado: f.efectivoEsperado,
      efectivoContado: f.efectivoContado,
    })),
  });
}
