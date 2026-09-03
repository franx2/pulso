import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEncargadoApi, requireEmpleadoApi, alMenos } from "@/lib/session";
import { readJsonBody } from "@/lib/http";
import { comoFechaSql, desdeISO } from "@/lib/fechas";

export async function GET(request: Request) {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const esEncargado = alMenos(session.rol, "ENCARGADO");
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const localId = searchParams.get("localId");

  // Sin rango explícito (la lista de "próximos turnos"), se mantiene el
  // comportamiento de siempre: desde hoy en adelante, sin límite superior.
  const rangoFecha = desde
    ? { gte: comoFechaSql(desdeISO(desde)), ...(hasta ? { lte: comoFechaSql(desdeISO(hasta)) } : {}) }
    : { gte: comoFechaSql() };

  const turnos = await db.turno.findMany({
    where: {
      // `fecha` es @db.Date: medianoche UTC del día calendario.
      fecha: rangoFecha,
      ...(esEncargado ? {} : { empleadoId: session.empleadoId }),
      ...(localId ? { localId } : {}),
    },
    include: esEncargado
      ? { empleado: { select: { nombre: true } }, local: { select: { nombre: true } } }
      : undefined,
    orderBy: { inicioAt: "asc" },
  });

  return NextResponse.json({ turnos });
}

type TurnoEntrada = {
  empleadoId: string;
  localId?: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  inicioAt: string;
  finAt: string;
};

function validar(t: TurnoEntrada): string | null {
  if (!t?.empleadoId || !t.fecha || !t.horaInicio || !t.horaFin) return "Faltan datos del turno";
  const inicioAt = new Date(t.inicioAt);
  const finAt = new Date(t.finAt);
  if (Number.isNaN(inicioAt.getTime()) || Number.isNaN(finAt.getTime())) return "Horario inválido";
  if (finAt <= inicioAt) return "El turno debe terminar después de empezar";
  return null;
}

/**
 * Crea uno o varios turnos de una vez.
 *
 * Acepta el body de siempre (un turno) o `{ turnos: [...] }` para cargar un
 * mismo día a varios empleados en un solo envío, cada uno con su horario.
 */
export async function POST(request: Request) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await readJsonBody<TurnoEntrada & { turnos?: TurnoEntrada[] }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const entradas = body.turnos ?? [body];
  if (entradas.length === 0) {
    return NextResponse.json({ error: "No hay turnos para crear" }, { status: 400 });
  }

  for (const t of entradas) {
    const err = validar(t);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const empleadoIds = [...new Set(entradas.map((t) => t.empleadoId))];
  const empleados = await db.empleado.findMany({ where: { id: { in: empleadoIds } } });
  const empleadoPorId = new Map(empleados.map((e) => [e.id, e]));

  for (const t of entradas) {
    if (!empleadoPorId.has(t.empleadoId)) {
      return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
    }
  }

  const turnos = await db.$transaction(
    entradas.map((t) =>
      db.turno.create({
        data: {
          empleadoId: t.empleadoId,
          localId: t.localId || empleadoPorId.get(t.empleadoId)!.localId,
          fecha: comoFechaSql(new Date(t.fecha + "T00:00:00")),
          horaInicio: t.horaInicio,
          horaFin: t.horaFin,
          inicioAt: new Date(t.inicioAt),
          finAt: new Date(t.finAt),
        },
      })
    )
  );

  return NextResponse.json(body.turnos ? { turnos } : { turno: turnos[0] });
}
