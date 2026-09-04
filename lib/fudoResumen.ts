import { db } from "@/lib/db";
import { FudoError, obtenerCajas, obtenerTokenFudo } from "@/lib/fudo";
import {
  agregarPorDia,
  claveDiaAR,
  type CajaCruda,
  type CategoriaCruda,
  type DescuentoCrudo,
  type FilaResumen,
  type ItemCrudo,
  type MedioPagoCrudo,
  type PagoCrudo,
  type ProductoCrudo,
  type VentaCruda,
} from "@/lib/resumenDiario";

const API_URL = "https://api.fu.do/v1alpha1";
const TAMANO_PAGINA = 100;
/** 90 días son ~19 páginas por local: pesado pero tolerable en un cron. */
const MAX_PAGINAS = 400;

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

type Incluido = { type: string; id: string; attributes: Record<string, unknown> };

/**
 * Una sola pasada por /sales trae todo lo que necesita el dashboard: la
 * venta (total, personas, canal), sus items con el producto y su categoría y
 * costo, los pagos con su medio, y los descuentos. Pedir cada cosa por
 * separado multiplicaría por cuatro las llamadas.
 */
async function traerVentasConDetalle(token: string, desde: Date, hasta: Date) {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const ventas: VentaCruda[] = [];
  const items = new Map<string, ItemCrudo>();
  const productos = new Map<string, ProductoCrudo>();
  const pagos = new Map<string, PagoCrudo>();
  const mediosPago = new Map<string, MedioPagoCrudo>();
  const descuentos = new Map<string, DescuentoCrudo>();
  let pagina = 1;

  for (;;) {
    const params = new URLSearchParams({
      "filter[createdAt]": `and(gte.${iso(desde)},lte.${iso(hasta)})`,
      "filter[saleState]": "in.(CLOSED)",
      "fields[sale]": "createdAt,total,people,saleType,items,payments,discounts,cashRegister",
      include: "items.product,payments.paymentMethod,discounts",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
      sort: "id",
    });
    const res = await fetch(`${API_URL}/sales?${params}`, { headers });
    if (!res.ok) throw new FudoError(`Fudo devolvió un error al listar ventas (HTTP ${res.status})`);
    const data = await res.json();
    const lote = (data.data ?? []) as VentaCruda[];
    ventas.push(...lote);
    for (const inc of (data.included ?? []) as Incluido[]) {
      if (inc.type === "Item") items.set(inc.id, inc as unknown as ItemCrudo);
      else if (inc.type === "Product") productos.set(inc.id, inc as unknown as ProductoCrudo);
      else if (inc.type === "Payment") pagos.set(inc.id, inc as unknown as PagoCrudo);
      else if (inc.type === "PaymentMethod") mediosPago.set(inc.id, inc as unknown as MedioPagoCrudo);
      else if (inc.type === "Discount") descuentos.set(inc.id, inc as unknown as DescuentoCrudo);
    }

    if (lote.length < TAMANO_PAGINA) break;
    pagina++;
    if (pagina > MAX_PAGINAS) break;
  }

  return { ventas, items, productos, pagos, mediosPago, descuentos };
}

/** Las categorías son un catálogo chico: se traen enteras una vez. */
async function traerCategorias(token: string): Promise<CategoriaCruda[]> {
  const res = await fetch(`${API_URL}/product-categories?page[size]=200&fields[productCategory]=name`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data ?? []) as CategoriaCruda[];
}

/** Ventas anuladas por día: no entran en la facturación, pero el dueño las
 * quiere ver — es el otro lado del control junto con los descuentos. */
async function traerAnulacionesPorDia(token: string, desde: Date, hasta: Date): Promise<Map<string, number>> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const porDia = new Map<string, number>();
  let pagina = 1;

  for (;;) {
    const params = new URLSearchParams({
      "filter[createdAt]": `and(gte.${iso(desde)},lte.${iso(hasta)})`,
      "filter[saleState]": "in.(CANCELED)",
      "fields[sale]": "createdAt,total",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
      sort: "id",
    });
    const res = await fetch(`${API_URL}/sales?${params}`, { headers });
    if (!res.ok) break;
    const data = await res.json();
    const lote = (data.data ?? []) as { attributes: { createdAt: string; total: number } }[];
    for (const v of lote) {
      const dia = claveDiaAR(v.attributes.createdAt);
      porDia.set(dia, (porDia.get(dia) ?? 0) + (v.attributes.total ?? 0));
    }
    if (lote.length < TAMANO_PAGINA) break;
    pagina++;
    if (pagina > MAX_PAGINAS) break;
  }

  return porDia;
}

/** Gastos del local por día (proveedores, servicios, retiros de caja). */
async function traerGastosPorDia(token: string, desde: Date, hasta: Date): Promise<Map<string, number>> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const porDia = new Map<string, number>();
  let pagina = 1;

  for (;;) {
    const params = new URLSearchParams({
      "filter[createdAt]": `and(gte.${iso(desde)},lte.${iso(hasta)})`,
      "filter[canceled]": "neq.true",
      "fields[expense]": "amount,createdAt,canceled",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
    });
    const res = await fetch(`${API_URL}/expenses?${params}`, { headers });
    if (!res.ok) break;
    const data = await res.json();
    const lote = (data.data ?? []) as { attributes: { createdAt: string; amount: number } }[];
    for (const g of lote) {
      const dia = claveDiaAR(g.attributes.createdAt);
      porDia.set(dia, (porDia.get(dia) ?? 0) + (g.attributes.amount ?? 0));
    }
    if (lote.length < TAMANO_PAGINA) break;
    pagina++;
    if (pagina > MAX_PAGINAS) break;
  }

  return porDia;
}

/** `@db.Date` guarda medianoche UTC: el día calendario va sin zona horaria. */
function fechaSql(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

export async function sincronizarResumenLocal(
  localId: string,
  dias = 90
): Promise<{ diasProcesados: number; ventas: number }> {
  const local = await db.local.findUnique({ where: { id: localId } });
  if (!local) throw new FudoError("Local no encontrado");
  if (!local.fudoApiKey || !local.fudoApiSecret) {
    throw new FudoError("Este local no tiene Fudo configurado");
  }

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86400000);
  const token = await obtenerTokenFudo(local.fudoApiKey, local.fudoApiSecret);

  const [detalle, categorias, cajas, anulaciones, gastos] = await Promise.all([
    traerVentasConDetalle(token, desde, hasta),
    traerCategorias(token),
    obtenerCajas(token).catch((): { id: string; nombre: string }[] => []),
    traerAnulacionesPorDia(token, desde, hasta),
    traerGastosPorDia(token, desde, hasta),
  ]);
  const cajasCrudas: CajaCruda[] = cajas.map((c) => ({ id: c.id, attributes: { name: c.nombre } }));

  const filas: FilaResumen[] = agregarPorDia({
    ventas: detalle.ventas,
    items: [...detalle.items.values()],
    productos: [...detalle.productos.values()],
    categorias,
    pagos: [...detalle.pagos.values()],
    mediosPago: [...detalle.mediosPago.values()],
    descuentos: [...detalle.descuentos.values()],
    cajas: cajasCrudas,
  });

  // Un día puede tener anulaciones o gastos sin ninguna venta cerrada: esos
  // días también tienen que quedar en la tabla, o el control no los ve.
  const dias_ = new Set([...filas.map((f) => f.fecha), ...anulaciones.keys(), ...gastos.keys()]);
  const porFecha = new Map(filas.map((f) => [f.fecha, f]));

  for (const dia of dias_) {
    const f = porFecha.get(dia);
    const datos = {
      ventas: f?.ventas ?? 0,
      tickets: f?.tickets ?? 0,
      personas: f?.personas ?? 0,
      descuentos: f?.descuentos ?? 0,
      anulaciones: anulaciones.get(dia) ?? 0,
      gastos: gastos.get(dia) ?? 0,
      costo: f?.costo ?? 0,
      costoIncompleto: f?.costoIncompleto ?? false,
      porMedioPago: f?.porMedioPago ?? {},
      porCanal: f?.porCanal ?? {},
      porCategoria: f?.porCategoria ?? {},
      descuentosPorCaja: f?.descuentosPorCaja ?? {},
      topProductos: f?.topProductos ?? [],
    };
    await db.resumenDiario.upsert({
      where: { localId_fecha: { localId, fecha: fechaSql(dia) } },
      create: { localId, fecha: fechaSql(dia), ...datos },
      update: datos,
    });
  }

  await db.local.update({ where: { id: localId }, data: { resumenSincronizadoEn: new Date() } });

  return { diasProcesados: dias_.size, ventas: detalle.ventas.length };
}

/** Todos los locales con Fudo configurado, sin cortar por el primero que falle. */
export async function sincronizarResumenTodos(dias = 90) {
  const locales = await db.local.findMany({ where: { fudoApiKey: { not: null } } });
  const resultados: { local: string; ok: boolean; detalle: string }[] = [];

  for (const l of locales) {
    try {
      const r = await sincronizarResumenLocal(l.id, dias);
      resultados.push({ local: l.nombre, ok: true, detalle: `${r.diasProcesados} días, ${r.ventas} ventas` });
    } catch (e) {
      resultados.push({ local: l.nombre, ok: false, detalle: e instanceof Error ? e.message : "error" });
    }
  }

  return resultados;
}
