import { NextResponse } from "next/server";
import type { SectorNegocio } from "@prisma/client";
import { db } from "@/lib/db";
import { fechaSql } from "@/lib/fechaAR";
import { rangoDias } from "@/lib/periodo";
import { requireAdminApi } from "@/lib/session";
import { definicionDe, PROMOS } from "@/lib/compras/promos";
import {
  claveProducto,
  margenPorSector,
  sectorDe,
  sinClasificar,
  type FilaProducto,
  type Sector,
} from "@/lib/compras/sectores";

/** Agrupa 800+ productos por sector; es cálculo en memoria sobre una consulta. */
export const maxDuration = 60;

const SECTORES_ASIGNABLES: SectorNegocio[] = ["HELADOS", "CAFETERIA", "CHOCOLATERIA", "PROMOCION"];

async function cargarOverrides(): Promise<Map<string, Sector>> {
  const filas = await db.sectorProducto.findMany({ select: { producto: true, sector: true } });
  return new Map(filas.map((f) => [f.producto, f.sector as Sector]));
}

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const localId = params.get("localId");
  const { desde, hasta, dias } = rangoDias(params);

  const [prods, prodsPorLocal, compras, overrides, locales] = await Promise.all([
    db.productoDiario.groupBy({
      by: ["producto", "categoria"],
      where: {
        fecha: { gte: fechaSql(desde), lte: fechaSql(hasta) },
        ...(localId ? { localId } : {}),
      },
      _sum: { facturacion: true, cantidad: true },
    }),
    db.productoDiario.groupBy({
      by: ["producto", "categoria", "localId"],
      where: {
        fecha: { gte: fechaSql(desde), lte: fechaSql(hasta) },
        ...(localId ? { localId } : {}),
      },
      _sum: { facturacion: true, cantidad: true },
    }),
    // Sólo mercadería: el royalty es un servicio y no puede entrar al costo.
    db.compraItem.findMany({
      where: {
        compra: {
          tipo: "MERCADERIA",
          fecha: { gte: fechaSql(desde), lte: fechaSql(hasta) },
          ...(localId ? { localId } : { localId: { not: null } }),
        },
      },
      select: { detalle: true, totalConAjuste: true, compra: { select: { localId: true } } },
    }),
    cargarOverrides(),
    db.local.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  // SÓLO se compara contra los locales que tienen remitos. Sin esto, la venta
  // de las cuatro sucursales se medía contra las compras de una sola y el
  // margen daba 94%: un número que no existe y que nadie va a poder defender.
  const conCompras = new Set(compras.map((c) => c.compra.localId).filter((id): id is string => Boolean(id)));
  const nombresConCompras = locales.filter((l) => conCompras.has(l.id)).map((l) => l.nombre);

  const filas: FilaProducto[] = prods.map((p) => ({
    producto: p.producto,
    categoria: p.categoria,
    facturacion: p._sum.facturacion ?? 0,
    cantidad: p._sum.cantidad ?? 0,
  }));

  const lineasCompra = compras.map((c) => ({ detalle: c.detalle, total: c.totalConAjuste }));

  // El mix se calcula sobre TODA la venta; el margen, sólo sobre los locales
  // que tienen remitos. Son dos preguntas distintas y mezclarlas fue el bug.
  const { sectores: mix, total, cobertura, promosRepartidas, promosSupuestas } = margenPorSector(
    filas,
    [],
    overrides
  );
  const comparables: FilaProducto[] = prodsPorLocal
    .filter((p) => conCompras.has(p.localId))
    .map((p) => ({
      producto: p.producto,
      categoria: p.categoria,
      facturacion: p._sum.facturacion ?? 0,
      cantidad: p._sum.cantidad ?? 0,
    }));
  const conMargen = margenPorSector(comparables, lineasCompra, overrides);
  const totalCompra = conMargen.totalCompra;
  const compraSinClasificar = conMargen.compraSinClasificar;
  const sectores = mix.map((s) => {
    const m = conMargen.sectores.find((x) => x.sector === s.sector);
    return { ...s, ventaComparable: m?.facturacion ?? 0, compra: m?.compra ?? 0, margen: m?.margen ?? 0, margenPct: m?.margenPct ?? null, costoPct: m?.costoPct ?? null };
  });

  // Las promos que todavía no tienen composición declarada: es la lista de
  // trabajo que falta para cerrar la cobertura.
  const promosSinDefinir = filas
    .filter((f) => sectorDe(f.producto, f.categoria, overrides) === "PROMOCION" && !definicionDe(f.producto))
    .sort((a, b) => b.facturacion - a.facturacion)
    .slice(0, 20)
    .map((f) => ({ producto: f.producto, facturacion: f.facturacion }));

  // Los más grandes de cada sector, que es lo que permite verificar de un
  // vistazo si la clasificación tiene sentido antes de creerle a los totales.
  const porSector = new Map<Sector, FilaProducto[]>();
  for (const fila of filas) {
    const sector = sectorDe(fila.producto, fila.categoria, overrides);
    porSector.set(sector, [...(porSector.get(sector) ?? []), fila]);
  }
  const ejemplos = Object.fromEntries(
    [...porSector].map(([sector, lista]) => [
      sector,
      lista
        .sort((a, b) => b.facturacion - a.facturacion)
        .slice(0, 8)
        .map((f) => ({ producto: f.producto, facturacion: f.facturacion })),
    ])
  );

  return NextResponse.json({
    desde,
    hasta,
    dias,
    localId: localId ?? "",
    locales,
    total,
    cobertura,
    totalCompra,
    compraSinClasificar,
    ventaComparable: conMargen.total,
    localesConMargen: nombresConCompras,
    promosRepartidas,
    promosSupuestas,
    promosSinDefinir,
    promosDefinidas: PROMOS.map((p) => ({
      nombre: p.nombre,
      contenido: p.contenido,
      base: p.base,
      reparto: p.reparto,
    })),
    sectores,
    ejemplos,
    overrides: overrides.size,
    sinClasificar: sinClasificar(filas, overrides)
      .slice(0, 60)
      .map((f) => ({
        producto: f.producto,
        categoria: f.categoria,
        facturacion: f.facturacion,
        cantidad: f.cantidad,
      })),
  });
}

/** Asigna a mano el sector de un producto que las reglas no supieron leer. */
export async function PATCH(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const cuerpo = await request.json().catch(() => null);
  const producto = typeof cuerpo?.producto === "string" ? claveProducto(cuerpo.producto) : "";
  const sector = cuerpo?.sector as SectorNegocio | undefined;
  if (!producto) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });

  // Sin sector se borra la excepción: es la forma de volver a lo que digan las
  // reglas si alguien se equivocó al asignar.
  if (!sector) {
    await db.sectorProducto.deleteMany({ where: { producto } });
    return NextResponse.json({ ok: true, borrado: true });
  }
  if (!SECTORES_ASIGNABLES.includes(sector)) {
    return NextResponse.json({ error: `Sector inválido: ${sector}` }, { status: 400 });
  }

  await db.sectorProducto.upsert({
    where: { producto },
    create: { producto, sector },
    update: { sector },
  });
  return NextResponse.json({ ok: true });
}
