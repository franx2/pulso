import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmpleadoApi, alMenos } from "@/lib/session";
import { readJsonBody } from "@/lib/http";
import { auditar } from "@/lib/auditoria";
import { comoFechaSql } from "@/lib/fechas";
import { leerDataUrl } from "@/lib/dataUrl";

const TIPOS = ["VACACIONES", "ENFERMEDAD", "FRANCO", "LICENCIA", "FALTA", "OTRO"] as const;

export async function GET(request: Request) {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const soloPendientes = new URL(request.url).searchParams.get("pendientes") === "1";
  const esEncargado = alMenos(session.rol, "ENCARGADO");

  const ausencias = await db.ausencia.findMany({
    where: {
      ...(esEncargado ? {} : { empleadoId: session.empleadoId }),
      ...(soloPendientes ? { estado: "PENDIENTE" as const } : {}),
    },
    // `certificado` se omite a propósito: son megabytes que no van en un listado.
    select: {
      id: true,
      tipo: true,
      desde: true,
      hasta: true,
      motivo: true,
      estado: true,
      comentario: true,
      certificadoTipo: true,
      createdAt: true,
      empleado: { select: { nombre: true } },
    },
    orderBy: { desde: "desc" },
    take: 100,
  });

  return NextResponse.json({ ausencias });
}

export async function POST(request: Request) {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{
    tipo: string;
    desde: string;
    hasta: string;
    motivo?: string;
    /** data URL de la foto ya achicada en el navegador. */
    certificado?: string;
  }>(request);

  if (!body || !(TIPOS as readonly string[]).includes(body.tipo)) {
    return NextResponse.json({ error: "Elegí un tipo de ausencia válido" }, { status: 400 });
  }

  const desde = new Date(body.desde + "T00:00:00");
  const hasta = new Date(body.hasta + "T00:00:00");
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
  }
  if (hasta < desde) {
    return NextResponse.json({ error: "La fecha de fin no puede ser anterior al inicio" }, { status: 400 });
  }

  let certificado: Uint8Array<ArrayBuffer> | null = null;
  let certificadoTipo: string | null = null;
  if (body.certificado) {
    const imagen = leerDataUrl(body.certificado);
    if (!imagen) {
      return NextResponse.json(
        { error: "El certificado tiene que ser una imagen JPG, PNG o WEBP de hasta 2 MB" },
        { status: 400 }
      );
    }
    certificado = imagen.datos;
    certificadoTipo = imagen.tipo;
  }

  const ausencia = await db.ausencia.create({
    data: {
      empleadoId: session.empleadoId!,
      tipo: body.tipo as (typeof TIPOS)[number],
      desde: comoFechaSql(desde),
      hasta: comoFechaSql(hasta),
      motivo: body.motivo?.trim() || null,
      certificado,
      certificadoTipo,
    },
  });

  await auditar({
    entidad: "Ausencia",
    entidadId: ausencia.id,
    accion: "CREAR",
    autorId: session.empleadoId!,
    despues: { tipo: body.tipo, desde: body.desde, hasta: body.hasta },
    motivo: body.motivo?.trim(),
  });

  return NextResponse.json({ ausencia: { id: ausencia.id } });
}

