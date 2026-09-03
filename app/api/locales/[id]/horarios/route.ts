import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi, requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

const DIAS = [0, 1, 2, 3, 4, 5, 6]; // 0 = domingo … 6 = sábado, como Date.getDay()

/** Trae los 7 días; si el local nunca los configuró, los crea con un horario por defecto. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id: localId } = await params;
  let horarios = await db.horarioLocal.findMany({ where: { localId }, orderBy: { diaSemana: "asc" } });

  if (horarios.length < 7) {
    const existentes = new Set(horarios.map((h) => h.diaSemana));
    const faltantes = DIAS.filter((d) => !existentes.has(d));
    await db.horarioLocal.createMany({
      data: faltantes.map((diaSemana) => ({ localId, diaSemana, abre: "09:00", cierra: "23:00" })),
      skipDuplicates: true,
    });
    horarios = await db.horarioLocal.findMany({ where: { localId }, orderBy: { diaSemana: "asc" } });
  }

  return NextResponse.json({ horarios });
}

/** Reemplaza los 7 días de una sola vez. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id: localId } = await params;
  const body = await readJsonBody<{
    dias: { diaSemana: number; cerrado: boolean; abre: string | null; cierra: string | null }[];
  }>(request);

  if (!body?.dias || body.dias.length !== 7) {
    return NextResponse.json({ error: "Faltan días de la semana" }, { status: 400 });
  }
  for (const d of body.dias) {
    if (!DIAS.includes(d.diaSemana)) {
      return NextResponse.json({ error: "Día de la semana inválido" }, { status: 400 });
    }
    if (!d.cerrado && (!d.abre || !d.cierra)) {
      return NextResponse.json(
        { error: "Un día abierto necesita hora de apertura y cierre" },
        { status: 400 }
      );
    }
  }

  await db.$transaction(
    body.dias.map((d) =>
      db.horarioLocal.upsert({
        where: { localId_diaSemana: { localId, diaSemana: d.diaSemana } },
        update: { cerrado: d.cerrado, abre: d.cerrado ? null : d.abre, cierra: d.cerrado ? null : d.cierra },
        create: {
          localId,
          diaSemana: d.diaSemana,
          cerrado: d.cerrado,
          abre: d.cerrado ? null : d.abre,
          cierra: d.cerrado ? null : d.cierra,
        },
      })
    )
  );

  const horarios = await db.horarioLocal.findMany({ where: { localId }, orderBy: { diaSemana: "asc" } });
  return NextResponse.json({ horarios });
}
