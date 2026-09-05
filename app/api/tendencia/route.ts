import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/session";
import { tendenciaDeVentas } from "@/lib/forecast/tendencia";

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const semanas = Math.min(Number(new URL(request.url).searchParams.get("semanas")) || 26, 60);
  return NextResponse.json({ tendencias: await tendenciaDeVentas({ semanas }) });
}
