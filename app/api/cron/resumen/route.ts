import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sincronizarResumenLocal, sincronizarResumenTodos } from "@/lib/fudoResumen";

/** Paginar la API de Fudo para varios locales lleva minutos, no segundos. */
export const maxDuration = 300;

/**
 * Refresca el resumen diario de todos los locales con Fudo, para que el
 * dashboard abra con datos de hoy sin que nadie apriete nada.
 *
 * Mismo esquema que /api/cron/demanda, pensado para un cron externo:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/resumen?dias=7
 *
 * `dias` corto (7) para la corrida frecuente; una vez por semana conviene una
 * corrida larga (90) que recupere días viejos corregidos en Fudo.
 *
 * `local` (nombre exacto) procesa uno solo. Hace falta para la corrida larga:
 * 90 días de los cuatro locales tardan más de cinco minutos y la función se
 * corta antes de terminar. Con un local por llamada entra holgado, y el
 * scheduler hace cuatro llamadas en vez de una.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron no configurado" }, { status: 404 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dias = Math.min(Math.max(Number(searchParams.get("dias")) || 7, 1), 400);
  const nombre = searchParams.get("local");

  if (nombre) {
    const local = await db.local.findFirst({ where: { nombre, fudoApiKey: { not: null } } });
    if (!local) {
      return NextResponse.json({ error: `No hay un local con Fudo llamado "${nombre}"` }, { status: 404 });
    }
    try {
      const r = await sincronizarResumenLocal(local.id, dias);
      return NextResponse.json({
        resultados: [{ local: local.nombre, ok: true, detalle: `${r.diasProcesados} días, ${r.ventas} ventas` }],
      });
    } catch (e) {
      return NextResponse.json(
        { resultados: [{ local: local.nombre, ok: false, detalle: e instanceof Error ? e.message : "error" }] },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ resultados: await sincronizarResumenTodos(dias) });
}
