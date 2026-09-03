import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEncargadoApi } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const demanda = await db.demandaHoraria.findMany({
    where: { localId: id },
    orderBy: [{ diaSemana: "asc" }, { hora: "asc" }],
  });

  return NextResponse.json({ demanda });
}
