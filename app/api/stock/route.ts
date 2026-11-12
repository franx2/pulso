import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diaDeFechaSql, fechaSql, hoyAR, sumarDias } from "@/lib/fechaAR";
import { requireAdminApi } from "@/lib/session";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Estado de la serie de stock y los movimientos que no explican las ventas.
 * Mientras nadie cargue las compras en Fudo, un movimiento positivo suele ser
 * mercadería que entró y uno negativo, faltante o ajuste a mano.
 *
 * Respeta el mismo alcance que el resto de la pantalla (`desde`, `hasta`,
 * `localId`): antes devolvía siempre los últimos 7 días de todos los locales y
 * el cliente filtraba el local por nombre, así que con un mes elegido arriba
 * esta tabla seguía hablando de otra semana. Sin parámetros mantiene el
 * comportamiento de siempre (últimos 7 días). */
export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const hoy = hoyAR();
  const pedidoHasta = params.get("hasta") ?? "";
  const pedidoDesde = params.get("desde") ?? "";
  const hasta = DIA.test(pedidoHasta) ? pedidoHasta : hoy;
  const desde = DIA.test(pedidoDesde) ? pedidoDesde : sumarDias(hasta, -7);
  const localId = params.get("localId") ?? "";

  const [filas, locales] = await Promise.all([
    db.stockDiario.findMany({
      where: {
        fecha: { gte: fechaSql(desde), lte: fechaSql(hasta) },
        ...(localId ? { localId } : {}),
      },
      orderBy: { fecha: "desc" },
    }),
    db.local.findMany({ select: { id: true, nombre: true } }),
  ]);

  const nombreLocal = new Map(locales.map((l) => [l.id, l.nombre]));
  const fechas = new Set(filas.map((f) => diaDeFechaSql(f.fecha)));

  const movimientos = filas
    .filter((f) => f.movimientoNoExplicado != null && Math.abs(f.movimientoNoExplicado) > 0.001)
    .sort((a, b) => Math.abs(b.movimientoNoExplicado!) - Math.abs(a.movimientoNoExplicado!))
    .slice(0, 20)
    .map((f) => ({
      fecha: diaDeFechaSql(f.fecha),
      local: nombreLocal.get(f.localId) ?? "—",
      producto: f.producto,
      stock: f.stock,
      vendido: f.vendido,
      movimiento: f.movimientoNoExplicado!,
    }));

  return NextResponse.json({
    desde,
    hasta,
    diasEnSerie: fechas.size,
    productosSeguidos: new Set(filas.map((f) => f.fudoProductoId)).size,
    movimientos,
  });
}
