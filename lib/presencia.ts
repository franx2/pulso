import { db } from "./db";
import { comoFechaSql, inicioDelDia, finDelDia } from "./fechas";
import { evaluarJornada, type Jornada } from "./jornada";
import { detectarAlertas } from "./alertas";
import { enviarEmail, plantillaAlertas } from "./email";
import { ETIQUETA_ALERTA } from "./alertas";

export type EstadoPresencia =
  | "TRABAJANDO"
  | "EN_DESCANSO"
  | "TERMINO"
  | "FALTA"
  | "AUSENTE"
  | "SIN_TURNO";

export type FilaPresencia = {
  empleadoId: string;
  nombre: string;
  local: string;
  estado: EstadoPresencia;
  entrada: string | null;
  salida: string | null;
  horasTrabajadas: number;
  minutosTarde: number;
  turno: { horaInicio: string; horaFin: string } | null;
  /** Motivo cuando está de licencia aprobada (vacaciones, franco…). */
  ausencia: string | null;
};

/**
 * Foto del día: qué está haciendo cada empleado activo ahora mismo.
 *
 * Se calcula sobre los fichajes del día en curso, sin estado guardado: la
 * verdad siempre son los fichajes crudos.
 *
 * Con `localId`, filtra a quienes hoy corresponden a esa sucursal: si tienen
 * turno hoy, manda el local del turno (pudo rotar); si no, su local de origen.
 */
export async function fotoDelDia(ahora = new Date(), localId?: string) {
  const hoySql = comoFechaSql(ahora);

  const [empleados, turnos, fichajes, ausencias] = await Promise.all([
    db.empleado.findMany({
      where: { activo: true },
      include: { local: { select: { id: true, nombre: true, toleranciaMin: true, descuentaDescanso: true } } },
      orderBy: { nombre: "asc" },
    }),
    db.turno.findMany({ where: { fecha: hoySql } }),
    db.fichaje.findMany({
      where: { timestamp: { gte: inicioDelDia(ahora), lte: finDelDia(ahora) } },
      orderBy: { timestamp: "asc" },
    }),
    // Licencias aprobadas que cubren el día de hoy.
    db.ausencia.findMany({
      where: { estado: "APROBADA", desde: { lte: hoySql }, hasta: { gte: hoySql } },
      select: { empleadoId: true, tipo: true },
    }),
  ]);

  const turnoPorEmpleado = new Map(turnos.map((t) => [t.empleadoId, t]));
  const ausentePorEmpleado = new Map(ausencias.map((a) => [a.empleadoId, a.tipo]));
  const fichajesPorEmpleado = new Map<string, { tipo: typeof fichajes[number]["tipo"]; timestamp: Date }[]>();
  for (const f of fichajes) {
    const lista = fichajesPorEmpleado.get(f.empleadoId) ?? [];
    lista.push({ tipo: f.tipo, timestamp: f.timestamp });
    fichajesPorEmpleado.set(f.empleadoId, lista);
  }

  const filtrados = localId
    ? empleados.filter((e) => {
        const turno = turnoPorEmpleado.get(e.id);
        return turno ? turno.localId === localId : e.localId === localId;
      })
    : empleados;

  return filtrados.map((e) => {
    const turno = turnoPorEmpleado.get(e.id);
    const jornada = evaluarJornada({
      fichajes: fichajesPorEmpleado.get(e.id) ?? [],
      turno,
      toleranciaMin: e.local.toleranciaMin,
      descuentaDescanso: e.local.descuentaDescanso,
      // El panel muestra el tiempo corriendo de quien sigue adentro.
      ahora,
    });

    const ausencia = ausentePorEmpleado.get(e.id) ?? null;

    return {
      empleado: e,
      turno,
      jornada,
      /** Con licencia aprobada no se generan alertas de puntualidad. */
      ausente: ausencia !== null,
      fila: {
        empleadoId: e.id,
        nombre: e.nombre,
        local: e.local.nombre,
        estado: estadoPresencia(jornada, Boolean(turno), ausencia !== null),
        entrada: jornada.entrada?.toISOString() ?? null,
        salida: jornada.salida?.toISOString() ?? null,
        horasTrabajadas: jornada.horasTrabajadas,
        minutosTarde: jornada.minutosTarde,
        turno: turno ? { horaInicio: turno.horaInicio, horaFin: turno.horaFin } : null,
        ausencia,
      } satisfies FilaPresencia,
    };
  });
}

function estadoPresencia(
  jornada: Jornada,
  tieneTurno: boolean,
  ausente: boolean
): EstadoPresencia {
  // Si vino igual estando de licencia, manda lo que realmente hizo.
  if (ausente && jornada.estado !== "EN_CURSO" && jornada.estado !== "EN_DESCANSO") {
    return "AUSENTE";
  }
  switch (jornada.estado) {
    case "EN_DESCANSO":
      return "EN_DESCANSO";
    case "EN_CURSO":
      return "TRABAJANDO";
    case "COMPLETA":
      return "TERMINO";
    case "SIN_FICHAR":
      return "FALTA";
    default:
      return tieneTurno ? "FALTA" : "SIN_TURNO";
  }
}

/**
 * Recalcula las alertas del día y las guarda.
 *
 * Idempotente por el índice único (empleado, fecha, tipo): se puede llamar en
 * cada carga del panel sin duplicar nada. Las alertas que dejaron de aplicar
 * (por ejemplo, alguien que finalmente fichó) se borran salvo que ya estén
 * resueltas a mano, para no perder ese registro.
 */
export async function sincronizarAlertas(ahora = new Date()) {
  const foto = await fotoDelDia(ahora);
  const fecha = comoFechaSql(ahora);

  const deseadas = foto.flatMap(({ empleado, turno, jornada, ausente }) =>
    // Con licencia aprobada no hay nada que reclamar.
    (ausente
      ? []
      : detectarAlertas({ jornada, turno, ahora, toleranciaMin: empleado.local.toleranciaMin })
    ).map((a) => ({
      empleadoId: empleado.id,
      localId: empleado.localId,
      tipo: a.tipo,
      detalle: a.detalle,
      nombre: empleado.nombre,
    }))
  );

  const existentes = await db.alerta.findMany({ where: { fecha } });

  const claveDe = (a: { empleadoId: string; tipo: string }) => `${a.empleadoId}:${a.tipo}`;
  const clavesDeseadas = new Set(deseadas.map(claveDe));

  // Se fue la causa: la alerta ya no corresponde.
  const aBorrar = existentes.filter((e) => !clavesDeseadas.has(claveDe(e)) && !e.resuelta);
  if (aBorrar.length > 0) {
    await db.alerta.deleteMany({ where: { id: { in: aBorrar.map((a) => a.id) } } });
  }

  const existentesPorClave = new Map(existentes.map((e) => [claveDe(e), e]));
  const nuevas = deseadas.filter((d) => !existentesPorClave.has(claveDe(d)));

  if (nuevas.length > 0) {
    await db.alerta.createMany({
      data: nuevas.map(({ empleadoId, localId, tipo, detalle }) => ({
        empleadoId,
        localId,
        tipo,
        detalle,
        fecha,
      })),
      skipDuplicates: true,
    });
  }

  return { nuevas: nuevas.length, borradas: aBorrar.length };
}

/** Manda por mail las alertas pendientes que todavía no se notificaron. */
export async function notificarAlertasPendientes(ahora = new Date()) {
  const sinNotificar = await db.alerta.findMany({
    where: { notificadaEn: null, resuelta: false, fecha: comoFechaSql(ahora) },
    include: { empleado: { select: { nombre: true } } },
  });
  if (sinNotificar.length === 0) return { enviadas: 0 };

  const destinatarios = await db.empleado.findMany({
    where: { activo: true, rol: { in: ["ADMIN", "ENCARGADO"] }, email: { not: null } },
    select: { email: true },
  });
  const to = destinatarios.map((d) => d.email!).filter(Boolean);
  if (to.length === 0) return { enviadas: 0 };

  const enviado = await enviarEmail({
    to,
    subject: `Pulso Operativo: ${sinNotificar.length} aviso${sinNotificar.length === 1 ? "" : "s"}`,
    html: plantillaAlertas(
      sinNotificar.map((a) => ({
        empleado: a.empleado.nombre,
        tipo: ETIQUETA_ALERTA[a.tipo],
        detalle: a.detalle,
      })),
      `${process.env.ORIGIN ?? ""}/admin/presencia`
    ),
  });

  if (!enviado) return { enviadas: 0 };

  await db.alerta.updateMany({
    where: { id: { in: sinNotificar.map((a) => a.id) } },
    data: { notificadaEn: ahora },
  });

  return { enviadas: sinNotificar.length };
}
