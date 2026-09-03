export type TipoFichaje = "ENTRADA" | "SALIDA" | "DESCANSO_INICIO" | "DESCANSO_FIN";

export type FichajeSimple = { tipo: TipoFichaje; timestamp: Date };

export type Intervalo = { inicio: Date; fin: Date | null; horas: number };

export type ResultadoHoras = {
  /** Primer ENTRADA del período. */
  entrada: Date | null;
  /** Última SALIDA del período. */
  salida: Date | null;
  /** Tramos ENTRADA→SALIDA. */
  intervalos: Intervalo[];
  /** Tramos DESCANSO_INICIO→DESCANSO_FIN. */
  descansos: Intervalo[];
  /** Horas entre entrada y salida, sin descontar descansos. */
  horasBrutas: number;
  /** Horas de descanso cerradas. */
  horasDescanso: number;
  /** Horas a liquidar: brutas menos descanso si el local lo descuenta. */
  horasTrabajadas: number;
  /** Fichó entrada y todavía no salió. */
  abierto: boolean;
  /** Está en un descanso sin cerrar. */
  enDescanso: boolean;
};

/**
 * Reconstruye la jornada a partir de los fichajes crudos.
 *
 * Tolerante a datos incompletos, que en la práctica son la norma: una SALIDA
 * sin ENTRADA previa se ignora, y una ENTRADA o un DESCANSO_INICIO sin cerrar
 * quedan como tramo abierto que no suma horas (pero sí marca el estado, que es
 * lo que necesita el panel de presencia).
 */
export function calcularHoras(
  fichajes: FichajeSimple[],
  opts: { descuentaDescanso?: boolean; ahora?: Date } = {}
): ResultadoHoras {
  const descuentaDescanso = opts.descuentaDescanso ?? true;
  const ahora = opts.ahora;

  const ordenados = [...fichajes].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const intervalos: Intervalo[] = [];
  const descansos: Intervalo[] = [];
  let trabajoAbierto: Date | null = null;
  let descansoAbierto: Date | null = null;

  for (const f of ordenados) {
    switch (f.tipo) {
      case "ENTRADA":
        // Una segunda ENTRADA sin SALIDA no reinicia el tramo: la primera manda.
        if (!trabajoAbierto) trabajoAbierto = f.timestamp;
        break;

      case "SALIDA":
        if (!trabajoAbierto) break; // SALIDA huérfana.
        // Salir con un descanso abierto lo cierra: nadie ficha el fin del descanso
        // y después se va, pero pasa todo el tiempo.
        if (descansoAbierto) {
          descansos.push(nuevoIntervalo(descansoAbierto, f.timestamp));
          descansoAbierto = null;
        }
        intervalos.push(nuevoIntervalo(trabajoAbierto, f.timestamp));
        trabajoAbierto = null;
        break;

      case "DESCANSO_INICIO":
        if (trabajoAbierto && !descansoAbierto) descansoAbierto = f.timestamp;
        break;

      case "DESCANSO_FIN":
        if (!descansoAbierto) break; // Fin de descanso huérfano.
        descansos.push(nuevoIntervalo(descansoAbierto, f.timestamp));
        descansoAbierto = null;
        break;
    }
  }

  // Un tramo sin cerrar no suma horas: en un reporte no se inventa tiempo que
  // nadie fichó. Con `ahora` (panel en vivo) sí se cuenta lo transcurrido, para
  // poder mostrar cuánto lleva trabajando quien todavía está adentro.
  if (trabajoAbierto) {
    intervalos.push(
      ahora ? nuevoIntervalo(trabajoAbierto, ahora) : { inicio: trabajoAbierto, fin: null, horas: 0 }
    );
  }
  if (descansoAbierto) {
    descansos.push(
      ahora ? nuevoIntervalo(descansoAbierto, ahora) : { inicio: descansoAbierto, fin: null, horas: 0 }
    );
  }

  const horasBrutas = intervalos.reduce((sum, i) => sum + i.horas, 0);
  const horasDescanso = descansos.reduce((sum, d) => sum + d.horas, 0);
  const horasTrabajadas = descuentaDescanso
    ? Math.max(0, horasBrutas - horasDescanso)
    : horasBrutas;

  const primero = ordenados.find((f) => f.tipo === "ENTRADA");
  const ultimaSalida = [...ordenados].reverse().find((f) => f.tipo === "SALIDA");

  return {
    entrada: primero?.timestamp ?? null,
    salida: ultimaSalida?.timestamp ?? null,
    intervalos,
    descansos,
    horasBrutas,
    horasDescanso,
    horasTrabajadas,
    abierto: trabajoAbierto !== null,
    enDescanso: descansoAbierto !== null,
  };
}

function nuevoIntervalo(inicio: Date, fin: Date): Intervalo {
  return { inicio, fin, horas: (fin.getTime() - inicio.getTime()) / 3_600_000 };
}

/** Qué fichaje corresponde apretar según el estado actual de la jornada. */
export function proximoFichaje(estado: Pick<ResultadoHoras, "abierto" | "enDescanso">): TipoFichaje {
  if (estado.enDescanso) return "DESCANSO_FIN";
  return estado.abierto ? "SALIDA" : "ENTRADA";
}
