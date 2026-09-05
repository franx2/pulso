import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";
import { matrizDesdeCapacidad } from "@/lib/forecast/dotacion";

/** Configuración del modelo: lo que el sistema aprendió, lo que asumió por
 * defecto y lo que un humano fijó a mano. Es la pantalla del punto 12: poder
 * ver cómo está pensando el modelo y corregirlo. */
export async function GET() {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const [locales, coeficientes, canales, capacidades, ajustes, clima] = await Promise.all([
    db.local.findMany({ select: { id: true, nombre: true, tipoLocal: true }, orderBy: { nombre: "asc" } }),
    db.coeficienteSector.findMany({ orderBy: [{ categoria: "asc" }, { sector: "asc" }] }),
    db.coeficienteCanal.findMany({ orderBy: [{ canal: "asc" }, { sector: "asc" }] }),
    db.capacidadSector.findMany({ include: { local: { select: { nombre: true } } } }),
    db.ajusteK.findMany({ include: { local: { select: { nombre: true } } }, orderBy: { fecha: "asc" } }),
    db.sensibilidadClima.findMany(),
  ]);

  return NextResponse.json({
    locales,
    coeficientes,
    canales,
    capacidades: capacidades.map((c) => ({
      ...c,
      local: c.local.nombre,
      matriz: matrizDesdeCapacidad({
        capacidadPorEmpleado: c.capacidadPorEmpleado,
        minPersonas: c.minPersonas,
        maxPersonas: c.maxPersonas,
      }),
    })),
    ajustes: ajustes.map((a) => ({
      id: a.id,
      local: a.local?.nombre ?? "Todos",
      localId: a.localId,
      diaSemana: a.diaSemana,
      fecha: a.fecha?.toISOString().slice(0, 10) ?? null,
      slot: a.slot,
      valor: a.valor,
      motivo: a.motivo,
    })),
    clima,
  });
}

/** Fija un valor a mano. Lo manual siempre gana sobre lo aprendido y sobre
 * el default, y queda marcado como tal para que se note en la pantalla. */
export async function PATCH(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await readJsonBody<{
    tipo: "coeficiente" | "capacidad" | "ajusteK" | "borrarAjusteK";
    id?: string;
    valor?: number;
    minPersonas?: number;
    maxPersonas?: number;
    localId?: string | null;
    diaSemana?: number | null;
    fecha?: string | null;
    motivo?: string | null;
  }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  if (body.tipo === "coeficiente" && body.id && typeof body.valor === "number") {
    if (body.valor < 0) return NextResponse.json({ error: "El coeficiente no puede ser negativo" }, { status: 400 });
    await db.coeficienteSector.update({
      where: { id: body.id },
      data: { coeficiente: body.valor, origen: "MANUAL" },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.tipo === "capacidad" && body.id) {
    if (body.valor != null && body.valor <= 0) {
      return NextResponse.json({ error: "La capacidad tiene que ser mayor a cero" }, { status: 400 });
    }
    await db.capacidadSector.update({
      where: { id: body.id },
      data: {
        ...(body.valor != null ? { capacidadPorEmpleado: body.valor } : {}),
        ...(body.minPersonas != null ? { minPersonas: body.minPersonas } : {}),
        ...(body.maxPersonas != null ? { maxPersonas: body.maxPersonas } : {}),
        origen: "MANUAL",
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.tipo === "ajusteK" && typeof body.valor === "number") {
    if (body.valor <= 0 || body.valor > 5) {
      return NextResponse.json({ error: "El factor tiene que estar entre 0 y 5" }, { status: 400 });
    }
    const creado = await db.ajusteK.create({
      data: {
        localId: body.localId || null,
        diaSemana: body.diaSemana ?? null,
        fecha: body.fecha ? new Date(`${body.fecha}T00:00:00.000Z`) : null,
        valor: body.valor,
        motivo: body.motivo || null,
      },
    });
    return NextResponse.json({ ok: true, id: creado.id });
  }

  if (body.tipo === "borrarAjusteK" && body.id) {
    await db.ajusteK.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Operación no reconocida" }, { status: 400 });
}
