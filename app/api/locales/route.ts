import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hoyAR } from "@/lib/fechaAR";
import { requireAdminApi, requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

export async function GET() {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const locales = await db.local.findMany({
    orderBy: { nombre: "asc" },
    include: {
      _count: { select: { empleados: true, horarios: true, categorias: true } },
    },
    // Nunca salen del servidor: sólo se informa si están cargadas.
    omit: { fudoApiKey: true, fudoApiSecret: true },
  });

  // La lista dice qué le falta a cada sucursal. Sin esto había que entrar a
  // las cuatro para descubrir cuál era la que no tenía compras.
  const mes = hoyAR().slice(0, 7);
  const conCostos = new Set(
    (
      await db.costoFijo.findMany({
        where: { mes, monto: { gt: 0 } },
        select: { localId: true },
        distinct: ["localId"],
      })
    ).map((c) => c.localId)
  );
  const conFudo = new Set(
    (
      await db.local.findMany({
        // Las dos, no una: con media credencial no se sincroniza nada.
        where: { fudoApiKey: { not: null }, fudoApiSecret: { not: null } },
        select: { id: true },
      })
    ).map((l) => l.id)
  );

  return NextResponse.json({
    locales: locales.map((local) => ({
      ...local,
      estado: {
        ubicacion: local.lat != null && local.lng != null,
        fudo: conFudo.has(local.id),
        horario: local._count.horarios > 0,
        categorias: local._count.categorias > 0,
        compras: Boolean(local.cuitCompras || local.razonSocialCompras),
        costos: conCostos.has(local.id),
        mes,
      },
    })),
  });
}

export async function POST(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await readJsonBody<{ nombre: string }>(request);
  if (!body?.nombre?.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const local = await db.local.create({ data: { nombre: body.nombre.trim() } });
  return NextResponse.json({ local });
}
