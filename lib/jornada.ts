import { calcularHoras, type FichajeSimple } from "./horas";

export type EstadoJornada =
  | "SIN_FICHAR"
  | "EN_CURSO"
  | "EN_DESCANSO"
  | "COMPLETA"
  | "SIN_TURNO";

export type Jornada = {
  estado: EstadoJornada;
  entrada: Date | null;
  salida: Date | null;
  horasTrabajadas: number;
  horasDescanso: number;
  /** Horas que debía cubrir según el turno. 0 si no tenía turno asignado. */
  horasPrevistas: number;
  /** Minutos de tardanza más allá de la tolerancia. 0 si llegó en horario. */
  minutosTarde: number;
  /** Minutos que se fue antes del fin del turno, más allá de la tolerancia. */
  minutosSalidaTemprana: number;
  /** Horas trabajadas por encima del turno previsto. */
  horasExtra: number;
};

export type TurnoSimple = { inicioAt: Date; finAt: Date };

/**
 * Compara los fichajes de un día contra el turno asignado.
 *
 * La tolerancia se aplica a los dos extremos: llegar 5 minutos tarde con
 * tolerancia 10 no es tardanza, y tampoco lo es irse 5 minutos antes.
 */
export function evaluarJornada({
  fichajes,
  turno,
  toleranciaMin = 10,
  descuentaDescanso = true,
  ahora,
}: {
  fichajes: FichajeSimple[];
  turno?: TurnoSimple | null;
  toleranciaMin?: number;
  descuentaDescanso?: boolean;
  /** Presente sólo en el panel en vivo: cuenta el tiempo del turno abierto. */
  ahora?: Date;
}): Jornada {
  const h = calcularHoras(fichajes, { descuentaDescanso, ahora });

  const horasPrevistas = turno
    ? (turno.finAt.getTime() - turno.inicioAt.getTime()) / 3_600_000
    : 0;

  let minutosTarde = 0;
  let minutosSalidaTemprana = 0;

  if (turno && h.entrada) {
    const tarde = (h.entrada.getTime() - turno.inicioAt.getTime()) / 60_000;
    minutosTarde = Math.max(0, Math.round(tarde - toleranciaMin));
  }

  if (turno && h.salida && !h.abierto) {
    const temprana = (turno.finAt.getTime() - h.salida.getTime()) / 60_000;
    minutosSalidaTemprana = Math.max(0, Math.round(temprana - toleranciaMin));
  }

  const horasExtra = turno ? Math.max(0, h.horasTrabajadas - horasPrevistas) : 0;

  return {
    estado: estadoDe(h, turno, fichajes.length),
    entrada: h.entrada,
    salida: h.salida,
    horasTrabajadas: h.horasTrabajadas,
    horasDescanso: h.horasDescanso,
    horasPrevistas,
    minutosTarde,
    minutosSalidaTemprana,
    horasExtra,
  };
}

function estadoDe(
  h: ReturnType<typeof calcularHoras>,
  turno: TurnoSimple | null | undefined,
  cantidadFichajes: number
): EstadoJornada {
  if (h.enDescanso) return "EN_DESCANSO";
  if (h.abierto) return "EN_CURSO";
  if (cantidadFichajes === 0) return turno ? "SIN_FICHAR" : "SIN_TURNO";
  return "COMPLETA";
}

/**
 * Horas extra de UNA semana.
 *
 * Se calculan por dos vías que pueden dar distinto: la suma de los excedentes
 * diarios (contra cada turno) y el excedente contra el tope semanal. Se liquida
 * la mayor de las dos para no pagar dos veces la misma hora ni quedarse corto.
 * ponytail: si el contador prefiere otra regla, cambiar sólo este `Math.max`.
 */
export function extrasSemanales({
  horasPorDia,
  extraDiariaPorDia,
  topeSemanalHoras = 48,
}: {
  horasPorDia: number[];
  extraDiariaPorDia: number[];
  topeSemanalHoras?: number;
}): { totalSemana: number; extraDiaria: number; extraSemanal: number; extraALiquidar: number } {
  const totalSemana = horasPorDia.reduce((s, h) => s + h, 0);
  const extraDiaria = extraDiariaPorDia.reduce((s, h) => s + h, 0);
  const extraSemanal = Math.max(0, totalSemana - topeSemanalHoras);

  return {
    totalSemana,
    extraDiaria,
    extraSemanal,
    extraALiquidar: Math.max(extraDiaria, extraSemanal),
  };
}

export type DiaDelPeriodo = {
  /** Clave de la semana ISO a la que pertenece el día. */
  semana: string;
  horas: number;
  extraDiaria: number;
};

/**
 * Horas extra de un rango de cualquier largo.
 *
 * El tope semanal se aplica semana por semana y recién después se suma. Aplicarlo
 * sobre el total del período haría que un reporte mensual de 190 h informara
 * 142 h extra contra un tope de 48.
 */
export function extrasDelPeriodo({
  dias,
  topeSemanalHoras = 48,
}: {
  dias: DiaDelPeriodo[];
  topeSemanalHoras?: number;
}): { totalHoras: number; extraDiaria: number; extraSemanal: number; extraALiquidar: number } {
  const porSemana = new Map<string, { horas: number[]; extras: number[] }>();
  for (const d of dias) {
    const s = porSemana.get(d.semana) ?? { horas: [], extras: [] };
    s.horas.push(d.horas);
    s.extras.push(d.extraDiaria);
    porSemana.set(d.semana, s);
  }

  let totalHoras = 0;
  let extraDiaria = 0;
  let extraSemanal = 0;
  let extraALiquidar = 0;

  for (const { horas, extras } of porSemana.values()) {
    const r = extrasSemanales({
      horasPorDia: horas,
      extraDiariaPorDia: extras,
      topeSemanalHoras,
    });
    totalHoras += r.totalSemana;
    extraDiaria += r.extraDiaria;
    extraSemanal += r.extraSemanal;
    extraALiquidar += r.extraALiquidar;
  }

  return { totalHoras, extraDiaria, extraSemanal, extraALiquidar };
}
