import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { correlacionesHistoricas, resumirFactores } from "@/lib/forecast/analitica";
import { calcularMetricas } from "@/lib/forecast/backtest";
import { backtestLocal } from "@/lib/forecast/evaluacion";
import { LIMITES_K } from "@/lib/forecast/k";
import { hoyAR, pronosticar } from "@/lib/forecast/motor";
import { DECAIMIENTO_SEMANAL } from "@/lib/forecast/perfil";

/** El forecast, el backtest y las correlaciones consultan series distintas. */
export const maxDuration = 120;

const fechaSql = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const sumarDias = (dia: string, cantidad: number) => {
  const fecha = fechaSql(dia);
  fecha.setUTCDate(fecha.getUTCDate() + cantidad);
  return fecha.toISOString().slice(0, 10);
};

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const localId = searchParams.get("localId");
  const dias = Math.min(Math.max(Number(searchParams.get("dias")) || 15, 7), 30);

  const locales = await db.local.findMany({
    where: { fudoApiKey: { not: null } },
    select: { id: true, nombre: true, tipoLocal: true, ventanaForecastDias: true },
    orderBy: { nombre: "asc" },
  });
  if (locales.length === 0) return NextResponse.json({ locales: [], pronostico: null });

  const elegido = locales.find((local) => local.id === localId) ?? locales[0];
  const hoy = hoyAR();
  const corteBacktest = sumarDias(hoy, -15);
  const desdeHistoria = sumarDias(hoy, -365);

  const [{ dias: pronostico, diagnostico }, resumenes, climas, sensibilidades, backtest] = await Promise.all([
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
    backtestLocal(elegido.id, {
      corte: corteBacktest,
      horizonte: 15,
      ventana: elegido.ventanaForecastDias,
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
  const paresDia = backtest.porDia
    .filter((dia) => dia.realTickets > 0)
    .map((dia) => ({ pronosticado: dia.pronosticado, real: dia.realTickets }));
  const metricasDia = calcularMetricas(paresDia);
  const totalReal = paresDia.reduce((s, par) => s + par.real, 0);
  const totalPronosticado = paresDia.reduce((s, par) => s + par.pronosticado, 0);
  const backtestSuficiente = paresDia.length >= 5;

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
      backtest: {
        desde: corteBacktest,
        hasta: sumarDias(corteBacktest, 14),
        diasEvaluados: paresDia.length,
        wapeDia: backtestSuficiente ? metricasDia.wape : null,
        sesgoPct:
          backtestSuficiente && totalReal > 0 ? ((totalPronosticado - totalReal) / totalReal) * 100 : null,
      },
    },
    correlaciones: correlacionesHistoricas(muestras),
    sensibilidadClima: sensibilidades,
  });
}
