import { NextResponse } from "next/server";
import type { SectorNegocio } from "@prisma/client";
import { db } from "@/lib/db";
import { fechaSql, hoyAR, sumarDias } from "@/lib/fechaAR";
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
  const dias = Math.min(Math.max(Number(params.get("dias")) || 30, 7), 400);
  const localId = params.get("localId");
  const hasta = hoyAR();
  const desde = sumarDias(hasta, -(dias - 1));

  const [prods, compras, overrides, locales] = await Promise.all([
    db.productoDiario.groupBy({
      by: ["producto", "categoria"],
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
      select: { detalle: true, totalConAjuste: true },
    }),
    cargarOverrides(),
    db.local.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  const filas: FilaProducto[] = prods.map((p) => ({
    producto: p.producto,
    categoria: p.categoria,
    facturacion: p._sum.facturacion ?? 0,
    cantidad: p._sum.cantidad ?? 0,
  }));

  const { sectores, total, totalCompra, cobertura, promosRepartidas, promosSupuestas, compraSinClasificar } =
    margenPorSector(
      filas,
      compras.map((c) => ({ detalle: c.detalle, total: c.totalConAjuste })),
      overrides
    );

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
    // Con qué locales se pudo comparar venta contra compra: los que no tienen
    // remitos cargados muestran mix pero no margen.
    localesConCompras: [...new Set(compras.map(() => 1))].length > 0,
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
