"use client";

import { useState } from "react";
import { Percent, RefreshCw } from "lucide-react";
import { Badge, Button, Card, ErrorText, SectionTitle } from "@/components/ui";

type Local = { id: string; nombre: string };

/** Rango sano para un restaurante: por debajo de 30% del ticket, la mano de
 * obra está holgada; arriba de 35% se come el margen. Sirve para que el
 * número sea accionable y no un dato suelto. */
const OBJETIVO_OK = 30;
const OBJETIVO_ALTO = 35;

/**
 * Costo laboral sobre ventas: lo que se paga en horas contra lo que entró
 * por Fudo, en el mismo rango y sucursal del reporte. Es la métrica con la
 * que se arma (o se corrige) la dotación de la semana siguiente.
 */
export default function CostoLaboral({
  costoLaboral,
  empleadosSinPrecio,
  desde,
  hasta,
  localId,
  locales,
}: {
  costoLaboral: number;
  empleadosSinPrecio: number;
  desde: string;
  hasta: string;
  localId: string;
  locales: Local[];
}) {
  const [ventas, setVentas] = useState<number | null>(null);
  const [sinFudo, setSinFudo] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function calcular() {
    setCargando(true);
    setError("");
    // Sin sucursal elegida se suman todas las que tengan Fudo; las que no,
    // se cuentan aparte para avisar que el total de ventas está incompleto.
    const objetivo = localId ? locales.filter((l) => l.id === localId) : locales;
    const params = new URLSearchParams({ desde, hasta });
    const resultados = await Promise.all(
      objetivo.map(async (l) => {
        const res = await fetch(`/api/locales/${l.id}/ventas?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data.totalVentas === "number" ? data.totalVentas : null;
      })
    );

    const conDatos = resultados.filter((r): r is number => r !== null);
    setSinFudo(resultados.length - conDatos.length);
    if (conDatos.length === 0) {
      setError("Ninguna de las sucursales del filtro tiene Fudo configurado");
      setVentas(null);
    } else {
      setVentas(conDatos.reduce((s, v) => s + v, 0));
    }
    setCargando(false);
  }

  const porcentaje = ventas && ventas > 0 ? (costoLaboral / ventas) * 100 : null;
  const tono = porcentaje == null ? "slate" : porcentaje <= OBJETIVO_OK ? "emerald" : porcentaje <= OBJETIVO_ALTO ? "amber" : "rose";

  return (
    <Card>
      <SectionTitle
        action={
          ventas != null && (
            <Button type="button" variant="ghost" onClick={calcular} disabled={cargando} className="py-1 text-xs">
              <RefreshCw size={14} />
              Actualizar
            </Button>
          )
        }
      >
        Costo laboral sobre ventas
      </SectionTitle>

      {ventas == null && !cargando && (
        <>
          <p className="mb-3 text-sm text-slate-500 dark:text-[#94a19c]">
            Compara lo que pagás en horas contra lo que vendiste según Fudo, en este mismo rango.
            Un restaurante sano se mueve entre 25% y 35%.
          </p>
          <Button type="button" variant="ghost" onClick={calcular}>
            <Percent size={16} />
            Calcular
          </Button>
        </>
      )}

      {cargando && <p className="text-sm text-slate-400 dark:text-[#74817b]">Consultando Fudo…</p>}
      <ErrorText>{error}</ErrorText>

      {ventas != null && !cargando && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-slate-100 p-3 dark:border-[#1c2521]">
              <p className="text-lg font-bold">${ventas.toFixed(2)}</p>
              <p className="text-xs text-slate-500 dark:text-[#94a19c]">Ventas</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 dark:border-[#1c2521]">
              <p className="text-lg font-bold">${costoLaboral.toFixed(2)}</p>
              <p className="text-xs text-slate-500 dark:text-[#94a19c]">Costo laboral</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 dark:border-[#1c2521]">
              <p className="text-lg font-bold">{porcentaje != null ? `${porcentaje.toFixed(1)}%` : "—"}</p>
              <p className="text-xs text-slate-500 dark:text-[#94a19c]">Sobre ventas</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {porcentaje != null && (
              <Badge tone={tono}>
                {porcentaje <= OBJETIVO_OK
                  ? "Dentro del objetivo (≤30%)"
                  : porcentaje <= OBJETIVO_ALTO
                    ? "Ajustado (30–35%)"
                    : "Alto (>35%)"}
              </Badge>
            )}
            {empleadosSinPrecio > 0 && (
              <Badge tone="slate">
                {empleadosSinPrecio} sin precio/hora: el costo real es mayor
              </Badge>
            )}
            {sinFudo > 0 && (
              <Badge tone="slate">
                {sinFudo} {sinFudo === 1 ? "sucursal" : "sucursales"} sin Fudo: ventas incompletas
              </Badge>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
