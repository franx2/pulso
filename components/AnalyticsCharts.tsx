"use client";

import { useRef, useState } from "react";

export type ComparisonPoint = {
  fecha: string;
  valor: number | null;
  completo?: boolean;
};

export type ForecastHistoryPoint = { fecha: string; valor: number };
export type ForecastPoint = { fecha: string; valor: number; minimo: number; maximo: number };

const WIDTH = 1000;
const HEIGHT = 240;
const PAD_Y = 10;

const xDe = (indice: number, total: number) => (total <= 1 ? WIDTH / 2 : (indice / (total - 1)) * WIDTH);
const yDe = (valor: number, maximo: number) =>
  PAD_Y + (1 - Math.max(0, valor) / Math.max(maximo, 1)) * (HEIGHT - PAD_Y * 2);

function ruta(valores: (number | null)[], maximo: number) {
  let abierta = false;
  return valores
    .map((valor, indice) => {
      if (valor == null) {
        abierta = false;
        return "";
      }
      const comando = abierta ? "L" : "M";
      abierta = true;
      return `${comando}${xDe(indice, valores.length).toFixed(1)},${yDe(valor, maximo).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
}

function rutaConIndices(puntos: { indice: number; valor: number }[], total: number, maximo: number) {
  return puntos
    .map(
      (punto, indice) =>
        `${indice === 0 ? "M" : "L"}${xDe(punto.indice, total).toFixed(1)},${yDe(punto.valor, maximo).toFixed(1)}`
    )
    .join(" ");
}

function fechaCorta(fecha: string) {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function Leyenda({ color, trazo, children }: { color: string; trazo?: "linea" | "banda" | "puntos"; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#94a19c]">
      <span
        className={`block w-5 ${trazo === "banda" ? "h-2" : trazo === "puntos" ? "h-0 border-t-2 border-dotted" : "h-0 border-t-2"}`}
        style={{ backgroundColor: trazo === "banda" ? color : undefined, borderColor: color }}
        aria-hidden
      />
      {children}
    </span>
  );
}

function EjeY({ maximo, formato }: { maximo: number; formato: (valor: number) => string }) {
  return (
    <div className="relative h-48 w-[4.25rem] shrink-0 text-right text-[11px] tabular-nums text-slate-400 md:h-56 dark:text-[#74817b]">
      <span className="absolute right-2 top-0">{formato(maximo)}</span>
      <span className="absolute right-2 top-1/2 -translate-y-1/2">{formato(maximo / 2)}</span>
      <span className="absolute bottom-0 right-2">0</span>
    </div>
  );
}

function Rejilla() {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((fraccion) => (
        <line
          key={fraccion}
          x1="0"
          x2={WIDTH}
          y1={PAD_Y + fraccion * (HEIGHT - PAD_Y * 2)}
          y2={PAD_Y + fraccion * (HEIGHT - PAD_Y * 2)}
          vectorEffect="non-scaling-stroke"
          className="stroke-slate-200 dark:stroke-[#26312d]"
        />
      ))}
    </>
  );
}

export function ComparisonChart({
  actual,
  referencia,
  formato,
  etiquetaActual = "Período seleccionado",
  etiquetaReferencia = "Período anterior",
}: {
  actual: ComparisonPoint[];
  referencia: ComparisonPoint[];
  formato: (valor: number) => string;
  etiquetaActual?: string;
  etiquetaReferencia?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState<number | null>(null);
  const valoresActuales = actual.map((punto) => punto.valor);
  const valoresReferencia = referencia.map((punto) => punto.valor);
  const todos = [...valoresActuales, ...valoresReferencia].filter((valor): valor is number => valor != null);
  const maximo = Math.max(...todos, 1) * 1.08;
  const promedio =
    valoresActuales.filter((valor): valor is number => valor != null).reduce((s, valor) => s + valor, 0) /
    Math.max(valoresActuales.filter((valor) => valor != null).length, 1);
  const indiceReferencia =
    activo == null || actual.length <= 1
      ? null
      : Math.round((activo / (actual.length - 1)) * Math.max(referencia.length - 1, 0));

  function mover(clientX: number) {
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja || actual.length === 0) return;
    const proporcion = Math.max(0, Math.min(1, (clientX - caja.left) / caja.width));
    setActivo(Math.round(proporcion * (actual.length - 1)));
  }

  const puntoActivo = activo == null ? null : actual[activo];
  const referenciaActiva = indiceReferencia == null ? null : referencia[indiceReferencia];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <Leyenda color="#0f766e">{etiquetaActual}</Leyenda>
        <Leyenda color="#94a3b8" trazo="puntos">{etiquetaReferencia}</Leyenda>
        <Leyenda color="#d97706" trazo="puntos">Promedio del período</Leyenda>
      </div>
      <div className="flex min-w-0">
        <EjeY maximo={maximo} formato={formato} />
        <div className="min-w-0 flex-1">
          <div
            ref={contenedor}
            className="relative h-48 touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 md:h-56 dark:focus-visible:ring-[#37e6b0]"
            tabIndex={0}
            role="img"
            aria-label={`Serie de ${etiquetaActual} comparada con ${etiquetaReferencia}`}
            onPointerMove={(evento) => mover(evento.clientX)}
            onPointerLeave={() => setActivo(null)}
            onFocus={() => setActivo(Math.max(actual.length - 1, 0))}
            onBlur={() => setActivo(null)}
            onKeyDown={(evento) => {
              if (evento.key === "ArrowLeft") setActivo((valor) => Math.max((valor ?? actual.length) - 1, 0));
              if (evento.key === "ArrowRight") setActivo((valor) => Math.min((valor ?? -1) + 1, actual.length - 1));
            }}
          >
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
              <Rejilla />
              <line
                x1="0"
                x2={WIDTH}
                y1={yDe(promedio, maximo)}
                y2={yDe(promedio, maximo)}
                vectorEffect="non-scaling-stroke"
                className="stroke-amber-600"
                strokeDasharray="5 5"
              />
              <path
                d={ruta(valoresReferencia, maximo)}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeDasharray="5 5"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={ruta(valoresActuales, maximo)}
                fill="none"
                stroke="#0f766e"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
              {actual.map((punto, indice) =>
                punto.valor != null && punto.completo === false ? (
                  <circle
                    key={punto.fecha}
                    cx={xDe(indice, actual.length)}
                    cy={yDe(punto.valor, maximo)}
                    r="3"
                    fill="#d97706"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null
              )}
              {activo != null && puntoActivo?.valor != null && (
                <>
                  <line
                    x1={xDe(activo, actual.length)}
                    x2={xDe(activo, actual.length)}
                    y1="0"
                    y2={HEIGHT}
                    vectorEffect="non-scaling-stroke"
                    className="stroke-slate-300 dark:stroke-[#53615c]"
                  />
                  <circle
                    cx={xDe(activo, actual.length)}
                    cy={yDe(puntoActivo.valor, maximo)}
                    r="4"
                    fill="#0f766e"
                    stroke="white"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>
            {activo != null && puntoActivo && (
              <div
                className={`pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-[#29403b] dark:bg-[#101c19] ${activo > actual.length * 0.75 ? "-translate-x-full" : ""}`}
                style={{ left: `${(activo / Math.max(actual.length - 1, 1)) * 100}%` }}
              >
                <p className="font-semibold text-slate-800 dark:text-[#f2f7f4]">{fechaCorta(puntoActivo.fecha)}</p>
                <p className="mt-1 tabular-nums text-emerald-700 dark:text-[#4ee6b0]">
                  {puntoActivo.valor == null ? "Sin datos" : formato(puntoActivo.valor)}
                </p>
                {referenciaActiva && (
                  <p className="mt-0.5 tabular-nums text-slate-500 dark:text-[#94a19c]">
                    Ref. {referenciaActiva.valor == null ? "sin datos" : formato(referenciaActiva.valor)}
                  </p>
                )}
                {puntoActivo.completo === false && <p className="mt-1 text-amber-700 dark:text-amber-300">Dato parcial</p>}
              </div>
            )}
          </div>
          {actual.length > 0 && (
            <div className="mt-2 flex justify-between text-[11px] text-slate-400 dark:text-[#74817b]">
              <span>{fechaCorta(actual[0].fecha)}</span>
              <span>{fechaCorta(actual[Math.floor((actual.length - 1) / 2)].fecha)}</span>
              <span>{fechaCorta(actual[actual.length - 1].fecha)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ForecastChart({
  historial,
  pronostico,
  formato = (valor) => Math.round(valor).toLocaleString("es-AR"),
}: {
  historial: ForecastHistoryPoint[];
  pronostico: ForecastPoint[];
  formato?: (valor: number) => string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState<number | null>(null);
  const combinados = [
    ...historial.map((punto) => ({ ...punto, tipo: "real" as const, minimo: punto.valor, maximo: punto.valor })),
    ...pronostico.map((punto) => ({ ...punto, tipo: "pronostico" as const })),
  ];
  const maximo = Math.max(...combinados.map((punto) => punto.maximo), 1) * 1.08;
  const limite = historial.length;
  const promedioHistorico = historial.reduce((s, punto) => s + punto.valor, 0) / Math.max(historial.length, 1);
  const puntosHistoricos = historial.map((punto, indice) => ({ indice, valor: punto.valor }));
  const puntosPronostico = [
    ...(historial.length > 0 ? [{ indice: historial.length - 1, valor: historial[historial.length - 1].valor }] : []),
    ...pronostico.map((punto, indice) => ({ indice: limite + indice, valor: punto.valor })),
  ];
  const superiores = pronostico.map((punto, indice) => ({ indice: limite + indice, valor: punto.maximo }));
  const inferiores = pronostico
    .map((punto, indice) => ({ indice: limite + indice, valor: punto.minimo }))
    .reverse();
  const banda = [...superiores, ...inferiores]
    .map(
      (punto) => `${xDe(punto.indice, combinados.length).toFixed(1)},${yDe(punto.valor, maximo).toFixed(1)}`
    )
    .join(" ");

  function mover(clientX: number) {
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja || combinados.length === 0) return;
    const proporcion = Math.max(0, Math.min(1, (clientX - caja.left) / caja.width));
    setActivo(Math.round(proporcion * (combinados.length - 1)));
  }

  const puntoActivo = activo == null ? null : combinados[activo];
  const fronteraPct = combinados.length > 1 ? ((limite - 0.5) / (combinados.length - 1)) * 100 : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <Leyenda color="#475569">Real</Leyenda>
        <Leyenda color="#0f766e">Pronóstico</Leyenda>
        <Leyenda color="rgba(55,230,176,.22)" trazo="banda">Rango esperado</Leyenda>
        <Leyenda color="#d97706" trazo="puntos">Promedio reciente</Leyenda>
      </div>
      <div className="flex min-w-0">
        <EjeY maximo={maximo} formato={formato} />
        <div className="min-w-0 flex-1">
          <div
            ref={contenedor}
            className="relative h-48 touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 md:h-56 dark:focus-visible:ring-[#37e6b0]"
            tabIndex={0}
            role="img"
            aria-label="Tickets reales y pronosticados por día, con rango esperado"
            onPointerMove={(evento) => mover(evento.clientX)}
            onPointerLeave={() => setActivo(null)}
            onFocus={() => setActivo(Math.max(historial.length - 1, 0))}
            onBlur={() => setActivo(null)}
            onKeyDown={(evento) => {
              if (evento.key === "ArrowLeft") setActivo((valor) => Math.max((valor ?? combinados.length) - 1, 0));
              if (evento.key === "ArrowRight") setActivo((valor) => Math.min((valor ?? -1) + 1, combinados.length - 1));
            }}
          >
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
              <Rejilla />
              <line
                x1="0"
                x2={WIDTH}
                y1={yDe(promedioHistorico, maximo)}
                y2={yDe(promedioHistorico, maximo)}
                stroke="#d97706"
                strokeDasharray="5 5"
                vectorEffect="non-scaling-stroke"
              />
              {banda && <polygon points={banda} fill="rgba(55,230,176,.18)" />}
              <line
                x1={xDe(Math.max(limite - 0.5, 0), combinados.length)}
                x2={xDe(Math.max(limite - 0.5, 0), combinados.length)}
                y1="0"
                y2={HEIGHT}
                className="stroke-slate-400 dark:stroke-[#74817b]"
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={rutaConIndices(puntosHistoricos, combinados.length, maximo)}
                fill="none"
                className="stroke-slate-600 dark:stroke-[#c1cbc6]"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={rutaConIndices(puntosPronostico, combinados.length, maximo)}
                fill="none"
                stroke="#0f766e"
                strokeWidth="2.75"
                vectorEffect="non-scaling-stroke"
              />
              {activo != null && puntoActivo && (
                <>
                  <line
                    x1={xDe(activo, combinados.length)}
                    x2={xDe(activo, combinados.length)}
                    y1="0"
                    y2={HEIGHT}
                    className="stroke-slate-300 dark:stroke-[#53615c]"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={xDe(activo, combinados.length)}
                    cy={yDe(puntoActivo.valor, maximo)}
                    r="4"
                    fill={puntoActivo.tipo === "real" ? "#475569" : "#0f766e"}
                    stroke="white"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>
            <span
              className="pointer-events-none absolute top-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-[#101c19]/90 dark:text-[#94a19c]"
              style={{ left: `${fronteraPct}%`, transform: "translateX(-50%)" }}
            >
              Hoy
            </span>
            {activo != null && puntoActivo && (
              <div
                className={`pointer-events-none absolute top-7 z-10 min-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-[#29403b] dark:bg-[#101c19] ${activo > combinados.length * 0.75 ? "-translate-x-full" : ""}`}
                style={{ left: `${(activo / Math.max(combinados.length - 1, 1)) * 100}%` }}
              >
                <p className="font-semibold text-slate-800 dark:text-[#f2f7f4]">{fechaCorta(puntoActivo.fecha)}</p>
                <p className="mt-1 tabular-nums text-slate-700 dark:text-[#c1cbc6]">
                  {puntoActivo.tipo === "real" ? "Real" : "Pronóstico"}: {formato(puntoActivo.valor)}
                </p>
                {puntoActivo.tipo === "pronostico" && (
                  <p className="mt-0.5 tabular-nums text-emerald-700 dark:text-[#4ee6b0]">
                    Rango {formato(puntoActivo.minimo)}–{formato(puntoActivo.maximo)}
                  </p>
                )}
              </div>
            )}
          </div>
          {combinados.length > 0 && (
            <div className="mt-2 grid grid-cols-3 text-[11px] text-slate-400 dark:text-[#74817b]">
              <span>{fechaCorta(combinados[0].fecha)}</span>
              <span className="text-center">{pronostico[0] ? fechaCorta(pronostico[0].fecha) : "Hoy"}</span>
              <span className="text-right">{fechaCorta(combinados[combinados.length - 1].fecha)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
