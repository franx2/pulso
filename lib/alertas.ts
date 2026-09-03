import type { Jornada, TurnoSimple } from "./jornada";

export type TipoAlerta = "NO_FICHO" | "LLEGADA_TARDE" | "SALIDA_OLVIDADA" | "EXCESO_HORARIO";

export type AlertaDetectada = { tipo: TipoAlerta; detalle: string };

/**
 * Umbrales de las alertas.
 * ponytail: constantes por ahora. Si algún local necesita otros valores, mover
 * a columnas de `Local` como se hizo con la tolerancia de tardanza.
 */
export const UMBRALES = {
  /** Minutos después del inicio del turno (más la tolerancia) sin fichar entrada. */
  minutosParaNoFicho: 30,
  /** Minutos después del fin del turno con la jornada todavía abierta. */
  minutosParaSalidaOlvidada: 120,
  /** Horas por encima de lo previsto que se consideran jornada excesiva. */
  horasExcesoSobrePrevisto: 3,
  /** Tope absoluto de horas cuando no hay turno con el cual comparar. */
  horasExcesoSinTurno: 12,
};

function minutos(desde: Date, hasta: Date): number {
  return (hasta.getTime() - desde.getTime()) / 60_000;
}

function formatoHoras(h: number): string {
  const horas = Math.floor(h);
  const mins = Math.round((h - horas) * 60);
  return mins === 0 ? `${horas} h` : `${horas} h ${mins} min`;
}

/**
 * Decide qué alertas corresponden al día de un empleado.
 *
 * Es una función pura sobre la jornada ya evaluada: no toca la base ni el
 * reloj, `ahora` entra por parámetro. Devuelve el estado deseado completo, así
 * que llamarla dos veces con los mismos datos da lo mismo.
 */
export function detectarAlertas({
  jornada,
  turno,
  ahora,
  toleranciaMin = 10,
}: {
  jornada: Jornada;
  turno?: TurnoSimple | null;
  ahora: Date;
  toleranciaMin?: number;
}): AlertaDetectada[] {
  const alertas: AlertaDetectada[] = [];

  // Tenía turno, ya debería haber llegado y no fichó nada.
  if (turno && !jornada.entrada) {
    const tarde = minutos(turno.inicioAt, ahora) - toleranciaMin;
    if (tarde >= UMBRALES.minutosParaNoFicho) {
      alertas.push({
        tipo: "NO_FICHO",
        detalle: `No fichó la entrada. Su turno empezó hace ${Math.round(minutos(turno.inicioAt, ahora))} min.`,
      });
    }
  }

  // Llegó, pero tarde. Se reporta aparte de NO_FICHO: son excluyentes.
  if (jornada.minutosTarde > 0) {
    alertas.push({
      tipo: "LLEGADA_TARDE",
      detalle: `Llegó ${jornada.minutosTarde} min tarde.`,
    });
  }

  // El turno terminó hace rato y sigue con la jornada abierta.
  if (turno && jornada.entrada && !jornada.salida) {
    const pasados = minutos(turno.finAt, ahora);
    if (pasados >= UMBRALES.minutosParaSalidaOlvidada) {
      alertas.push({
        tipo: "SALIDA_OLVIDADA",
        detalle: `Su turno terminó hace ${Math.round(pasados / 60)} h y no marcó la salida.`,
      });
    }
  }

  // Jornada anormalmente larga: contra el turno, o contra un tope si no hay turno.
  const excede = turno
    ? jornada.horasTrabajadas - jornada.horasPrevistas >= UMBRALES.horasExcesoSobrePrevisto
    : jornada.horasTrabajadas >= UMBRALES.horasExcesoSinTurno;
  if (jornada.horasTrabajadas > 0 && excede) {
    alertas.push({
      tipo: "EXCESO_HORARIO",
      detalle: turno
        ? `Trabajó ${formatoHoras(jornada.horasTrabajadas)} sobre ${formatoHoras(jornada.horasPrevistas)} previstas.`
        : `Trabajó ${formatoHoras(jornada.horasTrabajadas)} sin turno asignado.`,
    });
  }

  return alertas;
}

export const ETIQUETA_ALERTA: Record<TipoAlerta, string> = {
  NO_FICHO: "No fichó",
  LLEGADA_TARDE: "Llegada tarde",
  SALIDA_OLVIDADA: "Salida olvidada",
  EXCESO_HORARIO: "Exceso de horario",
};
