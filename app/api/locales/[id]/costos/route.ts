import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { CONCEPTOS_FIJOS } from "@/lib/compras/impuestos";

const MES = /^\d{4}-\d{2}$/;

/** Costos fijos cargados a mano para un local y un mes. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const mes = new URL(request.url).searchParams.get("mes") ?? "";
  if (!MES.test(mes)) return NextResponse.json({ error: "Mes inválido, se espera AAAA-MM" }, { status: 400 });

  const cargados = await db.costoFijo.findMany({
    where: { localId: id, mes },
    select: { concepto: true, monto: true, nota: true },
  });
  const porConcepto = new Map(cargados.map((c) => [c.concepto, c]));

  // Se devuelven siempre todos los conceptos, con cero los que faltan: la
  // pantalla tiene que mostrar qué está sin cargar, no esconderlo.
  return NextResponse.json({
    mes,
    conceptos: CONCEPTOS_FIJOS.map((concepto) => ({
      concepto,
      monto: porConcepto.get(concepto)?.monto ?? 0,
      nota: porConcepto.get(concepto)?.nota ?? null,
      cargado: porConcepto.has(concepto),
    })),
    total: cargados.reduce((s, c) => s + c.monto, 0),
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const cuerpo = await request.json().catch(() => null);
  const mes = typeof cuerpo?.mes === "string" ? cuerpo.mes : "";
  if (!MES.test(mes)) return NextResponse.json({ error: "Mes inválido, se espera AAAA-MM" }, { status: 400 });
  if (!Array.isArray(cuerpo?.conceptos)) return NextResponse.json({ error: "Faltan los conceptos" }, { status: 400 });

  for (const fila of cuerpo.conceptos as { concepto?: unknown; monto?: unknown; nota?: unknown }[]) {
    const concepto = typeof fila?.concepto === "string" ? fila.concepto : "";
    const monto = Number(fila?.monto);
    if (!concepto || !Number.isFinite(monto) || monto < 0) continue;
    const nota = typeof fila?.nota === "string" && fila.nota.trim() ? fila.nota.trim() : null;

    // Cargar cero es una respuesta válida —"este mes no hubo seguro"— pero
    // guardarla como fila haría que se vea igual que un mes sin cargar. Se
    // borra, y la pantalla lo muestra como pendiente.
    if (monto === 0) {
      await db.costoFijo.deleteMany({ where: { localId: id, mes, concepto } });
      continue;
    }
    await db.costoFijo.upsert({
      where: { localId_mes_concepto: { localId: id, mes, concepto } },
      create: { localId: id, mes, concepto, monto, nota },
      update: { monto, nota },
    });
  }

  return NextResponse.json({ ok: true });
}
