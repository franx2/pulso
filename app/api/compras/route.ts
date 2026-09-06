import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diaDeFechaSql, fechaSql, hoyAR, sumarDias } from "@/lib/fechaAR";
import { requireAdminApi } from "@/lib/session";
import {
  REGLAS_HELADO,
  esHeladoComprado,
  resumirHelado,
  type CompraHelado,
  type VentaHelado,
} from "@/lib/compras/consumoHelado";
import { controlarRoyalty, mesDelRoyalty } from "@/lib/compras/royalty";

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const dias = Math.min(Math.max(Number(params.get("dias")) || 90, 7), 730);
  const desde = sumarDias(hoyAR(), -(dias - 1));
  const hasta = hoyAR();

  const [compras, locales, ventasHelado, diasConVentas] = await Promise.all([
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
    db.productoDiario.findMany({
      where: {
        fecha: { gte: fechaSql(desde), lte: fechaSql(hasta) },
        OR: [
          { producto: { contains: "HELADO", mode: "insensitive" } },
          { producto: { contains: "CUCURUCHO", mode: "insensitive" } },
          { producto: { contains: "BOCHA", mode: "insensitive" } },
        ],
      },
      select: { localId: true, fecha: true, producto: true, cantidad: true },
    }),
    db.resumenDiario.findMany({
      where: { fecha: { gte: fechaSql(desde), lte: fechaSql(hasta) } },
      select: { localId: true, fecha: true },
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
      localId: remito.localId,
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
  const porLocal = new Map(
    locales.map((local) => [
      local.id,
      { localId: local.id, local: local.nombre, mercaderia: 0, servicios: 0, remitos: 0, conProblemas: 0 },
    ])
  );
  for (const compra of compras) {
    if (!compra.localId) continue;
    const acumulado = porLocal.get(compra.localId);
    if (!acumulado) continue;
    if (compra.tipo === "MERCADERIA") acumulado.mercaderia += compra.subtotal;
    else acumulado.servicios += compra.subtotal;
    acumulado.remitos++;
    if (compra.problemas.length > 0) acumulado.conProblemas++;
  }

  const comprasHeladoPorLocal = new Map<string, (CompraHelado & { fecha: string })[]>();
  for (const compra of compras) {
    if (!compra.localId || compra.tipo !== "MERCADERIA" || !compra.verificado) continue;
    const entradas = comprasHeladoPorLocal.get(compra.localId) ?? [];
    for (const item of compra.items) {
      if (!esHeladoComprado(item.detalle)) continue;
      entradas.push({
        fecha: diaDeFechaSql(compra.fecha),
        detalle: item.detalle,
        cantidadKg: item.cantidadExacta,
        costo: item.totalConAjuste,
      });
    }
    comprasHeladoPorLocal.set(compra.localId, entradas);
  }

  const ventasHeladoPorLocal = new Map<string, (VentaHelado & { fecha: string })[]>();
  for (const venta of ventasHelado) {
    const filas = ventasHeladoPorLocal.get(venta.localId) ?? [];
    filas.push({ fecha: diaDeFechaSql(venta.fecha), producto: venta.producto, cantidad: venta.cantidad });
    ventasHeladoPorLocal.set(venta.localId, filas);
  }

  const diasVentaPorLocal = new Map<string, string[]>();
  for (const fila of diasConVentas) {
    const fechas = diasVentaPorLocal.get(fila.localId) ?? [];
    fechas.push(diaDeFechaSql(fila.fecha));
    diasVentaPorLocal.set(fila.localId, fechas);
  }

  const ventasComparablesPorLocal = new Map<string, VentaHelado[]>();
  const controlHeladoPorLocal = locales.map((local) => {
    const entradas = comprasHeladoPorLocal.get(local.id) ?? [];
    const desdeComparacion = entradas.length > 0 ? entradas.map((entrada) => entrada.fecha).sort()[0] : null;
    const ventasComparables = desdeComparacion
      ? (ventasHeladoPorLocal.get(local.id) ?? []).filter((venta) => venta.fecha >= desdeComparacion)
      : [];
    ventasComparablesPorLocal.set(local.id, ventasComparables);
    return {
      localId: local.id,
      local: local.nombre,
      desdeComparacion,
      hastaComparacion: desdeComparacion ? hasta : null,
      diasConVentas: desdeComparacion
        ? (diasVentaPorLocal.get(local.id) ?? []).filter((fecha) => fecha >= desdeComparacion).length
        : 0,
      ...resumirHelado(entradas, ventasComparables),
    };
  });
  const localesConCompras = controlHeladoPorLocal.filter((local) => local.desdeComparacion != null);
  const controlHeladoTotal = resumirHelado(
    [...comprasHeladoPorLocal.values()].flat(),
    [...ventasComparablesPorLocal.values()].flat()
  );

  return NextResponse.json({
    dias,
    desde,
    hasta,
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
    helado: {
      reglas: REGLAS_HELADO.map((regla) => ({ id: regla.id, etiqueta: regla.etiqueta, gramos: regla.gramos })),
      total: {
        ...controlHeladoTotal,
        desdeComparacion:
          localesConCompras.length > 0
            ? localesConCompras.map((local) => local.desdeComparacion!).sort()[0]
            : null,
        hastaComparacion: localesConCompras.length > 0 ? hasta : null,
        diasConVentas: localesConCompras.reduce((suma, local) => suma + local.diasConVentas, 0),
        localesConCompras: localesConCompras.length,
      },
      porLocal: controlHeladoPorLocal,
    },
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
      verificado: compra.verificado,
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
