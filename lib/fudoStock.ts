import { db } from "@/lib/db";
import { FudoError, obtenerTokenFudo } from "@/lib/fudo";
import { claveDiaAR } from "@/lib/resumenDiario";

const API_URL = "https://api.fu.do/v1alpha1";
const TAMANO_PAGINA = 100;
const MAX_PAGINAS = 400;

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

type ProductoStock = { id: string; nombre: string; stock: number };

/** Productos con control de stock y un valor cargado. Fudo devuelve el stock
 * de este instante y no guarda su historia: por eso hay que fotografiarlo. */
async function traerStockActual(token: string): Promise<ProductoStock[]> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const productos: ProductoStock[] = [];
  let pagina = 1;

  for (;;) {
    const params = new URLSearchParams({
      "fields[product]": "name,stock,stockControl",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
    });
    const res = await fetch(`${API_URL}/products?${params}`, { headers });
    if (!res.ok) throw new FudoError(`Fudo devolvió un error al listar productos (HTTP ${res.status})`);
    const data = await res.json();
    const lote = (data.data ?? []) as {
      id: string;
      attributes: { name: string; stock: number | null; stockControl: boolean | null };
    }[];
    for (const p of lote) {
      if (!p.attributes.stockControl || p.attributes.stock == null) continue;
      productos.push({ id: p.id, nombre: p.attributes.name, stock: p.attributes.stock });
    }
    if (lote.length < TAMANO_PAGINA) break;
    pagina++;
    if (pagina > MAX_PAGINAS) break;
  }

  return productos;
}

/** Unidades vendidas hoy por producto, contadas desde los items de las
 * ventas cerradas (acá sí importa `quantity`, no el precio). */
async function traerVendidoHoy(token: string, desde: Date, hasta: Date): Promise<Map<string, number>> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const vendido = new Map<string, number>();
  let pagina = 1;

  for (;;) {
    const params = new URLSearchParams({
      "filter[createdAt]": `and(gte.${iso(desde)},lte.${iso(hasta)})`,
      "filter[saleState]": "in.(CLOSED)",
      "fields[sale]": "createdAt,items",
      include: "items",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
      sort: "id",
    });
    const res = await fetch(`${API_URL}/sales?${params}`, { headers });
    if (!res.ok) throw new FudoError(`Fudo devolvió un error al listar ventas (HTTP ${res.status})`);
    const data = await res.json();

    for (const inc of (data.included ?? []) as {
      type: string;
      attributes: { quantity: number; canceled: boolean | null };
      relationships?: { product?: { data?: { id: string } | null } };
    }[]) {
      if (inc.type !== "Item" || inc.attributes.canceled) continue;
      const productoId = inc.relationships?.product?.data?.id;
      if (!productoId) continue;
      vendido.set(productoId, (vendido.get(productoId) ?? 0) + inc.attributes.quantity);
    }

    const lote = (data.data ?? []) as unknown[];
    if (lote.length < TAMANO_PAGINA) break;
    pagina++;
    if (pagina > MAX_PAGINAS) break;
  }

  return vendido;
}

function fechaSql(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

/**
 * Guarda la foto de stock de hoy y la compara contra la de ayer.
 *
 * Conviene correrlo a una hora fija (después del cierre): el stock que
 * devuelve Fudo es el de este instante, así que dos corridas a horas
 * distintas no son comparables entre sí.
 */
export async function snapshotStockLocal(
  localId: string
): Promise<{ productos: number; conMovimientoNoExplicado: number }> {
  const local = await db.local.findUnique({ where: { id: localId } });
  if (!local) throw new FudoError("Local no encontrado");
  if (!local.fudoApiKey || !local.fudoApiSecret) {
    throw new FudoError("Este local no tiene Fudo configurado");
  }

  const token = await obtenerTokenFudo(local.fudoApiKey, local.fudoApiSecret);
  const ahora = new Date();
  const hoy = claveDiaAR(ahora.toISOString());
  const inicioDelDiaAR = new Date(`${hoy}T03:00:00.000Z`); // 00:00 AR

  const [productos, vendido] = await Promise.all([
    traerStockActual(token),
    traerVendidoHoy(token, inicioDelDiaAR, ahora),
  ]);

  // La foto anterior es la del último día guardado, que puede no ser ayer si
  // el cron no corrió: se compara contra la que haya, no contra una fecha fija.
  const previas = await db.stockDiario.findMany({
    where: { localId, fecha: { lt: fechaSql(hoy) } },
    orderBy: { fecha: "desc" },
    take: 2000,
  });
  const previaPorProducto = new Map<string, number>();
  for (const p of previas) {
    if (!previaPorProducto.has(p.fudoProductoId)) previaPorProducto.set(p.fudoProductoId, p.stock);
  }

  let conMovimiento = 0;

  for (const p of productos) {
    const stockPrevio = previaPorProducto.get(p.id) ?? null;
    const vendidoHoy = vendido.get(p.id) ?? 0;
    // Si Fudo descontó sólo las ventas, stock + vendido == stockPrevio.
    const movimientoNoExplicado =
      stockPrevio != null ? p.stock - (stockPrevio - vendidoHoy) : null;
    if (movimientoNoExplicado != null && Math.abs(movimientoNoExplicado) > 0.001) conMovimiento++;

    const datos = {
      producto: p.nombre,
      stock: p.stock,
      stockPrevio,
      vendido: vendidoHoy,
      movimientoNoExplicado,
    };
    await db.stockDiario.upsert({
      where: { localId_fecha_fudoProductoId: { localId, fecha: fechaSql(hoy), fudoProductoId: p.id } },
      create: { localId, fecha: fechaSql(hoy), fudoProductoId: p.id, ...datos },
      update: datos,
    });
  }

  return { productos: productos.length, conMovimientoNoExplicado: conMovimiento };
}

export async function snapshotStockTodos() {
  const locales = await db.local.findMany({ where: { fudoApiKey: { not: null } } });
  const resultados: { local: string; ok: boolean; detalle: string }[] = [];

  for (const l of locales) {
    try {
      const r = await snapshotStockLocal(l.id);
      resultados.push({
        local: l.nombre,
        ok: true,
        detalle: `${r.productos} productos, ${r.conMovimientoNoExplicado} con movimiento sin explicar`,
      });
    } catch (e) {
      resultados.push({ local: l.nombre, ok: false, detalle: e instanceof Error ? e.message : "error" });
    }
  }

  return resultados;
}
