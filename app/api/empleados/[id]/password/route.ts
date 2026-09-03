import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { generarPasswordTemporal, hashPassword } from "@/lib/password";

/** Le pone (o renueva) una contraseña a un empleado, además de su passkey. Se
 * genera al azar y se devuelve una sola vez: nadie más la vuelve a ver. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const objetivo = await db.empleado.findUnique({ where: { id } });
  if (!objetivo) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

  const password = generarPasswordTemporal();
  await db.empleado.update({ where: { id }, data: { passwordHash: hashPassword(password) } });

  return NextResponse.json({ password });
}
