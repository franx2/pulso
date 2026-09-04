import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi, requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

/** Nunca se devuelve el apiKey/apiSecret al cliente: sólo si están cargados. */
async function tieneCredencialesFudo(localId: string): Promise<boolean> {
  const local = await db.local.findUnique({
    where: { id: localId },
    select: { fudoApiKey: true, fudoApiSecret: true },
  });
  return Boolean(local?.fudoApiKey && local?.fudoApiSecret);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const local = await db.local.findUnique({
    where: { id },
    omit: { fudoApiKey: true, fudoApiSecret: true },
  });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });

  return NextResponse.json({
    local: { ...local, fudoConfigurado: await tieneCredencialesFudo(id) },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody<{
    nombre?: string;
    lat?: number | null;
    lng?: number | null;
    radioMetros?: number;
    descuentaDescanso?: boolean;
    toleranciaMin?: number;
    topeSemanalHoras?: number;
    verificarRostro?: boolean;
    rostroTolerancia?: number;
    multiplicadorFeriado?: number;
    fudoApiKey?: string;
    fudoApiSecret?: string;
  }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  if (body.nombre !== undefined && !body.nombre.trim()) {
    return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
  }
  if (body.radioMetros !== undefined && body.radioMetros < 10) {
    return NextResponse.json({ error: "El radio debe ser de al menos 10 metros" }, { status: 400 });
  }
  if (body.toleranciaMin !== undefined && (body.toleranciaMin < 0 || body.toleranciaMin > 120)) {
    return NextResponse.json({ error: "La tolerancia debe estar entre 0 y 120 minutos" }, { status: 400 });
  }
  if (body.topeSemanalHoras !== undefined && body.topeSemanalHoras <= 0) {
    return NextResponse.json({ error: "El tope semanal debe ser mayor a cero" }, { status: 400 });
  }
  if (
    body.rostroTolerancia !== undefined &&
    (body.rostroTolerancia < 0.3 || body.rostroTolerancia > 0.8)
  ) {
    return NextResponse.json(
      { error: "La tolerancia del rostro debe estar entre 0.30 y 0.80" },
      { status: 400 }
    );
  }
  if (body.multiplicadorFeriado !== undefined && body.multiplicadorFeriado < 1) {
    return NextResponse.json({ error: "El multiplicador debe ser al menos 1" }, { status: 400 });
  }

  await db.local.update({
    where: { id },
    data: {
      ...(body.nombre !== undefined ? { nombre: body.nombre.trim() } : {}),
      ...(body.lat !== undefined ? { lat: body.lat } : {}),
      ...(body.lng !== undefined ? { lng: body.lng } : {}),
      ...(body.radioMetros !== undefined ? { radioMetros: body.radioMetros } : {}),
      ...(body.descuentaDescanso !== undefined ? { descuentaDescanso: body.descuentaDescanso } : {}),
      ...(body.toleranciaMin !== undefined ? { toleranciaMin: body.toleranciaMin } : {}),
      ...(body.topeSemanalHoras !== undefined ? { topeSemanalHoras: body.topeSemanalHoras } : {}),
      ...(body.verificarRostro !== undefined ? { verificarRostro: body.verificarRostro } : {}),
      ...(body.rostroTolerancia !== undefined ? { rostroTolerancia: body.rostroTolerancia } : {}),
      ...(body.multiplicadorFeriado !== undefined
        ? { multiplicadorFeriado: body.multiplicadorFeriado }
        : {}),
      ...(body.fudoApiKey !== undefined ? { fudoApiKey: body.fudoApiKey.trim() || null } : {}),
      ...(body.fudoApiSecret !== undefined ? { fudoApiSecret: body.fudoApiSecret.trim() || null } : {}),
    },
  });

  const local = await db.local.findUniqueOrThrow({
    where: { id },
    omit: { fudoApiKey: true, fudoApiSecret: true },
  });

  return NextResponse.json({
    local: { ...local, fudoConfigurado: await tieneCredencialesFudo(id) },
  });
}
