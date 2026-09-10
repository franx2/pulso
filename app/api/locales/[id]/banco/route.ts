import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fechaSql } from "@/lib/fechaAR";
import { requireAdminApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";
import { parsearCsvBanco, ExtractoIlegible } from "@/lib/compras/banco";

/**
 * Cargar el extracto bancario de este local, desde el CSV que exporta el
 * banco. Se puede volver a subir el mismo mes sin miedo: la fila se
 * descarta si ya existe una idéntica (`localId`, fecha, saldo).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const local = await db.local.findUnique({ where: { id }, select: { id: true } });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });

  const body = await readJsonBody<{ csv?: string }>(request);
  if (!body?.csv?.trim()) return NextResponse.json({ error: "Falta el contenido del CSV" }, { status: 400 });

  let filas: ReturnType<typeof parsearCsvBanco>;
  try {
    filas = parsearCsvBanco(body.csv);
  } catch (e) {
    const mensaje = e instanceof ExtractoIlegible ? e.message : "No pudimos leer el archivo";
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
  if (filas.length === 0) {
    return NextResponse.json({ error: "El archivo no tiene ningún movimiento con monto" }, { status: 400 });
  }

  const resultado = await db.movimientoBancario.createMany({
    data: filas.map((f) => ({
      localId: id,
      fecha: fechaSql(f.fecha),
      descripcion: f.descripcion,
      referencia: f.referencia,
      categoria: f.categoria,
      credito: f.credito,
      debito: f.debito,
      saldo: f.saldo,
    })),
    skipDuplicates: true,
  });

  const porCategoria: Record<string, number> = {};
  for (const f of filas) porCategoria[f.categoria] = (porCategoria[f.categoria] ?? 0) + 1;

  return NextResponse.json({
    leidas: filas.length,
    importadas: resultado.count,
    // La diferencia entre leídas e importadas es lo que ya estaba cargado —
    // no un error, es lo esperado si se vuelve a subir el mismo extracto.
    yaCargadas: filas.length - resultado.count,
    porCategoria,
  });
}
