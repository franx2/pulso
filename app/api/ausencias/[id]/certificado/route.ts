import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmpleadoApi, alMenos } from "@/lib/session";

/** Sirve la foto del certificado. Sólo el dueño de la ausencia o un encargado. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const ausencia = await db.ausencia.findUnique({
    where: { id },
    select: { empleadoId: true, certificado: true, certificadoTipo: true },
  });

  if (!ausencia?.certificado) {
    return NextResponse.json({ error: "Sin certificado" }, { status: 404 });
  }
  if (ausencia.empleadoId !== session.empleadoId && !alMenos(session.rol, "ENCARGADO")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return new NextResponse(new Uint8Array(ausencia.certificado), {
    headers: {
      "Content-Type": ausencia.certificadoTipo ?? "image/jpeg",
      // Privado: es documentación médica, no debe quedar en caches compartidas.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
