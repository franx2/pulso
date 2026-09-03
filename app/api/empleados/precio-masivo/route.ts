import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

export async function PATCH(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await readJsonBody<{ empleadoIds: string[]; precioHora: number }>(request);
  if (!body?.empleadoIds?.length || !(Number(body.precioHora) >= 0)) {
    return NextResponse.json({ error: "Elegí al menos un empleado y un precio válido" }, { status: 400 });
  }

  const { count } = await db.empleado.updateMany({
    where: { id: { in: body.empleadoIds } },
    data: { precioHora: body.precioHora },
  });

  return NextResponse.json({ actualizados: count });
}
