"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, SectionTitle, Spinner } from "@/components/ui";

type Semana = { semana: string; ventas: number; tickets: number; ticketPromedio: number; dias: number };
type Tendencia = {
  localId: string;
  local: string;
  semanas: Semana[];
  pendienteSemanal: number;
  crecimientoSemanalPct: number;
  ventasUltimas4: number;
  ventasPrevias4: number;
  variacion4v4: number | null;
  ventasAnioAnterior: number | null;
  variacionInteranual: number | null;
  proyeccion30Dias: number;
  diasConDatos: number;
};

const plata = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const pct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);

/** Sparkline de ventas semanales. Una sola serie, sin ejes ni grilla: acá lo
 * que se lee es la forma, y los números están al lado en texto. */
function Curva({ semanas }: { semanas: Semana[] }) {
  if (semanas.length < 2) return null;
  const valores = semanas.map((s) => s.ventas);
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const rango = max - min || 1;
  const ancho = 100;
  const alto = 28;

  const puntos = valores
    .map((v, i) => `${(i / (valores.length - 1)) * ancho},${alto - ((v - min) / rango) * alto}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline
        points={puntos}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className="text-emerald-600 dark:text-[#37e6b0]"
      />
    </svg>
  );
}

export default function TendenciaPanel() {
  const [datos, setDatos] = useState<Tendencia[] | null>(null);

  useEffect(() => {
    fetch("/api/tendencia?semanas=26")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDatos(d?.tendencias ?? null))
      .catch(() => setDatos(null));
  }, []);

  if (!datos) {
    return (
      <Card>
        <SectionTitle>Tendencia de ventas</SectionTitle>
        <Spinner />
      </Card>
    );
  }

  const proyeccionCadena = datos.reduce((s, t) => s + t.proyeccion30Dias, 0);
  const hayInteranual = datos.some((t) => t.ventasAnioAnterior != null);

  return (
    <Card className="flex flex-col gap-4">
      <SectionTitle
        action={
          <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-[#4ee6b0]">
            {plata(proyeccionCadena)} próximos 30 días
          </span>
        }
      >
        Tendencia de ventas
      </SectionTitle>

      <p className="text-sm text-slate-500 dark:text-[#94a19c]">
        Semanas completas: la semana en curso queda afuera porque está a medias y tiraría la
        pendiente para abajo. La proyección a 30 días parte del nivel de las últimas 4 semanas y
        aplica la mitad de la pendiente — extrapolarla entera a un mes es lo que hace que estas
        cuentas se vayan de escala.
      </p>

      <div className="flex flex-col gap-3">
        {datos.map((t) => {
          const sube = t.crecimientoSemanalPct >= 0;
          const Icono = sube ? TrendingUp : TrendingDown;
          return (
            <div key={t.localId} className="rounded-xl border border-slate-100 p-3 dark:border-[#1c2521]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{t.local}</span>
                <span
                  className={`inline-flex items-center gap-1 text-sm font-semibold ${
                    sube ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  <Icono size={14} />
                  {pct(t.crecimientoSemanalPct)} por semana
                </span>
              </div>

              <div className="my-2">
                <Curva semanas={t.semanas} />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-400 dark:text-[#74817b]">Últimas 4 semanas</p>
                  <p className="tabular-nums font-medium">{plata(t.ventasUltimas4)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-[#74817b]">vs. 4 anteriores</p>
                  <p
                    className={`tabular-nums font-medium ${
                      (t.variacion4v4 ?? 0) >= 0
                        ? "text-emerald-700 dark:text-[#4ee6b0]"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {pct(t.variacion4v4)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-[#74817b]">
                    {hayInteranual ? "vs. año pasado" : "año pasado"}
                  </p>
                  <p className="tabular-nums font-medium">
                    {t.ventasAnioAnterior == null ? (
                      <span className="text-slate-400 dark:text-[#74817b]">sin historia</span>
                    ) : (
                      pct(t.variacionInteranual)
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-[#74817b]">Próximos 30 días</p>
                  <p className="tabular-nums font-semibold text-emerald-700 dark:text-[#4ee6b0]">
                    {plata(t.proyeccion30Dias)}
                  </p>
                </div>
              </div>

              <p className="mt-2 text-xs text-slate-400 dark:text-[#74817b]">
                {t.semanas.length} semanas completas · {t.diasConDatos} días con datos
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
