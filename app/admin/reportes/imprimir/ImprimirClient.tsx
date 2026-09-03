"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";

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

const n2 = (n: number) => n.toFixed(2);

/**
 * Versión imprimible del reporte.
 *
 * ponytail: el "PDF" lo genera el navegador con Guardar como PDF. Evita sumar
 * una librería de PDF de ~2 MB al servidor y da mejor tipografía; si algún día
 * hace falta generarlo sin navegador (mandarlo por mail), ahí sí conviene una.
 */
export default function ImprimirClient() {
  const params = useSearchParams();
  const desde = params.get("desde") ?? "";
  const hasta = params.get("hasta") ?? "";
  const empleadoId = params.get("empleadoId") ?? "";
  const localId = params.get("localId") ?? "";

  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams({ desde, hasta });
    if (empleadoId) qs.set("empleadoId", empleadoId);
    if (localId) qs.set("localId", localId);
    fetch(`/api/reportes?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setFilas(d.filas ?? []);
        setCargando(false);
      });
  }, [desde, hasta, empleadoId, localId]);

  const total = (f: (x: Fila) => number) => filas.reduce((s, x) => s + f(x), 0);

  if (cargando) return <p className="p-8 text-slate-500">Preparando el reporte…</p>;

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-slate-900 print:p-0">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 14mm; }
          .no-imprimir { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="no-imprimir mb-6 flex justify-end">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          <Printer size={16} />
          Imprimir o guardar como PDF
        </button>
      </div>

      <header className="mb-6 border-b border-slate-300 pb-4">
        <h1 className="text-2xl font-bold">Reporte de horas</h1>
        <p className="mt-1 text-sm text-slate-600">
          Período del {desde} al {hasta}
          {filas.length === 1 ? ` · ${filas[0].nombre}` : ` · ${filas.length} empleados`}
        </p>
      </header>

      {filas.length === 0 ? (
        <p className="text-slate-500">Sin fichajes en el período seleccionado.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left">
              <th className="py-2 pr-3">Empleado</th>
              <th className="py-2 pr-3 text-right">Horas</th>
              <th className="py-2 pr-3 text-right">Extra</th>
              <th className="py-2 pr-3 text-right">Descanso</th>
              <th className="py-2 pr-3 text-right">Min. tarde</th>
              <th className="py-2 pr-3 text-right">Min. antes</th>
              <th className="py-2 pr-3 text-right">Días</th>
              <th className="py-2 text-right">Sin fichar</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.empleadoId} className="border-b border-slate-200">
                <td className="py-2 pr-3 font-medium">{f.nombre}</td>
                <td className="py-2 pr-3 text-right">{n2(f.horasTrabajadas)}</td>
                <td className="py-2 pr-3 text-right">{n2(f.horasExtra)}</td>
                <td className="py-2 pr-3 text-right">{n2(f.horasDescanso)}</td>
                <td className="py-2 pr-3 text-right">{f.minutosTarde || "—"}</td>
                <td className="py-2 pr-3 text-right">{f.minutosSalidaTemprana || "—"}</td>
                <td className="py-2 pr-3 text-right">{f.diasTrabajados}</td>
                <td className="py-2 text-right">{f.diasSinFichar || "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-800 font-bold">
              <td className="py-2 pr-3">TOTAL</td>
              <td className="py-2 pr-3 text-right">{n2(total((f) => f.horasTrabajadas))}</td>
              <td className="py-2 pr-3 text-right">{n2(total((f) => f.horasExtra))}</td>
              <td className="py-2 pr-3 text-right">{n2(total((f) => f.horasDescanso))}</td>
              <td className="py-2 pr-3 text-right">{total((f) => f.minutosTarde) || "—"}</td>
              <td className="py-2 pr-3 text-right">{total((f) => f.minutosSalidaTemprana) || "—"}</td>
              <td className="py-2 pr-3 text-right">{total((f) => f.diasTrabajados)}</td>
              <td className="py-2 text-right">{total((f) => f.diasSinFichar) || "—"}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <footer className="mt-6 border-t border-slate-300 pt-3 text-xs text-slate-500">
        <p>
          Las horas extra son, por cada semana, la mayor entre el excedente diario (contra el turno
          asignado) y el semanal (contra el tope del local). Nunca se suman las dos.
        </p>
        <p className="mt-1">
          Emitido el {new Date().toLocaleString("es-AR")} · Pulso Operativo
        </p>
      </footer>
    </div>
  );
}
