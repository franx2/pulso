import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { obtenerResumenVentas, obtenerTokenFudo } from "@/lib/fudo";
import { desdeISO, finDelDia } from "@/lib/fechas";

/** Ventas y mozos de una sucursal (personas atendidas + desglose por mozo),
 * leído en vivo de Fudo. El mozo se vincula al empleado de Pulso por nombre
 * (no hay otro ID en común) — si no matchea a nadie, se muestra igual con el
 * nombre que vino de Fudo. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const local = await db.local.findUnique({ where: { id } });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
  if (!local.fudoApiKey || !local.fudoApiSecret) {
    return NextResponse.json({ error: "Este local no tiene Fudo configurado" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const desdeParam = searchParams.get("desde");
  const hastaParam = searchParams.get("hasta");
  const desde = desdeParam ? desdeISO(desdeParam) : new Date(Date.now() - 6 * 86400000);
  const hasta = hastaParam ? finDelDia(desdeISO(hastaParam)) : finDelDia();

  try {
    const token = await obtenerTokenFudo(local.fudoApiKey, local.fudoApiSecret);
    const resumen = await obtenerResumenVentas(token, desde, hasta);

    const empleados = await db.empleado.findMany({
      where: { localId: id },
      select: { id: true, nombre: true },
    });
    const empleadoPorNombre = new Map(empleados.map((e) => [e.nombre.trim().toLowerCase(), e]));

    return NextResponse.json({
      ...resumen,
      porMozo: resumen.porMozo.map((m) => ({
        ...m,
        empleadoId: empleadoPorNombre.get(m.nombreFudo.trim().toLowerCase())?.id ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo consultar Fudo" },
      { status: 502 }
    );
  }
}
