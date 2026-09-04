import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/session";
import { sincronizarDemandaLocal } from "@/lib/fudoSync";

/** Sync manual: el admin lo dispara desde Ajustes en vez de esperar al cron. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  try {
    const resultado = await sincronizarDemandaLocal(id);
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo sincronizar" },
      { status: 502 }
    );
  }
}
