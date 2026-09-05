import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diaDeFechaSql, hoyAR, sumarDias } from "@/lib/fechaAR";
import { requireAdminApi } from "@/lib/session";
import {
  backtestEstacional,
  construirPerfilEstacional,
  MIN_MESES_ESTACIONALIDAD,
  proyectarConTemporada,
  type DiaVentas,
} from "@/lib/forecast/estacionalidad";

/** Lee toda la historia diaria de cada local; la cuenta en sí es en memoria. */
export const maxDuration = 60;

/** Cuánto se mide contra lo que realmente pasó antes de mostrar el número. */
const HORIZONTE_BACKTEST = 45;

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const dias = Math.min(Math.max(Number(params.get("dias")) || 90, 30), 365);
  const hoy = hoyAR();

  const [locales, filas] = await Promise.all([
    db.local.findMany({
      where: { fudoApiKey: { not: null } },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    }),
    // Toda la historia: el índice de un mes necesita ver ese mes, y con una
    // ventana móvil de un año los meses de los bordes quedan con la mitad de
    // las observaciones que el resto.
    db.resumenDiario.findMany({
      where: { fecha: { lt: new Date(`${hoy}T00:00:00.000Z`) } },
      select: { localId: true, fecha: true, ventas: true },
      orderBy: { fecha: "asc" },
    }),
  ]);

  const temporadas = locales.map((local) => {
    const serie: DiaVentas[] = filas
      .filter((fila) => fila.localId === local.id && fila.ventas > 0)
      .map((fila) => ({ fecha: diaDeFechaSql(fila.fecha), ventas: fila.ventas }));

    const perfil = construirPerfilEstacional(serie);
    const proyeccion = proyectarConTemporada(serie, { desde: hoy, dias });
    const medicion = backtestEstacional(serie, {
      corte: sumarDias(hoy, -HORIZONTE_BACKTEST),
      horizonte: HORIZONTE_BACKTEST,
    });

    return {
      localId: local.id,
      local: local.nombre,
      desde: serie[0]?.fecha ?? null,
      hasta: serie[serie.length - 1]?.fecha ?? null,
      diasConDatos: serie.length,
      mesesDeHistoria: perfil?.mesesDeHistoria ?? 0,
      // Con menos de un año no hay con qué comparar un mes contra el resto del
      // año: se devuelve igual lo que se pudo medir, pero marcado.
      suficiente: (perfil?.mesesDeHistoria ?? 0) >= MIN_MESES_ESTACIONALIDAD,
      mesesConfiables: perfil?.mesesConfiables ?? 0,
      // Distinto de "confiable": un mes puede tener 31 días observados y ser un
      // solo diciembre. Recién con dos años se puede hablar de temporada.
      mesesRepetidos: perfil?.mesesRepetidos ?? 0,
      crecimientoMensualPct: perfil?.tendencia.crecimientoMensualPct ?? null,
      meses: perfil?.meses ?? [],
      proyeccion: proyeccion
        ? {
            total: proyeccion.total,
            totalSinTemporada: proyeccion.totalSinTemporada,
            porMes: proyeccion.porMes,
          }
        : null,
      backtest: medicion,
    };
  });

  const conProyeccion = temporadas.filter((t) => t.proyeccion);
  return NextResponse.json({
    dias,
    desde: hoy,
    hasta: sumarDias(hoy, dias - 1),
    cadena: {
      total: conProyeccion.reduce((s, t) => s + (t.proyeccion?.total ?? 0), 0),
      totalSinTemporada: conProyeccion.reduce((s, t) => s + (t.proyeccion?.totalSinTemporada ?? 0), 0),
      locales: conProyeccion.length,
      sinProyeccion: temporadas.filter((t) => !t.proyeccion).map((t) => t.local),
    },
    temporadas,
  });
}
