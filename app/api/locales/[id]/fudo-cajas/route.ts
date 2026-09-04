import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { obtenerCajas, obtenerTokenFudo } from "@/lib/fudo";

/** Las "Cajas" de Fudo de esta sucursal (cada una es una persona en esta
 * cuenta, no un canal fijo) y los empleados de Pulso disponibles para
 * vincular — para el arqueo de caja. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const local = await db.local.findUnique({ where: { id } });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
  if (!local.fudoApiKey || !local.fudoApiSecret) {
    return NextResponse.json({ error: "Este local no tiene Fudo configurado" }, { status: 400 });
  }

  try {
    const token = await obtenerTokenFudo(local.fudoApiKey, local.fudoApiSecret);
    const [cajas, empleados] = await Promise.all([
      obtenerCajas(token),
      db.empleado.findMany({ where: { localId: id }, select: { id: true, nombre: true, fudoCajaId: true } }),
    ]);
    const empleadoPorCajaId = new Map(empleados.filter((e) => e.fudoCajaId).map((e) => [e.fudoCajaId as string, e]));

    return NextResponse.json({
      cajas: cajas.map((c) => ({ ...c, empleadoId: empleadoPorCajaId.get(c.id)?.id ?? null })),
      empleadosLocal: empleados.map((e) => ({ id: e.id, nombre: e.nombre })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo consultar Fudo" },
      { status: 502 }
    );
  }
}
