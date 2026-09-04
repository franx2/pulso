import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { evaluarJornada, extrasDelPeriodo } from "@/lib/jornada";
import { claveDia, claveFechaSql, claveSemana, comoFechaSql, desdeISO, finDelDia } from "@/lib/fechas";
import type { FichajeSimple } from "@/lib/horas";

export type FilaReporte = {
  empleadoId: string;
  nombre: string;
  horasTrabajadas: number;
  horasDescanso: number;
  /** Lo que efectivamente se paga: la mayor entre diaria y semanal, por semana. */
  horasExtra: number;
  /** Excedente contra el turno asignado, sumado día a día. */
  extraDiaria: number;
  /** Excedente contra el tope semanal, sumado semana a semana. */
  extraSemanal: number;
  minutosTarde: number;
  minutosSalidaTemprana: number;
  diasTrabajados: number;
  diasSinFichar: number;
  /** Horas × precio/hora, doblado en los días del calendario de feriados
   * según el multiplicador del local. Null si el empleado no tiene precio/hora
   * cargado — no se inventa un monto. */
  montoAPagar: number | null;
};

/** Ingreso y egreso de un empleado en un día puntual: la salida es null si
 * el día quedó abierto (sin fichar salida todavía). */
export type FilaDetalleDiario = {
  empleadoId: string;
  nombre: string;
  fecha: string;
  entrada: string | null;
  salida: string | null;
  horas: number;
};

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const empleadoId = searchParams.get("empleadoId");
  const localId = searchParams.get("localId");
  const formato = searchParams.get("formato");

  if (!desde || !hasta) {
    return NextResponse.json({ error: "Faltan las fechas desde/hasta" }, { status: 400 });
  }

  const fechaDesde = desdeISO(desde);
  const fechaHasta = finDelDia(desdeISO(hasta));
  if (Number.isNaN(fechaDesde.getTime()) || Number.isNaN(fechaHasta.getTime())) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
  }

  const filtroEmpleado = empleadoId ? { empleadoId } : {};
  // Filtra por dónde ocurrió el fichaje/turno, no por la sucursal de origen del
  // empleado: alguien que rota entre locales puede trabajar en cualquiera.
  const filtroLocal = localId ? { localId } : {};

  const [fichajes, turnos, locales, feriados] = await Promise.all([
    db.fichaje.findMany({
      where: { timestamp: { gte: fechaDesde, lte: fechaHasta }, ...filtroEmpleado, ...filtroLocal },
      include: { empleado: { select: { id: true, nombre: true, localId: true, precioHora: true } } },
      orderBy: { timestamp: "asc" },
    }),
    db.turno.findMany({
      // `fecha` es @db.Date: se acota con medianoche UTC, no con instantes locales.
      where: {
        fecha: { gte: comoFechaSql(fechaDesde), lte: comoFechaSql(fechaHasta) },
        ...filtroEmpleado,
        ...filtroLocal,
      },
      include: { empleado: { select: { id: true, nombre: true, localId: true, precioHora: true } } },
    }),
    db.local.findMany(),
    db.feriado.findMany(),
  ]);

  const localPorId = new Map(locales.map((l) => [l.id, l]));
  const feriadosSet = new Set(feriados.map((f) => claveFechaSql(f.fecha)));

  // Agrupa fichajes y turnos por empleado y día: la jornada es la unidad de
  // cálculo, porque tardanzas y extras sólo tienen sentido contra un turno.
  // Cada día guarda también EN QUÉ LOCAL ocurrió, que puede no ser la
  // sucursal de origen del empleado si ese día rotó a otra.
  type Dia = { fichajes: FichajeSimple[]; turno?: { inicioAt: Date; finAt: Date }; localId: string };
  const porEmpleado = new Map<
    string,
    { nombre: string; localIdHogar: string; precioHora: number | null; dias: Map<string, Dia> }
  >();

  function bucket(
    id: string,
    nombre: string,
    localIdHogar: string,
    precioHora: number | null,
    dia: string,
    localId: string
  ): Dia {
    let emp = porEmpleado.get(id);
    if (!emp) {
      emp = { nombre, localIdHogar, precioHora, dias: new Map() };
      porEmpleado.set(id, emp);
    }
    let d = emp.dias.get(dia);
    if (!d) {
      d = { fichajes: [], localId };
      emp.dias.set(dia, d);
    }
    return d;
  }

  for (const f of fichajes) {
    bucket(
      f.empleadoId,
      f.empleado.nombre,
      f.empleado.localId,
      f.empleado.precioHora,
      claveDia(f.timestamp),
      f.localId
    ).fichajes.push({ tipo: f.tipo, timestamp: f.timestamp });
  }
  for (const t of turnos) {
    // El turno manda sobre qué local aplica ese día: es la fuente de la
    // política (tolerancia, descanso) del lugar donde se lo citó a trabajar.
    const d = bucket(
      t.empleadoId,
      t.empleado.nombre,
      t.empleado.localId,
      t.empleado.precioHora,
      claveDia(t.inicioAt),
      t.localId
    );
    d.turno = { inicioAt: t.inicioAt, finAt: t.finAt };
    d.localId = t.localId;
  }

  const detalleDiario: FilaDetalleDiario[] = [];

  const filas: FilaReporte[] = [...porEmpleado.entries()].map(([id, emp]) => {
    // Cada día se etiqueta con su semana ISO: el tope semanal se aplica semana
    // por semana, no sobre el total del rango.
    const dias: { semana: string; horas: number; extraDiaria: number }[] = [];
    let horasDescanso = 0;
    let minutosTarde = 0;
    let minutosSalidaTemprana = 0;
    let diasTrabajados = 0;
    let diasSinFichar = 0;
    // Null hasta que el empleado tenga precio/hora: no se inventa un monto.
    let montoAPagar: number | null = emp.precioHora != null ? 0 : null;

    for (const [clave, dia] of emp.dias) {
      const local = localPorId.get(dia.localId) ?? localPorId.get(emp.localIdHogar);
      const j = evaluarJornada({
        fichajes: dia.fichajes,
        turno: dia.turno,
        toleranciaMin: local?.toleranciaMin,
        descuentaDescanso: local?.descuentaDescanso,
      });
      dias.push({
        semana: claveSemana(new Date(clave + "T12:00:00")),
        horas: j.horasTrabajadas,
        extraDiaria: j.horasExtra,
      });
      horasDescanso += j.horasDescanso;
      minutosTarde += j.minutosTarde;
      minutosSalidaTemprana += j.minutosSalidaTemprana;
      if (j.estado === "SIN_FICHAR") diasSinFichar++;
      else if (j.horasTrabajadas > 0) diasTrabajados++;

      if (j.entrada) {
        detalleDiario.push({
          empleadoId: id,
          nombre: emp.nombre,
          fecha: clave,
          entrada: j.entrada.toISOString(),
          salida: j.salida ? j.salida.toISOString() : null,
          horas: j.horasTrabajadas,
        });
      }

      if (emp.precioHora != null) {
        const factor = feriadosSet.has(clave) ? (local?.multiplicadorFeriado ?? 2) : 1;
        montoAPagar = (montoAPagar ?? 0) + j.horasTrabajadas * emp.precioHora * factor;
      }
    }

    // El tope semanal es uno solo por período: se toma el de la sucursal de
    // origen del empleado (no tiene sentido partirlo si rotó de local a mitad
    // de semana).
    const localHogar = localPorId.get(emp.localIdHogar);
    const extras = extrasDelPeriodo({ dias, topeSemanalHoras: localHogar?.topeSemanalHoras });

    return {
      empleadoId: id,
      nombre: emp.nombre,
      horasTrabajadas: extras.totalHoras,
      horasDescanso,
      horasExtra: extras.extraALiquidar,
      extraDiaria: extras.extraDiaria,
      extraSemanal: extras.extraSemanal,
      minutosTarde,
      minutosSalidaTemprana,
      diasTrabajados,
      diasSinFichar,
      montoAPagar,
    };
  });

  filas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  detalleDiario.sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.fecha.localeCompare(b.fecha));

  if (formato === "csv") {
    const columnas = [
      "Empleado",
      "Horas trabajadas",
      "Horas extra",
      "Extra diaria",
      "Extra semanal",
      "Horas descanso",
      "Minutos tarde",
      "Minutos salida temprana",
      "Dias trabajados",
      "Dias sin fichar",
      "Monto a pagar",
    ];
    const cuerpo = filas
      .map((f) =>
        [
          `"${f.nombre.replace(/"/g, '""')}"`,
          f.horasTrabajadas.toFixed(2),
          f.horasExtra.toFixed(2),
          f.extraDiaria.toFixed(2),
          f.extraSemanal.toFixed(2),
          f.horasDescanso.toFixed(2),
          f.minutosTarde,
          f.minutosSalidaTemprana,
          f.diasTrabajados,
          f.diasSinFichar,
          f.montoAPagar != null ? f.montoAPagar.toFixed(2) : "",
        ].join(",")
      )
      .join("\n");
    return new NextResponse(columnas.join(",") + "\n" + cuerpo, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reporte-${desde}-a-${hasta}.csv"`,
      },
    });
  }

  if (formato === "xlsx") {
    const { reporteAExcel } = await import("@/lib/exportar");
    const archivo = await reporteAExcel({ filas, detalleDiario, desde, hasta });
    return new NextResponse(archivo, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reporte-${desde}-a-${hasta}.xlsx"`,
      },
    });
  }

  return NextResponse.json({ filas, detalleDiario });
}
