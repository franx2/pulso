import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { correlacionesHistoricas, resumirFactores } from "@/lib/forecast/analitica";
import { LIMITES_K } from "@/lib/forecast/k";
import { fechaSql, hoyAR, sumarDias } from "@/lib/fechaAR";
import { pronosticar } from "@/lib/forecast/motor";
import { DECAIMIENTO_SEMANAL } from "@/lib/forecast/perfil";

/** El forecast y las correlaciones consultan series distintas. El backtest
 * NO se corre acá: lo mide el cron semanal y esta ruta lee lo que guardó. */
export const maxDuration = 60;

type Calibracion = {
  wape: number | null;
  sesgoPct: number | null;
  diasEvaluados: number;
  desde: string | null;
  hasta: string | null;
  medidaEn: string | null;
  ranking: { ventana: number; wape: number }[];
};

/**
 * Lee lo que guardó el cron. Es un `Json` de Prisma, o sea `unknown` en la
 * práctica: se valida campo por campo en vez de castear, porque una fila vieja
 * o a medio escribir no puede tumbar la pantalla del modelo.
 */
function leerCalibracion(valor: unknown): Calibracion | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const c = valor as Record<string, unknown>;
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  const dias = numero(c.diasEvaluados) ?? 0;
  // Menos de 5 días medidos no es una medición: se muestra como "sin datos".
  if (dias < 5) return null;
  const corte = texto(c.corte);
  const horizonte = numero(c.horizonte) ?? 15;
  return {
    wape: numero(c.wape),
    sesgoPct: numero(c.sesgoPct),
    diasEvaluados: dias,
    desde: corte,
    hasta: corte ? sumarDias(corte, horizonte - 1) : null,
    medidaEn: texto(c.medidaEn),
    ranking: Array.isArray(c.ranking)
      ? c.ranking.flatMap((fila) => {
          const f = fila as Record<string, unknown>;
          const ventana = numero(f?.ventana);
          const wape = numero(f?.wape);
          return ventana != null && wape != null ? [{ ventana, wape }] : [];
        })
      : [],
  };
}

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const localId = searchParams.get("localId");
  const dias = Math.min(Math.max(Number(searchParams.get("dias")) || 15, 7), 30);

  const locales = await db.local.findMany({
    where: { fudoApiKey: { not: null } },
    select: { id: true, nombre: true, tipoLocal: true, ventanaForecastDias: true, ventanaCalibracion: true },
    orderBy: { nombre: "asc" },
  });
  if (locales.length === 0) return NextResponse.json({ locales: [], pronostico: null });

  const elegido = locales.find((local) => local.id === localId) ?? locales[0];
  const hoy = hoyAR();
  const desdeHistoria = sumarDias(hoy, -365);

  const [{ dias: pronostico, diagnostico }, resumenes, climas, sensibilidades] = await Promise.all([
    pronosticar(elegido.id, { dias }),
    db.resumenDiario.findMany({
      where: { localId: elegido.id, fecha: { gte: fechaSql(desdeHistoria), lt: fechaSql(hoy) } },
      select: { fecha: true, ventas: true, tickets: true, personas: true },
      orderBy: { fecha: "asc" },
    }),
    db.climaDia.findMany({
      where: { localId: elegido.id, fecha: { gte: fechaSql(desdeHistoria), lt: fechaSql(hoy) }, esPronostico: false },
      select: { fecha: true, tempMax: true, lluviaMm: true },
    }),
    db.sensibilidadClima.findMany({
      where: { tipoLocal: elegido.tipoLocal },
      select: { condicion: true, factor: true, confianza: true, dias: true, origen: true },
      orderBy: { condicion: "asc" },
    }),
  ]);

  const climaPorFecha = new Map(climas.map((clima) => [clima.fecha.toISOString().slice(0, 10), clima]));
  const muestras = resumenes.map((resumen) => {
    const fecha = resumen.fecha.toISOString().slice(0, 10);
    const clima = climaPorFecha.get(fecha);
    return {
      fecha,
      ventas: resumen.ventas,
      tickets: resumen.tickets,
      personas: resumen.personas,
      tempMax: clima?.tempMax,
      lluviaMm: clima?.lluviaMm,
    };
  });

  const factores = resumirFactores(pronostico.flatMap((dia) => dia.slots));
  // Lo dejó el cron semanal en `/api/cron/semanal`. Si todavía no corrió, la
  // pantalla dice que no hay medición en vez de inventar una.
  const calibracion = leerCalibracion(elegido.ventanaCalibracion);

  return NextResponse.json({
    locales,
    local: elegido,
    diagnostico,
    historial: muestras.slice(-56).map((muestra) => ({
      fecha: muestra.fecha,
      ventas: muestra.ventas,
      tickets: muestra.tickets,
    })),
    pronostico: pronostico.map((dia) => ({
      fecha: dia.fecha,
      diaSemana: dia.diaSemana,
      tickets: dia.tickets,
      ticketsMin: dia.ticketsMin,
      ticketsMax: dia.ticketsMax,
      unidades: dia.unidades,
      ventas: dia.ventas,
      demandIndex: dia.demandIndex,
      kAuto: dia.kAuto,
      kManual: dia.kManual,
      confianza: dia.confianza,
      motivos: dia.motivos,
      horaPico: dia.horaPico,
    })),
    modelo: {
      nombre: "Promedio ponderado por día y franja",
      ventanaDias: elegido.ventanaForecastDias,
      decaimientoSemanal: DECAIMIENTO_SEMANAL,
      limitesFactor: LIMITES_K,
      factores,
      backtest: calibracion,
    },
    correlaciones: correlacionesHistoricas(muestras),
    sensibilidadClima: sensibilidades,
  });
}
