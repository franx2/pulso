import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";
import {
  ETIQUETA_SECTOR,
  claveProducto,
  sectorDe,
  type Sector,
} from "@/lib/compras/sectores";

/**
 * Todo lo que el sistema clasifica, en una sola lista editable.
 *
 * Hasta ahora sólo se podía asignar un sector a lo que las reglas NO supieron
 * leer. Eso deja fuera el caso que más importa: una regla que acierta el 99%
 * de las veces y se equivoca en la restante. "COPA DEL MUNDO" cae en helados
 * porque dice "COPA", y no había forma de corregirlo — el producto no aparecía
 * en ningún lado porque ya estaba clasificado.
 *
 * La lista junta las dos fuentes a propósito. Un mismo nombre puede llegar por
 * venta (Fudo) y por compra (el remito del proveedor), y el sector es UNO
 * SOLO: se guarda contra la clave normalizada del nombre, así que corregirlo
 * de un lado lo corrige del otro. Verlos juntos es lo que hace evidente que
 * "CABRALES PRESTIGE GRANO 1KG" —que sólo se compra— es café.
 */

/** Agrupar 800+ productos de dos tablas es cálculo en memoria sobre consultas. */
export const maxDuration = 60;

const LIMITE = 400;

type Fila = {
  producto: string;
  clave: string;
  categoria: string | null;
  /** De dónde salió el nombre. Puede ser de las dos. */
  venta: number;
  compra: number;
  sector: Sector;
  etiqueta: string;
  /** `manual` = alguien lo asignó y gana sobre las reglas. */
  origen: "manual" | "regla";
};

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const busqueda = claveProducto(params.get("q") ?? "");
  const filtroSector = params.get("sector") ?? "";
  const filtroOrigen = params.get("origen") ?? "";
  const filtroFuente = params.get("fuente") ?? "";

  const [ventas, compras, overrides] = await Promise.all([
    db.productoDiario.groupBy({
      by: ["producto", "categoria"],
      _sum: { facturacion: true },
    }),
    db.compraItem.groupBy({
      by: ["detalle"],
      where: { compra: { tipo: "MERCADERIA" } },
      _sum: { totalConAjuste: true },
    }),
    db.sectorProducto.findMany({ select: { producto: true, sector: true } }),
  ]);

  const manual = new Map(overrides.map((o) => [o.producto, o.sector as Sector]));

  // Se junta por clave normalizada: "Café con leche" y "CAFE CON LECHE" son el
  // mismo producto y tienen que ser una sola fila editable, no dos.
  const porClave = new Map<string, Fila>();
  const sumar = (nombre: string, categoria: string | null, venta: number, compra: number) => {
    const clave = claveProducto(nombre);
    if (!clave) return;
    const previa = porClave.get(clave);
    if (previa) {
      previa.venta += venta;
      previa.compra += compra;
      previa.categoria ??= categoria;
      return;
    }
    const sector = sectorDe(nombre, categoria, manual);
    porClave.set(clave, {
      producto: nombre,
      clave,
      categoria,
      venta,
      compra,
      sector,
      etiqueta: ETIQUETA_SECTOR[sector],
      origen: manual.has(clave) ? "manual" : "regla",
    });
  };

  for (const v of ventas) sumar(v.producto, v.categoria, v._sum.facturacion ?? 0, 0);
  for (const c of compras) sumar(c.detalle, null, 0, c._sum.totalConAjuste ?? 0);

  let filas = [...porClave.values()];
  const total = filas.length;

  if (busqueda) filas = filas.filter((f) => f.clave.includes(busqueda));
  if (filtroSector) filas = filas.filter((f) => f.sector === filtroSector);
  if (filtroOrigen) filas = filas.filter((f) => f.origen === filtroOrigen);
  if (filtroFuente === "venta") filas = filas.filter((f) => f.venta > 0);
  if (filtroFuente === "compra") filas = filas.filter((f) => f.compra > 0);

  // Por plata movida: lo que más pesa es lo que más caro sale tener mal.
  filas.sort((a, b) => b.venta + b.compra - (a.venta + a.compra));

  return NextResponse.json({
    total,
    encontrados: filas.length,
    limite: LIMITE,
    manuales: manual.size,
    filas: filas.slice(0, LIMITE),
  });
}
