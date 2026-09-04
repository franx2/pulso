import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/session";
import { sincronizarResumenLocal } from "@/lib/fudoResumen";

/** Sync manual del resumen diario que alimenta el dashboard. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const dias = Number(new URL(request.url).searchParams.get("dias")) || 90;

  try {
    const resultado = await sincronizarResumenLocal(id, Math.min(Math.max(dias, 1), 400));
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo sincronizar" },
      { status: 502 }
    );
  }
}
