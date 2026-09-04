import { NextResponse } from "next/server";
import { sincronizarDemandaTodos } from "@/lib/fudoSync";

/**
 * Recalcula el mapa de calor de demanda de todos los locales con Fudo
 * configurado, sin que nadie tenga que apretar "Sincronizar" a mano.
 *
 * Mismo esquema que /api/cron/alertas: pensado para un cron externo,
 * protegido con CRON_SECRET:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/demanda
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron no configurado" }, { status: 404 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultados = await sincronizarDemandaTodos();
  return NextResponse.json({ resultados });
}
