import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmpleadoApi, alMenos } from "@/lib/session";
import { readJsonBody } from "@/lib/http";
import { auditar } from "@/lib/auditoria";

const TIPOS_CORRECCION = ["AGREGAR", "MODIFICAR", "ELIMINAR"] as const;
const TIPOS_FICHAJE = ["ENTRADA", "SALIDA", "DESCANSO_INICIO", "DESCANSO_FIN"] as const;

export async function GET(request: Request) {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const soloPendientes = new URL(request.url).searchParams.get("pendientes") === "1";
  const esEncargado = alMenos(session.rol, "ENCARGADO");

  const correcciones = await db.solicitudCorreccion.findMany({
    where: {
      // El empleado sólo ve las suyas; el encargado, las de todos.
      ...(esEncargado ? {} : { empleadoId: session.empleadoId }),
      ...(soloPendientes ? { estado: "PENDIENTE" as const } : {}),
    },
    include: {
      empleado: { select: { nombre: true } },
      fichaje: { select: { tipo: true, timestamp: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ correcciones });
}

export async function POST(request: Request) {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{
    tipo: string;
    fichajeId?: string;
    tipoFichaje?: string;
    fechaHora?: string;
    motivo: string;
  }>(request);

  if (!body?.motivo?.trim()) {
    return NextResponse.json({ error: "Contá qué pasó para que el encargado pueda evaluarlo" }, { status: 400 });
  }
  if (!(TIPOS_CORRECCION as readonly string[]).includes(body.tipo)) {
    return NextResponse.json({ error: "Tipo de corrección inválido" }, { status: 400 });
  }
  const tipo = body.tipo as (typeof TIPOS_CORRECCION)[number];

  if (tipo !== "ELIMINAR") {
    if (!body.fechaHora || Number.isNaN(new Date(body.fechaHora).getTime())) {
      return NextResponse.json({ error: "Indicá la fecha y hora correcta" }, { status: 400 });
    }
    if (!(TIPOS_FICHAJE as readonly string[]).includes(body.tipoFichaje ?? "")) {
      return NextResponse.json({ error: "Indicá si es entrada, salida o descanso" }, { status: 400 });
    }
  }
  if (tipo !== "AGREGAR" && !body.fichajeId) {
    return NextResponse.json({ error: "Falta indicar qué fichaje corregir" }, { status: 400 });
  }

  // Nadie puede pedir correcciones sobre fichajes ajenos.
  if (body.fichajeId) {
    const fichaje = await db.fichaje.findUnique({ where: { id: body.fichajeId } });
    if (!fichaje || fichaje.empleadoId !== session.empleadoId) {
      return NextResponse.json({ error: "Ese fichaje no es tuyo" }, { status: 403 });
    }
  }

  const solicitud = await db.solicitudCorreccion.create({
    data: {
      empleadoId: session.empleadoId!,
      fichajeId: body.fichajeId ?? null,
      tipo,
      tipoFichaje: tipo === "ELIMINAR" ? null : (body.tipoFichaje as (typeof TIPOS_FICHAJE)[number]),
      fechaHora: tipo === "ELIMINAR" ? null : new Date(body.fechaHora!),
      motivo: body.motivo.trim(),
    },
  });

  await auditar({
    entidad: "SolicitudCorreccion",
    entidadId: solicitud.id,
    accion: "CREAR",
    autorId: session.empleadoId!,
    despues: { tipo, fechaHora: body.fechaHora ?? null, tipoFichaje: body.tipoFichaje ?? null },
    motivo: body.motivo.trim(),
  });

  return NextResponse.json({ solicitud });
}
