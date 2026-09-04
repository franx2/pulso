import { NextResponse } from "next/server";
import { sincronizarResumenTodos } from "@/lib/fudoResumen";

/**
 * Refresca el resumen diario de todos los locales con Fudo, para que el
 * dashboard abra con datos de hoy sin que nadie apriete nada.
 *
 * Mismo esquema que /api/cron/demanda, pensado para un cron externo:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/resumen?dias=7
 *
 * `dias` corto (7) para la corrida frecuente; una vez por semana conviene
 * una corrida larga (90) que recupere días viejos corregidos en Fudo.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron no configurado" }, { status: 404 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const dias = Number(new URL(request.url).searchParams.get("dias")) || 7;
  const resultados = await sincronizarResumenTodos(Math.min(Math.max(dias, 1), 400));
  return NextResponse.json({ resultados });
}
