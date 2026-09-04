import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";

/** Estado de la serie de stock y los movimientos que no explican las ventas.
 * Mientras nadie cargue las compras en Fudo, un movimiento positivo suele ser
 * mercadería que entró y uno negativo, faltante o ajuste a mano. */
export async function GET() {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const desdeHace7 = new Date();
  desdeHace7.setUTCDate(desdeHace7.getUTCDate() - 7);

  const [filas, locales] = await Promise.all([
    db.stockDiario.findMany({
      where: { fecha: { gte: new Date(desdeHace7.toISOString().slice(0, 10)) } },
      orderBy: { fecha: "desc" },
    }),
    db.local.findMany({ select: { id: true, nombre: true } }),
  ]);

  const nombreLocal = new Map(locales.map((l) => [l.id, l.nombre]));
  const fechas = new Set(filas.map((f) => f.fecha.toISOString().slice(0, 10)));

  const movimientos = filas
    .filter((f) => f.movimientoNoExplicado != null && Math.abs(f.movimientoNoExplicado) > 0.001)
    .sort((a, b) => Math.abs(b.movimientoNoExplicado!) - Math.abs(a.movimientoNoExplicado!))
    .slice(0, 20)
    .map((f) => ({
      fecha: f.fecha.toISOString().slice(0, 10),
      local: nombreLocal.get(f.localId) ?? "—",
      producto: f.producto,
      stock: f.stock,
      vendido: f.vendido,
      movimiento: f.movimientoNoExplicado!,
    }));

  return NextResponse.json({
    diasEnSerie: fechas.size,
    productosSeguidos: new Set(filas.map((f) => f.fudoProductoId)).size,
    movimientos,
  });
}
