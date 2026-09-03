import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmpleadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";
import { descriptorABytes, descriptorDesdeJson } from "@/lib/rostro";
import { auditar } from "@/lib/auditoria";
import { leerDataUrl } from "@/lib/dataUrl";

/** Estado del rostro del empleado que está logueado. */
export async function GET() {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const [empleado, local] = await Promise.all([
    db.empleado.findUnique({
      where: { id: session.empleadoId! },
      select: { rostroRegistradoEn: true, consentimientoBiometrico: true, localId: true },
    }),
    db.local.findUnique({
      where: { id: session.localId! },
      select: { verificarRostro: true },
    }),
  ]);

  return NextResponse.json({
    registrado: Boolean(empleado?.rostroRegistradoEn),
    consintio: Boolean(empleado?.consentimientoBiometrico),
    exigido: Boolean(local?.verificarRostro),
  });
}

/** Alta o actualización del rostro propio. */
export async function POST(request: Request) {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{ descriptor: unknown; foto?: string; consiente?: boolean }>(request);

  // El consentimiento explícito es requisito para tratar un dato biométrico.
  if (!body?.consiente) {
    return NextResponse.json(
      { error: "Necesitamos tu consentimiento para registrar tu rostro" },
      { status: 400 }
    );
  }

  const descriptor = descriptorDesdeJson(body.descriptor);
  if (!descriptor) {
    return NextResponse.json({ error: "No se pudo leer el rostro, probá de nuevo" }, { status: 400 });
  }

  const foto = body.foto ? leerDataUrl(body.foto) : null;
  if (body.foto && !foto) {
    return NextResponse.json({ error: "La foto no es válida" }, { status: 400 });
  }

  await db.empleado.update({
    where: { id: session.empleadoId! },
    data: {
      rostroDescriptor: descriptorABytes(descriptor),
      rostroFoto: foto?.datos ?? null,
      rostroFotoTipo: foto?.tipo ?? null,
      rostroRegistradoEn: new Date(),
      consentimientoBiometrico: new Date(),
    },
  });

  await auditar({
    entidad: "Empleado",
    entidadId: session.empleadoId!,
    accion: "MODIFICAR",
    autorId: session.empleadoId!,
    despues: { rostroRegistrado: true, consintio: true },
    motivo: "Alta de rostro para fichaje",
  });

  return NextResponse.json({ ok: true });
}
