import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEncargadoApi } from "@/lib/session";

/** Foto del momento del fichaje. Sólo existe cuando la verificación no cerró. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const fichaje = await db.fichaje.findUnique({
    where: { id },
    select: { rostroFoto: true, rostroFotoTipo: true },
  });

  if (!fichaje?.rostroFoto) {
    return NextResponse.json({ error: "Sin foto" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(fichaje.rostroFoto), {
    headers: {
      "Content-Type": fichaje.rostroFotoTipo ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
