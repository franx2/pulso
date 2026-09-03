"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, Printer, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Label, PageTitle, Select, Spinner } from "@/components/ui";

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
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function haceUnaSemanaISO() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function ReportesClient() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [locales, setLocales] = useState<Local[]>([]);
  const [empleadoId, setEmpleadoId] = useState("");
  const [localId, setLocalId] = useState("");
  const [desde, setDesde] = useState(haceUnaSemanaISO());
  const [hasta, setHasta] = useState(hoyISO());
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

  async function buscar() {
    setCargando(true);
    const params = new URLSearchParams({ desde, hasta });
    if (empleadoId) params.set("empleadoId", empleadoId);
    if (localId) params.set("localId", localId);
    const res = await fetch(`/api/reportes?${params}`);
    const data = await res.json();
    setFilas(data.filas ?? []);
    setCargando(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function url(extra: Record<string, string> = {}, base = "/api/reportes") {
    const params = new URLSearchParams({ desde, hasta, ...extra });
    if (empleadoId) params.set("empleadoId", empleadoId);
    if (localId) params.set("localId", localId);
    return `${base}?${params}`;
  }

  const totalHoras = filas.reduce((sum, f) => sum + f.horasTrabajadas, 0);
  const totalExtra = filas.reduce((sum, f) => sum + f.horasExtra, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle subtitle="Horas trabajadas por rango de fechas">Reportes</PageTitle>

      <Card className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>
        {locales.length > 1 && (
          <div>
            <Label>Sucursal</Label>
            <Select value={localId} onChange={(e) => setLocalId(e.target.value)}>
              <option value="">Todas</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label>Empleado</Label>
          <Select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
            <option value="">Todos</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={buscar}>
          <Search size={16} />
          Buscar
        </Button>
        <div className="flex flex-wrap gap-2">
          <a href={url({ formato: "xlsx" })} className="flex-1">
            <Button variant="ghost" type="button" className="w-full">
              <FileSpreadsheet size={16} />
              Excel
            </Button>
          </a>
          <a
            href={url({}, "/admin/reportes/imprimir")}
            target="_blank"
            rel="noreferrer"
            className="flex-1"
          >
            <Button variant="ghost" type="button" className="w-full">
              <Printer size={16} />
              PDF
            </Button>
          </a>
          <a href={url({ formato: "csv" })} className="flex-1">
            <Button variant="ghost" type="button" className="w-full">
              <Download size={16} />
              CSV
            </Button>
          </a>
        </div>
      </Card>

      {cargando ? (
        <Spinner />
      ) : filas.length === 0 ? (
        <EmptyState>Sin fichajes en el rango seleccionado</EmptyState>
      ) : (
        <Card className="flex flex-col gap-3">
          {filas.map((f) => (
            <div
              key={f.empleadoId}
              className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-[#26312d]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{f.nombre}</span>
                <span className="shrink-0 text-slate-600 dark:text-[#c1cbc6]">
                  {f.horasTrabajadas.toFixed(2)} h
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
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
