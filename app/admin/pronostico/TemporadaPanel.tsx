"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { fechaCorta, mesLargo, plata, plataCompacta } from "@/lib/formato";

type Mes = { mes: number; indice: number; dias: number; anios: number; confiable: boolean; repetido: boolean };
type MesProyectado = { mes: string; ventas: number; dias: number; indice: number; confiable: boolean; repetido: boolean };
type Ventana = { corte: string; wapeConTemporada: number; wapeSinTemporada: number; mejora: number; dias: number };
type Medicion = {
  ventanas: Ventana[];
  medianaConTemporada: number;
  medianaSinTemporada: number;
  medianaMejora: number;
  ventanasQueMejoran: number;
  peorMejora: number;
};
type Cierre = { desde: string; hasta: string; dias: number; diasDesdeReapertura: number };
type Temporada = {
  localId: string;
  local: string;
  desde: string | null;
  hasta: string | null;
  diasConDatos: number;
  mesesDeHistoria: number;
  suficiente: boolean;
  mesesConfiables: number;
  mesesRepetidos: number;
  crecimientoMensualPct: number | null;
  meses: Mes[];
  proyeccion: {
    total: number;
    totalSinTemporada: number;
    porMes: MesProyectado[];
    diasDeNivel: number;
    cierre: Cierre | null;
  } | null;
  backtest: Medicion | null;
};
type Respuesta = {
  dias: number;
  desde: string;
  hasta: string;
  cadena: { total: number; totalSinTemporada: number; locales: number; sinProyeccion: string[] };
  temporadas: Temporada[];
};

const NOMBRE_MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/**
 * Índice por mes: cuánto vende un día de ese mes contra un día promedio del
 * año, ya descontados el crecimiento y la inflación. La línea del 1,00 es la
 * referencia; lo que importa es la distancia a ella, no la altura absoluta.
 */
function CurvaEstacional({ meses, mesActual }: { meses: Mes[]; mesActual: number }) {
  const maximo = Math.max(...meses.map((m) => m.indice), 1.15);
  const minimo = Math.min(...meses.map((m) => m.indice), 0.85);
  const alto = (indice: number) => ((indice - minimo) / (maximo - minimo)) * 100;

  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {meses.map((mes) => {
          const sobre = mes.indice >= 1;
          return (
            <div key={mes.mes} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  mes.confiable ? "text-slate-500" : "text-slate-300"
                }`}
              >
                {mes.indice.toFixed(2)}
              </span>
              <div
                title={`${NOMBRE_MES[mes.mes - 1]}: ${mes.dias} días observados en ${mes.anios} ${mes.anios === 1 ? "año" : "años"}`}
                className={`w-full rounded-t ${
                  !mes.confiable
                    ? "bg-slate-200"
                    : sobre
                      ? "bg-emerald-600"
                      : "bg-slate-400"
                } ${mes.mes === mesActual ? "ring-2 ring-emerald-700 ring-offset-1" : ""}`}
                style={{ height: `${Math.max(alto(mes.indice), 3)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1">
        {meses.map((mes) => (
          <span
            key={mes.mes}
            className={`flex-1 text-center text-[11px] ${
              mes.mes === mesActual
                ? "font-semibold text-emerald-700"
                : "text-slate-500"
            }`}
          >
            {NOMBRE_MES[mes.mes - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TemporadaPanel({
  seleccionado,
  onSeleccionar,
}: {
  seleccionado: string;
  onSeleccionar: (localId: string) => void;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controlador = new AbortController();
    fetch("/api/temporada?dias=120", { signal: controlador.signal })
      .then((respuesta) => (respuesta.ok ? respuesta.json() : Promise.reject(new Error("fallo"))))
      .then((respuesta) => setDatos(respuesta))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError(true);
      });
    return () => controlador.abort();
  }, []);

  if (error) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No pudimos calcular la temporada. Probá recargar.
      </section>
    );
  }
  if (!datos) {
    return <div className="h-64 animate-pulse rounded-lg bg-slate-200/70" aria-label="Calculando temporada" />;
  }

  const elegido = datos.temporadas.find((t) => t.localId === seleccionado) ?? datos.temporadas[0];
  if (!elegido) return null;

  const mesActual = Number(datos.desde.slice(5, 7));
  const aporteTemporada =
    datos.cadena.totalSinTemporada > 0
      ? ((datos.cadena.total - datos.cadena.totalSinTemporada) / datos.cadena.totalSinTemporada) * 100
      : 0;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="font-semibold">Proyección por temporada · toda la cadena</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {fechaCorta(datos.desde)} a {fechaCorta(datos.hasta)} · {datos.dias} días, {datos.cadena.locales}{" "}
              {datos.cadena.locales === 1 ? "local" : "locales"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-emerald-700">
              {plata(datos.cadena.total)}
            </p>
            <p className="text-xs text-slate-500">
              {pct(aporteTemporada)} contra ignorar la temporada
            </p>
          </div>
        </div>
        {datos.cadena.sinProyeccion.length > 0 && (
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-amber-700">
            Sin proyección: {datos.cadena.sinProyeccion.join(", ")} — falta historia reciente sincronizada.
          </p>
        )}
        {datos.temporadas
          .filter((temporada) => temporada.proyeccion?.cierre)
          .map((temporada) => (
            <p
              key={temporada.localId}
              className="border-b border-slate-100 px-4 py-2 text-xs text-amber-700"
            >
              <strong className="font-semibold">{temporada.local}</strong> estuvo{" "}
              {temporada.proyeccion!.cierre!.dias} días sin vender (
              {fechaCorta(temporada.proyeccion!.cierre!.desde)} a{" "}
              {fechaCorta(temporada.proyeccion!.cierre!.hasta)}). Su proyección se apoya sólo en los{" "}
              {temporada.proyeccion!.cierre!.diasDesdeReapertura} días desde que volvió a abrir, no en el
              promedio de los dos lados: después de un cierre largo el nivel puede ser otro.
            </p>
          ))}
        <div className="divide-y divide-slate-100">
          {datos.temporadas.map((temporada) => (
            <button
              key={temporada.localId}
              type="button"
              onClick={() => onSeleccionar(temporada.localId)}
              className={`flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-950 ${
                temporada.localId === elegido.localId
                  ? "bg-emerald-50/70"
                  : "hover:bg-slate-50"
              }`}
            >
              <span className="inline-flex items-center gap-1.5 font-semibold">
                {temporada.local}
                <ArrowRight size={13} aria-hidden />
              </span>
              <span className="flex items-baseline gap-4 text-sm">
                <span className="text-slate-500">
                  {temporada.mesesDeHistoria} meses de historia
                  {!temporada.suficiente && <span className="ml-1 text-amber-700">· parcial</span>}
                </span>
                <span className="font-semibold tabular-nums text-emerald-700">
                  {temporada.proyeccion ? plata(temporada.proyeccion.total) : "—"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Estacionalidad de {elegido.local}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Cuánto vende un día de cada mes contra un día promedio del año, ya descontados el crecimiento y
            la inflación. 1,00 es un mes normal.
          </p>
        </div>

        <div className="px-4 py-4">
          {elegido.meses.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay historia suficiente.</p>
          ) : (
            <>
              <CurvaEstacional meses={elegido.meses} mesActual={mesActual} />
              <p className="mt-3 text-xs text-slate-500">
                Las barras grises son meses con menos de 20 días observados: quedan en el cálculo pero no
                deciden. {elegido.mesesConfiables} de 12 meses tienen respaldo y{" "}
                <strong className="font-semibold">{elegido.mesesRepetidos} se vieron en más de un año</strong>.
                {elegido.crecimientoMensualPct != null && (
                  <>
                    {" "}
                    La tendencia de fondo, aparte de la temporada, corre a {pct(elegido.crecimientoMensualPct)}{" "}
                    por mes.
                  </>
                )}
              </p>
              {!elegido.suficiente && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {elegido.local} tiene {elegido.mesesDeHistoria} meses cargados. Con menos de doce, un mes se
                  compara contra un año que todavía no existe entero: tomá la curva como indicio, no como
                  medición.
                </p>
              )}
            </>
          )}
        </div>

        {elegido.proyeccion && elegido.proyeccion.porMes.length > 0 && (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-semibold">Mes</th>
                  <th className="px-3 py-3 text-right font-semibold">Días</th>
                  <th className="px-3 py-3 text-right font-semibold">Índice</th>
                  <th className="px-3 py-3 text-right font-semibold">Por día</th>
                  <th className="px-4 py-3 text-right font-semibold">Ventas previstas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {elegido.proyeccion.porMes.map((mes) => (
                  <tr key={mes.mes}>
                    <td className="px-4 py-3 font-semibold">
                      {mesLargo(mes.mes)}
                      {!mes.confiable ? (
                        <span className="ml-1.5 text-xs font-normal text-amber-700">
                          poca historia
                        </span>
                      ) : (
                        !mes.repetido && (
                          <span
                            className="ml-1.5 text-xs font-normal text-amber-700"
                            title="El índice de este mes sale de un solo año: todavía no se sabe si se repite"
                          >
                            un solo año
                          </span>
                        )
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                      {mes.dias}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${
                        mes.indice >= 1 ? "text-emerald-700" : "text-slate-500"
                      }`}
                    >
                      ×{mes.indice.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                      {plataCompacta(mes.ventas / mes.dias)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{plata(mes.ventas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-slate-500">
              El primer y el último mes suelen estar cortados por el horizonte: mirá la columna “Días” antes
              de comparar meses entre sí.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">¿Sirve ajustar por temporada?</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Se miden {elegido.backtest?.ventanas.length ?? 4} ventanas de 45 días hacia atrás. En cada una
            se proyecta sin mirar lo que pasó y se compara contra lo real, al lado de la alternativa boba:
            repetir el promedio de los últimos 28 días. Son varias y no una porque una sola ventana puede
            caer sobre un cierre o un mes raro y decir cualquier cosa.
          </p>
        </div>
        {elegido.backtest ? (
          <>
            <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="px-4 py-3">
                <p className="text-xs text-slate-500">Con temporada · mediana</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {(elegido.backtest.medianaConTemporada * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500">error medio por día</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs text-slate-500">Repitiendo 28 días · mediana</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-500">
                  {(elegido.backtest.medianaSinTemporada * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500">error medio por día</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs text-slate-500">Diferencia</p>
                <p
                  className={`mt-1 text-xl font-semibold tabular-nums ${
                    elegido.backtest.medianaMejora > 0
                      ? "text-emerald-700"
                      : "text-rose-600"
                  }`}
                >
                  {pct(elegido.backtest.medianaMejora)}
                </p>
                <p className="text-xs text-slate-500">
                  gana en {elegido.backtest.ventanasQueMejoran} de {elegido.backtest.ventanas.length} ·
                  peor caso {pct(elegido.backtest.peorMejora)}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">Ventana desde</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Días</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Con temporada</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Promedio 28 d</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {elegido.backtest.ventanas.map((ventana) => (
                    <tr key={ventana.corte}>
                      <td className="px-4 py-2.5">{fechaCorta(ventana.corte)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                        {ventana.dias}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {(ventana.wapeConTemporada * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                        {(ventana.wapeSinTemporada * 100).toFixed(1)}%
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                          ventana.mejora > 0
                            ? "text-emerald-700"
                            : "text-rose-600"
                        }`}
                      >
                        {pct(ventana.mejora)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="px-4 py-3 text-sm text-slate-500">
            Todavía no hay 45 días recientes completos para medirlo en {elegido.local}.
          </p>
        )}
      </section>
    </div>
  );
}
