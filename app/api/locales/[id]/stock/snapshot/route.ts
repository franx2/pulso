import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/session";
import { snapshotStockLocal } from "@/lib/fudoStock";

/** Foto manual del stock. Para la serie conviene el cron a hora fija. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  try {
    return NextResponse.json(await snapshotStockLocal(id));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo tomar la foto de stock" },
      { status: 502 }
    );
  }
}
