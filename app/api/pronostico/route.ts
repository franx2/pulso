import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { pronosticar } from "@/lib/forecast/motor";
import { matrizDesdeCapacidad } from "@/lib/forecast/dotacion";

/** Paginar Fudo no pasa por acá (lee de DemandaSlot), pero 15 días × 48
 * franjas × varios locales es cálculo real. */
export const maxDuration = 120;

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const localId = searchParams.get("localId");
  const dias = Math.min(Number(searchParams.get("dias")) || 15, 30);

  const locales = await db.local.findMany({
    where: { fudoApiKey: { not: null } },
    select: { id: true, nombre: true, tipoLocal: true },
    orderBy: { nombre: "asc" },
  });
  if (locales.length === 0) return NextResponse.json({ locales: [], pronostico: null });

  const elegido = locales.find((l) => l.id === localId) ?? locales[0];
  const [{ dias: pronostico, diagnostico }, capacidades] = await Promise.all([
    pronosticar(elegido.id, { dias }),
    db.capacidadSector.findMany({ where: { localId: elegido.id }, orderBy: { sector: "asc" } }),
  ]);

  return NextResponse.json({
    locales,
    local: elegido,
    diagnostico,
    capacidades: capacidades.map((c) => ({
      sector: c.sector,
      capacidadPorEmpleado: c.capacidadPorEmpleado,
      minPersonas: c.minPersonas,
      maxPersonas: c.maxPersonas,
      origen: c.origen,
      confianza: c.confianza,
      observaciones: c.observaciones,
      matriz: matrizDesdeCapacidad({
        capacidadPorEmpleado: c.capacidadPorEmpleado,
        minPersonas: c.minPersonas,
        maxPersonas: c.maxPersonas,
      }),
    })),
    // Se recorta el detalle de franjas a las que tienen actividad, para no
    // mandar 48 filas de las cuales 30 son ceros.
    pronostico: pronostico.map((d) => ({
      ...d,
      slots: d.slots.filter((s) => s.tickets >= 0.5),
    })),
  });
}
