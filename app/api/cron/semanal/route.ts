import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hoyAR, sumarDias } from "@/lib/fechaAR";
import { construirDatasetLocal } from "@/lib/forecast/dataset";
import { calibrarVentana, guardarCalibracion } from "@/lib/forecast/evaluacion";
import { guardarSensibilidad, sincronizarClimaLocal } from "@/lib/forecast/clima";

/** Recalibrar es cálculo sobre datos ya guardados, no paginar Fudo entero:
 * entra holgado, pero se le deja margen por el refresco de franjas. */
export const maxDuration = 300;

/** Días de franjas que se refrescan antes de recalibrar. No hace falta
 * rehacer el año: `DemandaSlot` ya lo tiene, y lo único que puede haber
 * cambiado es lo reciente (ventas cerradas tarde, correcciones en Fudo). */
const DIAS_REFRESCO = 45;

/** Se calibra contra el pasado inmediato: se corta la historia 15 días atrás
 * y se mide el pronóstico contra lo que realmente pasó desde entonces. */
const DIAS_EVALUACION = 15;

/**
 * Mantenimiento semanal del modelo de pronóstico.
 *
 * Hace tres cosas que sólo tienen sentido de vez en cuando:
 *  1. refresca las franjas recientes;
 *  2. vuelve a elegir, por local, cuánta historia usa su perfil — la ventana
 *     óptima no es la misma en todos (dio 45, 90 y 180 días) y cambia a
 *     medida que se acumula historia;
 *  3. vuelve a medir la sensibilidad al clima con los días nuevos.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/semanal
 *
 * NO incluye el resync largo de ventas (`/api/cron/resumen?dias=90`): ese
 * tarda más de cinco minutos para cuatro locales y no entra en una función
 * serverless, así que va aparte y por local.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron no configurado" }, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const corte = sumarDias(hoyAR(), -DIAS_EVALUACION);

  const locales = await db.local.findMany({
    where: { fudoApiKey: { not: null } },
    select: { id: true, nombre: true, ventanaForecastDias: true },
    orderBy: { nombre: "asc" },
  });

  const resultados: { local: string; ok: boolean; detalle: string }[] = [];

  for (const l of locales) {
    // Un local que falla no puede dejar sin recalibrar a los demás.
    try {
      await construirDatasetLocal(l.id, DIAS_REFRESCO);
      await sincronizarClimaLocal(l.id, DIAS_REFRESCO);
      const cal = await calibrarVentana(l.id, { corte, horizonte: DIAS_EVALUACION });
      // Lo medido se guarda junto con la ventana: es el mismo backtest, y la
      // pantalla del modelo lo lee en vez de recalcularlo en cada carga.
      await guardarCalibracion(l.id, cal, { corte, horizonte: DIAS_EVALUACION });
      resultados.push({
        local: l.nombre,
        ok: true,
        detalle:
          cal.ventana === l.ventanaForecastDias
            ? `ventana ${cal.ventana}d (sin cambio), WAPE ${(cal.wape * 100).toFixed(1)}%`
            : `ventana ${l.ventanaForecastDias}d → ${cal.ventana}d, WAPE ${(cal.wape * 100).toFixed(1)}%`,
      });
    } catch (e) {
      resultados.push({ local: l.nombre, ok: false, detalle: e instanceof Error ? e.message : "error" });
    }
  }

  // La sensibilidad al clima es por tipo de local, no por local: se mide una
  // sola vez con todo lo que haya, al final.
  let clima: string;
  try {
    const medidas = await guardarSensibilidad();
    clima = `${medidas.length} coeficientes actualizados`;
  } catch (e) {
    clima = e instanceof Error ? e.message : "error";
  }

  return NextResponse.json({ corte, resultados, clima });
}
