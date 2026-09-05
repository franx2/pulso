import { db } from "@/lib/db";
import { FudoError, obtenerTokenFudo } from "@/lib/fudo";
import { categoriaCanonica } from "./categorias";
import { slotDesdeISO } from "./slots";

/**
 * Construye la serie de 30 minutos desde Fudo (punto 21.4).
 *
 * Reutiliza el mismo recorrido de `/sales` que ya usa el resumen diario
 * (una pasada con items.product incluido), pero en vez de agregar por día
 * agrega por franja, que es la granularidad que el forecast necesita y que
 * ninguna tabla existente tiene.
 */

const API_URL = "https://api.fu.do/v1alpha1";
const TAMANO_PAGINA = 100;
const MAX_PAGINAS = 400;
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

type Acumulador = {
  tickets: number;
  unidades: number;
  ventas: number;
  personas: number;
  porCanal: Record<string, number>;
  porCategoria: Record<string, number>;
};

const vacio = (): Acumulador => ({
  tickets: 0,
  unidades: 0,
  ventas: 0,
  personas: 0,
  porCanal: {},
  porCategoria: {},
});

export async function construirDatasetLocal(
  localId: string,
  dias = 90
): Promise<{ slots: number; ventas: number; dias: number }> {
  const local = await db.local.findUnique({ where: { id: localId } });
  if (!local) throw new FudoError("Local no encontrado");
  if (!local.fudoApiKey || !local.fudoApiSecret) {
    throw new FudoError("Este local no tiene Fudo configurado");
  }

  const token = await obtenerTokenFudo(local.fudoApiKey, local.fudoApiSecret);
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86400000);

  // clave "fecha|slot"
  const buckets = new Map<string, Acumulador>();
  const items = new Map<string, { cantidad: number; canceled: boolean | null; productoId?: string }>();
  const categoriaDeProducto = new Map<string, string>();
  let ventasLeidas = 0;
  let pagina = 1;

  // Catálogo de categorías, para resolver el nombre de cada producto.
  const resCat = await fetch(`${API_URL}/product-categories?page[size]=200&fields[productCategory]=name`, { headers });
  const catPorId = new Map<string, string>();
  if (resCat.ok) {
    const d = await resCat.json();
    for (const c of (d.data ?? []) as { id: string; attributes: { name: string } }[]) {
      catPorId.set(c.id, c.attributes.name);
    }
  }

  for (;;) {
    const params = new URLSearchParams({
      "filter[createdAt]": `and(gte.${iso(desde)},lte.${iso(hasta)})`,
      "filter[saleState]": "in.(CLOSED)",
      "fields[sale]": "createdAt,total,people,saleType,items",
      include: "items.product",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
      sort: "id",
    });
    const res = await fetch(`${API_URL}/sales?${params}`, { headers });
    if (!res.ok) throw new FudoError(`Fudo devolvió un error al listar ventas (HTTP ${res.status})`);
    const data = await res.json();

    for (const inc of (data.included ?? []) as {
      type: string;
      id: string;
      attributes: Record<string, unknown>;
      relationships?: Record<string, { data?: { id: string } | null }>;
    }[]) {
      if (inc.type === "Item") {
        items.set(inc.id, {
          cantidad: Number(inc.attributes.quantity ?? 0),
          canceled: (inc.attributes.canceled as boolean | null) ?? null,
          productoId: inc.relationships?.product?.data?.id,
        });
      } else if (inc.type === "Product") {
        const catId = inc.relationships?.productCategory?.data?.id;
        categoriaDeProducto.set(inc.id, categoriaCanonica(catId ? catPorId.get(catId) : null));
      }
    }

    const lote = (data.data ?? []) as {
      attributes: { createdAt: string; total: number; people: number | null; saleType: string | null };
      relationships?: { items?: { data?: { id: string }[] } };
    }[];

    for (const venta of lote) {
      ventasLeidas++;
      const { dia, slot } = slotDesdeISO(venta.attributes.createdAt);
      const clave = `${dia}|${slot}`;
      const acc = buckets.get(clave) ?? vacio();

      acc.tickets++;
      acc.ventas += venta.attributes.total ?? 0;
      acc.personas += venta.attributes.people ?? 0;
      const canal = venta.attributes.saleType ?? "SIN-CANAL";
      acc.porCanal[canal] = (acc.porCanal[canal] ?? 0) + 1;

      for (const ref of venta.relationships?.items?.data ?? []) {
        const item = items.get(ref.id);
        if (!item || item.canceled) continue;
        acc.unidades += item.cantidad;
        const cat = item.productoId ? (categoriaDeProducto.get(item.productoId) ?? "otros") : "otros";
        acc.porCategoria[cat] = (acc.porCategoria[cat] ?? 0) + item.cantidad;
      }

      buckets.set(clave, acc);
    }

    if (lote.length < TAMANO_PAGINA) break;
    pagina++;
    if (pagina > MAX_PAGINAS) break;
  }

  // Se reemplaza la ventana entera: más simple y más barato que hacer un
  // upsert por franja, y evita dejar franjas viejas de una carga anterior.
  const fechas = new Set([...buckets.keys()].map((k) => k.split("|")[0]));
  await db.demandaSlot.deleteMany({
    where: { localId, fecha: { gte: new Date(`${[...fechas].sort()[0]}T00:00:00.000Z`) } },
  });
  await db.demandaSlot.createMany({
    data: [...buckets.entries()].map(([clave, a]) => {
      const [fecha, slot] = clave.split("|");
      return {
        localId,
        fecha: new Date(`${fecha}T00:00:00.000Z`),
        slot: Number(slot),
        tickets: a.tickets,
        unidades: a.unidades,
        ventas: a.ventas,
        personas: a.personas,
        porCanal: a.porCanal,
        porCategoria: a.porCategoria,
      };
    }),
    skipDuplicates: true,
  });

  return { slots: buckets.size, ventas: ventasLeidas, dias: fechas.size };
}

export async function construirDatasetTodos(dias = 90) {
  const locales = await db.local.findMany({ where: { fudoApiKey: { not: null } } });
  const out: { local: string; ok: boolean; detalle: string }[] = [];
  for (const l of locales) {
    try {
      const r = await construirDatasetLocal(l.id, dias);
      out.push({ local: l.nombre, ok: true, detalle: `${r.dias} días, ${r.slots} franjas, ${r.ventas} ventas` });
    } catch (e) {
      out.push({ local: l.nombre, ok: false, detalle: e instanceof Error ? e.message : "error" });
    }
  }
  return out;
}
