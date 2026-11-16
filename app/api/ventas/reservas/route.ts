import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { finDiaAR, hoyAR, inicioDiaAR, sumarDias } from "@/lib/fechaAR";
import { datosDeReserva, SELECT_RESERVA, aReserva } from "@/lib/ventas/reservas";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Las reservas de `dias` días a partir de `dia` (hoy, si no se dice). */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const url = new URL(request.url);
  const localId = url.searchParams.get("localId") ?? "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();
  const pedido = url.searchParams.get("dia") ?? "";
  const dia = DIA.test(pedido) ? pedido : hoyAR();
  const dias = Math.min(31, Math.max(1, Number(url.searchParams.get("dias")) || 1));

  const [reservas, mesas] = await Promise.all([
    db.reserva.findMany({
      where: { localId, fecha: { gte: inicioDiaAR(dia), lte: finDiaAR(sumarDias(dia, dias - 1)) } },
      orderBy: { fecha: "asc" },
      select: SELECT_RESERVA,
    }),
    db.mesa.findMany({
      where: { activa: true, salon: { localId } },
      orderBy: [{ salon: { orden: "asc" } }, { numero: "asc" }],
      select: { id: true, numero: true, salon: { select: { nombre: true } } },
    }),
  ]);
  return NextResponse.json({
    dia,
    reservas: reservas.map(aReserva),
    mesas: mesas.map((m) => ({ id: m.id, numero: m.numero, salon: m.salon.nombre })),
  });
}

export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_additions");
  if (prohibido) return prohibido;
  const body = await readJsonBody<Record<string, unknown>>(request);
  const localId = typeof body?.localId === "string" ? body.localId : "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();
  const r = await datosDeReserva(localId, body);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  const { fecha, personas, nombre } = r.ok;
  if (!fecha || !personas || !nombre) return NextResponse.json({ error: "Faltan el día, la hora, las personas o el nombre" }, { status: 400 });
  const reserva = await db.reserva.create({ data: { ...r.ok, fecha, personas, nombre, localId }, select: { id: true } });
  return NextResponse.json(reserva);
}
