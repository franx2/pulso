import { NextResponse } from "next/server";
import { snapshotStockTodos } from "@/lib/fudoStock";

/** Paginar la API de Fudo para varios locales lleva minutos, no segundos. */
export const maxDuration = 300;

/**
 * Foto diaria del stock de cada local, que es lo que arma la serie histórica
 * que Fudo no guarda. Correr UNA vez por día y a la misma hora (después del
 * cierre): el stock que devuelve Fudo es el de ese instante, así que dos
 * corridas a horas distintas no se pueden comparar entre sí.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/stock
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron no configurado" }, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return NextResponse.json({ resultados: await snapshotStockTodos() });
}
