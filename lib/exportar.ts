import ExcelJS from "exceljs";
import type { FilaReporte } from "@/app/api/reportes/route";

const VERDE = "FF0F766E";

/** Planilla lista para pasarle a quien liquida sueldos. */
export async function reporteAExcel({
  filas,
  desde,
  hasta,
}: {
  filas: FilaReporte[];
  desde: string;
  hasta: string;
}): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pulso Operativo";
  wb.created = new Date();

  const ws = wb.addWorksheet("Horas", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  ws.columns = [
    { key: "nombre", width: 28 },
    { key: "horas", width: 14 },
    { key: "extra", width: 14 },
    { key: "extraDiaria", width: 14 },
    { key: "extraSemanal", width: 14 },
    { key: "descanso", width: 14 },
    { key: "tarde", width: 14 },
    { key: "temprano", width: 16 },
    { key: "dias", width: 12 },
    { key: "sinFichar", width: 14 },
    { key: "monto", width: 16 },
  ];

  const titulo = ws.addRow([`Reporte de horas — ${desde} a ${hasta}`]);
  titulo.font = { bold: true, size: 14 };
  ws.mergeCells(titulo.number, 1, titulo.number, 11);
  ws.addRow([]);

  const encabezado = ws.addRow([
    "Empleado",
    "Horas trabajadas",
    "Horas extra",
    "Extra diaria",
    "Extra semanal",
    "Horas descanso",
    "Min. tarde",
    "Min. salida antes",
    "Días trabajados",
    "Días sin fichar",
    "Monto a pagar",
  ]);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  encabezado.alignment = { vertical: "middle", wrapText: true };

  for (const f of filas) {
    ws.addRow([
      f.nombre,
      redondear(f.horasTrabajadas),
      redondear(f.horasExtra),
      redondear(f.extraDiaria),
      redondear(f.extraSemanal),
      redondear(f.horasDescanso),
      f.minutosTarde,
      f.minutosSalidaTemprana,
      f.diasTrabajados,
      f.diasSinFichar,
      f.montoAPagar != null ? redondear(f.montoAPagar) : null,
    ]);
  }

  if (filas.length > 0) {
    const total = ws.addRow([
      "TOTAL",
      redondear(sumar(filas, (f) => f.horasTrabajadas)),
      redondear(sumar(filas, (f) => f.horasExtra)),
      redondear(sumar(filas, (f) => f.extraDiaria)),
      redondear(sumar(filas, (f) => f.extraSemanal)),
      redondear(sumar(filas, (f) => f.horasDescanso)),
      sumar(filas, (f) => f.minutosTarde),
      sumar(filas, (f) => f.minutosSalidaTemprana),
      sumar(filas, (f) => f.diasTrabajados),
      sumar(filas, (f) => f.diasSinFichar),
      redondear(sumar(filas, (f) => f.montoAPagar ?? 0)),
    ]);
    total.font = { bold: true };
    total.border = { top: { style: "thin" } };
  }

  // Dos decimales en las columnas de horas y en el monto.
  ["B", "C", "D", "E", "F", "K"].forEach((col) => {
    ws.getColumn(col).numFmt = "0.00";
  });

  const nota = ws.addRow([]);
  ws.addRow([
    "Las horas extra son, por cada semana, la mayor entre el excedente diario y el semanal (nunca la suma).",
  ]);
  ws.getRow(nota.number + 1).font = { italic: true, size: 9, color: { argb: "FF64748B" } };

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

const redondear = (n: number) => Math.round(n * 100) / 100;
const sumar = (filas: FilaReporte[], f: (x: FilaReporte) => number) =>
  filas.reduce((s, x) => s + f(x), 0);
