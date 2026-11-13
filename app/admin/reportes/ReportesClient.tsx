"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { Badge, Card, EmptyState, PageTitle, Select, Spinner } from "@/components/ui";
import { BarraContexto, SelectorLocal } from "@/components/BarraContexto";
import { fechaLarga } from "@/lib/formato";
import PeriodoSelector, { usePeriodo } from "@/components/PeriodoSelector";
import { rangoDias } from "@/lib/periodo";
import CostoLaboral from "./CostoLaboral";

type Empleado = { id: string; nombre: string };
type Local = { id: string; nombre: string };
type Fila = {
  empleadoId: string;
  nombre: string;
  horasTrabajadas: number;
  horasDescanso: number;
  horasExtra: number;
  extraDiaria: number;
  extraSemanal: number;
  minutosTarde: number;
  minutosSalidaTemprana: number;
  diasTrabajados: number;
  diasSinFichar: number;
  montoAPagar: number | null;
};

const accion =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#e0e7e3] dark:hover:bg-[#172724] dark:focus-visible:ring-[#37e6b0]";

export default function ReportesClient() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [locales, setLocales] = useState<Local[]>([]);
  const [empleadoId, setEmpleadoId] = useState("");
  const [localId, setLocalId] = useState("");
  // El período compartido de todas las pantallas, en días concretos: la
  // liquidación y las descargas trabajan con desde/hasta.
  const { valor, setValor, params: periodo, hoy } = usePeriodo();
  const { desde, hasta } = rangoDias(periodo, hoy);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    fetch("/api/empleados")
      .then((r) => r.json())
      .then((d) => setEmpleados(d.empleados ?? []));
    fetch("/api/locales")
      .then((r) => r.json())
      .then((d) => setLocales(d.locales ?? []));
  }, []);

  // Se actualiza solo al cambiar un filtro: con el período compartido, un
  // botón "Buscar" aparte dejaba la pantalla mostrando otro rango que el elegido.
  useEffect(() => {
    const controlador = new AbortController();
    const params = new URLSearchParams({ desde, hasta });
    if (empleadoId) params.set("empleadoId", empleadoId);
    if (localId) params.set("localId", localId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reactivo, sin librería de datos
    setCargando(true);
    fetch(`/api/reportes?${params}`, { signal: controlador.signal })
      .then((r) => r.json())
      .then((data) => setFilas(data.filas ?? []))
      .catch(() => {})
      .finally(() => {
        if (!controlador.signal.aborted) setCargando(false);
      });
    return () => controlador.abort();
  }, [desde, hasta, empleadoId, localId]);

  function url(extra: Record<string, string> = {}, base = "/api/reportes") {
    const params = new URLSearchParams({ desde, hasta, ...extra });
    if (empleadoId) params.set("empleadoId", empleadoId);
    if (localId) params.set("localId", localId);
    return `${base}?${params}`;
  }

  const totalHoras = filas.reduce((sum, f) => sum + f.horasTrabajadas, 0);
  const totalExtra = filas.reduce((sum, f) => sum + f.horasExtra, 0);
  const totalMonto = filas.reduce((sum, f) => sum + (f.montoAPagar ?? 0), 0);
  const hayMonto = filas.some((f) => f.montoAPagar != null);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        subtitle="Horas trabajadas y a pagar en el período elegido"
        actions={
          <div className="flex items-center gap-2">
            <a href={url({ formato: "xlsx" })} className={accion}>
              <FileSpreadsheet size={16} aria-hidden />
              Excel
            </a>
            <a href={url({}, "/admin/reportes/imprimir")} target="_blank" rel="noreferrer" className={accion}>
              <Printer size={16} aria-hidden />
              PDF
            </a>
            <a href={url({ formato: "csv" })} className={accion}>
              <Download size={16} aria-hidden />
              CSV
            </a>
          </div>
        }
      >
        Reportes
      </PageTitle>

      <BarraContexto
        campos={[
          {
            etiqueta: "Sucursal",
            contenido: locales.length > 1 && (
              <SelectorLocal locales={locales} valor={localId} onChange={setLocalId} todos="Todas" />
            ),
          },
          {
            etiqueta: "Empleado",
            className: "sm:w-64",
            contenido: (
              <Select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} aria-label="Empleado">
                <option value="">Todos</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </Select>
            ),
          },
        ]}
        derecha={{ etiqueta: "Período", contenido: <PeriodoSelector valor={valor} onChange={setValor} hoy={hoy} /> }}
        pie={{
          alcance: locales.find((l) => l.id === localId)?.nombre ?? "Todas las sucursales",
          detalle: `${fechaLarga(desde)} a ${fechaLarga(hasta)}${cargando ? " · actualizando" : ""}`,
        }}
      />

      {!cargando && hayMonto && (
        <CostoLaboral
          costoLaboral={totalMonto}
          empleadosSinPrecio={filas.filter((f) => f.montoAPagar == null).length}
          desde={desde}
          hasta={hasta}
          localId={localId}
          locales={locales}
        />
      )}

      {cargando ? (
        <Spinner />
      ) : filas.length === 0 ? (
        <EmptyState>Sin fichajes en este período.</EmptyState>
      ) : (
        <Card className="flex flex-col gap-3">
          {filas.map((f) => (
            <div
              key={f.empleadoId}
              className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-[#26312d]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{f.nombre}</span>
                <span className="shrink-0 text-right">
                  <span className="text-slate-600 dark:text-[#c1cbc6]">
                    {f.horasTrabajadas.toFixed(2)} h
                  </span>
                  {f.montoAPagar != null && (
                    <span className="ml-2 font-semibold text-emerald-700 dark:text-[#4ee6b0]">
                      ${f.montoAPagar.toFixed(2)}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {f.horasExtra > 0 && (
                  <span
                    title={`Diaria: ${f.extraDiaria.toFixed(2)} h · Semanal: ${f.extraSemanal.toFixed(2)} h. Se liquida la mayor de las dos, por semana.`}
                  >
                    <Badge tone="emerald">+{f.horasExtra.toFixed(2)} h extra</Badge>
                  </span>
                )}
                {f.minutosTarde > 0 && <Badge tone="amber">{f.minutosTarde} min tarde</Badge>}
                {f.minutosSalidaTemprana > 0 && (
                  <Badge tone="amber">{f.minutosSalidaTemprana} min antes</Badge>
                )}
                {f.diasSinFichar > 0 && (
                  <Badge tone="rose">
                    {f.diasSinFichar} {f.diasSinFichar === 1 ? "día sin fichar" : "días sin fichar"}
                  </Badge>
                )}
                {f.horasDescanso > 0 && (
                  <Badge tone="slate">{f.horasDescanso.toFixed(2)} h descanso</Badge>
                )}
                <Badge tone="slate">
                  {f.diasTrabajados} {f.diasTrabajados === 1 ? "día" : "días"}
                </Badge>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-bold dark:border-[#26312d]">
            <span>Total</span>
            <span>
              {totalHoras.toFixed(2)} h
              {totalExtra > 0 && (
                <span className="ml-2 font-semibold text-emerald-700 dark:text-[#4ee6b0]">
                  (+{totalExtra.toFixed(2)} extra)
                </span>
              )}
              {hayMonto && (
                <span className="ml-2 text-emerald-700 dark:text-[#4ee6b0]">
                  · ${totalMonto.toFixed(2)}
                </span>
              )}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
