import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diaDeFechaSql, fechaSql, hoyAR, sumarDias } from "@/lib/fechaAR";
import { requireAdminApi } from "@/lib/session";
import { controlarRoyalty, mesDelRoyalty } from "@/lib/compras/royalty";

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const dias = Math.min(Math.max(Number(params.get("dias")) || 90, 7), 730);
  const desde = sumarDias(hoyAR(), -(dias - 1));

  const [compras, locales] = await Promise.all([
    db.compra.findMany({
      where: { fecha: { gte: fechaSql(desde) } },
      orderBy: [{ fecha: "desc" }, { numero: "desc" }],
      include: {
        local: { select: { nombre: true } },
        items: { orderBy: { totalConAjuste: "desc" } },
      },
    }),
    db.local.findMany({
      select: { id: true, nombre: true, cuitCompras: true, razonSocialCompras: true },
      orderBy: { nombre: "asc" },
    }),
  ]);

  // El royalty se controla contra las ventas del mes que el remito declara,
  // no contra su fecha de emisión: llega antes de que el mes termine.
  const servicios = compras.filter((c) => c.tipo === "SERVICIO" && c.localId);
  const controles = [];
  for (const remito of servicios) {
    const { mes, origen } = mesDelRoyalty(remito.observaciones, diaDeFechaSql(remito.fecha));
    const [anio, numeroMes] = mes.split("-").map(Number);
    const filas = await db.resumenDiario.findMany({
      where: {
        localId: remito.localId!,
        fecha: { gte: fechaSql(`${mes}-01`), lt: new Date(Date.UTC(anio, numeroMes, 1)) },
      },
      select: { fecha: true, ventas: true },
    });
    if (filas.length === 0) continue;
    controles.push({
      compraId: remito.id,
      local: remito.local?.nombre ?? null,
      numero: remito.numero,
      ...controlarRoyalty({
        mes,
        origenMes: origen,
        ventaConIva: filas.reduce((s, f) => s + f.ventas, 0),
        cobrado: remito.sumaLineas,
        diasConDatos: filas.length,
      }),
    });
  }

  const mercaderia = compras.filter((c) => c.tipo === "MERCADERIA");
  const porLocal = new Map<string, { local: string; mercaderia: number; servicios: number; remitos: number }>();
  for (const compra of compras) {
    const clave = compra.local?.nombre ?? "Sin asignar";
    const acumulado = porLocal.get(clave) ?? { local: clave, mercaderia: 0, servicios: 0, remitos: 0 };
    if (compra.tipo === "MERCADERIA") acumulado.mercaderia += compra.subtotal;
    else acumulado.servicios += compra.subtotal;
    acumulado.remitos++;
    porLocal.set(clave, acumulado);
  }

  return NextResponse.json({
    desde,
    hasta: hoyAR(),
    resumen: {
      remitos: compras.length,
      mercaderia: mercaderia.reduce((s, c) => s + c.subtotal, 0),
      servicios: compras.filter((c) => c.tipo === "SERVICIO").reduce((s, c) => s + c.subtotal, 0),
      sinAsignar: compras.filter((c) => !c.localId).length,
      conProblemas: compras.filter((c) => c.problemas.length > 0).length,
    },
    porLocal: [...porLocal.values()].sort((a, b) => b.mercaderia - a.mercaderia),
    controles,
    locales,
    compras: compras.map((compra) => ({
      id: compra.id,
      numero: compra.numero,
      fecha: diaDeFechaSql(compra.fecha),
      local: compra.local?.nombre ?? null,
      localId: compra.localId,
      cliente: compra.cliente,
      cuit: compra.cuit,
      tipo: compra.tipo,
      observaciones: compra.observaciones,
      sumaLineas: compra.sumaLineas,
      ajustePct: compra.ajustePct,
      subtotal: compra.subtotal,
      problemas: compra.problemas,
      origen: compra.origen,
      items: compra.items.map((item) => ({
        codigo: item.codigo,
        detalle: item.detalle,
        cantidad: item.cantidad,
        unidad: item.unidad,
        precioUnitario: item.precioUnitario,
        total: item.total,
        totalConAjuste: item.totalConAjuste,
      })),
    })),
  });
}

/** Asignar a mano un remito que el sistema no pudo atribuir. */
export async function PATCH(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const cuerpo = await request.json().catch(() => null);
  const compraId = typeof cuerpo?.compraId === "string" ? cuerpo.compraId : null;
  const localId = typeof cuerpo?.localId === "string" ? cuerpo.localId : null;
  if (!compraId || !localId) return NextResponse.json({ error: "Falta compraId o localId" }, { status: 400 });

  const compra = await db.compra.findUnique({ where: { id: compraId }, select: { cuit: true, cliente: true } });
  if (!compra) return NextResponse.json({ error: "No existe ese remito" }, { status: 404 });

  await db.compra.update({
    where: { id: compraId },
    data: {
      localId,
      problemas: [],
      verificado: true,
    },
  });

  // Se aprende del ajuste manual: el próximo remito de ese cliente ya cae
  // solo. Sin esto habría que asignar a mano todos los meses.
  if (cuerpo?.recordar !== false) {
    await db.local.update({
      where: { id: localId },
      data: { cuitCompras: compra.cuit, razonSocialCompras: compra.cliente },
    });
  }

  return NextResponse.json({ ok: true });
}
