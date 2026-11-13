import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";
import { auditar } from "@/lib/auditoria";
import { asignarJornadas, calcularHoras } from "@/lib/horas";
import { claveDiaAR, fechaSql, finDiaAR, hoyAR, inicioDiaAR, instanteAR, sumarDias } from "@/lib/fechaAR";

/**
 * La jornada de un empleado en un día, para que el encargado la arregle sin
 * esperar a que el empleado pida la corrección: se quedó sin batería, marcó
 * dos veces, se fue sin fichar. Todo lo que se toca queda auditado con motivo.
 */

const TIPOS = ["ENTRADA", "SALIDA", "DESCANSO_INICIO", "DESCANSO_FIN"] as const;
type Tipo = (typeof TIPOS)[number];
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(request: Request) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const empleadoId = params.get("empleadoId") ?? "";
  const dia = params.get("dia") ?? hoyAR();
  if (!DIA.test(dia)) return NextResponse.json({ error: "Día inválido" }, { status: 400 });

  const empleado = await db.empleado.findUnique({
    where: { id: empleadoId },
    select: { id: true, nombre: true, local: { select: { nombre: true, descuentaDescanso: true } } },
  });
  if (!empleado) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

  const [cercanos, turno] = await Promise.all([
    // Un día de cada lado: la jornada es del día en que empezó, y un turno
    // nocturno termina pasada la medianoche.
    db.fichaje.findMany({
      where: { empleadoId, timestamp: { gte: inicioDiaAR(sumarDias(dia, -1)), lte: finDiaAR(sumarDias(dia, 1)) } },
      select: {
        id: true,
        tipo: true,
        timestamp: true,
        corregido: true,
        rostro: true,
        distanciaM: true,
        local: { select: { nombre: true } },
      },
      orderBy: { timestamp: "asc" },
    }),
    db.turno.findFirst({
      where: { empleadoId, fecha: fechaSql(dia) },
      select: { horaInicio: true, horaFin: true, local: { select: { nombre: true } } },
    }),
  ]);

  const fichajes = asignarJornadas(cercanos, claveDiaAR)
    .filter((a) => a.dia === dia)
    .map((a) => a.fichaje);

  const horas = calcularHoras(fichajes, {
    descuentaDescanso: empleado.local.descuentaDescanso,
    ahora: dia === hoyAR() ? new Date() : undefined,
  });

  return NextResponse.json({
    empleado: { id: empleado.id, nombre: empleado.nombre },
    dia,
    turno: turno && { horaInicio: turno.horaInicio, horaFin: turno.horaFin, local: turno.local.nombre },
    horasTrabajadas: horas.horasTrabajadas,
    fichajes: fichajes.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      timestamp: f.timestamp.toISOString(),
      corregido: f.corregido,
      rostro: f.rostro,
      distanciaM: f.distanciaM,
      local: f.local.nombre,
    })),
  });
}

/** Cargar un fichaje que falta. */
export async function POST(request: Request) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await readJsonBody<{ empleadoId?: string; dia?: string; hora?: string; tipo?: string; motivo?: string }>(request);
  const motivo = body?.motivo?.trim() ?? "";
  if (!body?.dia || !DIA.test(body.dia) || !body.hora || !HORA.test(body.hora)) {
    return NextResponse.json({ error: "Indicá el día y la hora" }, { status: 400 });
  }
  if (!(TIPOS as readonly string[]).includes(body.tipo ?? "")) {
    return NextResponse.json({ error: "Indicá si es entrada, salida o descanso" }, { status: 400 });
  }
  if (!motivo) return NextResponse.json({ error: "Escribí el motivo: queda en el registro de cambios" }, { status: 400 });

  const timestamp = instanteAR(body.dia, body.hora);
  if (timestamp.getTime() > Date.now() + 60_000) {
    return NextResponse.json({ error: "No se puede cargar un fichaje en el futuro" }, { status: 400 });
  }

  const empleado = await db.empleado.findUnique({ where: { id: body.empleadoId ?? "" }, select: { id: true, localId: true } });
  if (!empleado) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

  // Si ese día tenía turno, el fichaje es del local del turno: pudo rotar.
  const turno = await db.turno.findFirst({ where: { empleadoId: empleado.id, fecha: fechaSql(body.dia) }, select: { localId: true } });

  const fichaje = await db.fichaje.create({
    data: {
      empleadoId: empleado.id,
      localId: turno?.localId ?? empleado.localId,
      tipo: body.tipo as Tipo,
      timestamp,
      corregido: true,
    },
  });

  await auditar({
    entidad: "Fichaje",
    entidadId: fichaje.id,
    accion: "CREAR",
    autorId: session.empleadoId!,
    despues: { tipo: fichaje.tipo, timestamp: fichaje.timestamp.toISOString() },
    motivo: `Cargado por el encargado: ${motivo}`,
  });

  return NextResponse.json({ ok: true, id: fichaje.id });
}
