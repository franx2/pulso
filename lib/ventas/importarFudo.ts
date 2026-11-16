import type { FormaMesa, Prisma, TamanoMesa, TipoMedioPago } from "@prisma/client";
import { db } from "@/lib/db";
import { obtenerTokenFudo } from "@/lib/fudo";

/**
 * Trae de Fudo lo que hace falta para vender en un local: salones, mesas,
 * cocinas, categorías, productos con su precio, medios de pago y roles con
 * sus permisos. Sólo LEE de Fudo. Se puede correr las veces que haga falta:
 * cada cosa se identifica por su id de Fudo y se actualiza en vez de
 * duplicarse. Lo que se cargó a mano en Pulso (sin id de Fudo) no se toca.
 */

const API = "https://api.fu.do/v1alpha1";
const PAGINA = 500;

type Recurso = { id: string; attributes: Record<string, unknown>; relationships?: Record<string, { data?: { id: string } | null }> };

async function todos(token: string, ruta: string): Promise<Recurso[]> {
  const salida: Recurso[] = [];
  for (let pagina = 1; ; pagina++) {
    const sep = ruta.includes("?") ? "&" : "?";
    const res = await fetch(`${API}${ruta}${sep}page[size]=${PAGINA}&page[number]=${pagina}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Fudo respondió ${res.status} al leer ${ruta}`);
    const datos = ((await res.json()).data ?? []) as Recurso[];
    salida.push(...datos);
    if (datos.length < PAGINA) return salida;
  }
}

const rel = (r: Recurso, nombre: string) => r.relationships?.[nombre]?.data?.id ?? null;
const num = (id: string | null) => (id == null ? null : Number(id));
const texto = (v: unknown) => (typeof v === "string" ? v : "");

/** Fudo no expone el tipo del medio de pago en esta versión: se deduce del nombre. */
export function tipoDeMedio(nombre: string): TipoMedioPago {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (/PEDIDOS ?YA|UBER|RAPPI/.test(n)) return "APP_DELIVERY";
  if (/EFECTIVO|CASH/.test(n)) return "EFECTIVO";
  if (/DEBITO/.test(n)) return "DEBITO";
  if (/CREDITO/.test(n)) return "CREDITO";
  if (/\bQR\b|MERCADO ?PAGO/.test(n)) return "QR";
  if (/TRANSFER/.test(n)) return "TRANSFERENCIA";
  if (/CTA|CUENTA CORRIENTE/.test(n)) return "CUENTA_CORRIENTE";
  return "OTRO";
}

/** Lo que más se usa en el salón, primero; los medios de las apps de delivery, al final. */
const PRIORIDAD_MEDIO: Record<TipoMedioPago, number> = {
  EFECTIVO: 0,
  DEBITO: 1,
  CREDITO: 2,
  QR: 3,
  TRANSFERENCIA: 4,
  CUENTA_CORRIENTE: 5,
  OTRO: 6,
  APP_DELIVERY: 9,
};

export function ordenarMedios<T extends { tipo: TipoMedioPago }>(medios: T[]): T[] {
  return [...medios].sort((a, b) => PRIORIDAD_MEDIO[a.tipo] - PRIORIDAD_MEDIO[b.tipo]);
}

export type ResultadoImportacion = Record<
  "salones" | "mesas" | "cocinas" | "categorias" | "productos" | "productosSinCambios" | "mediosPago" | "roles",
  number
>;

export async function importarDeFudo(localId: string): Promise<ResultadoImportacion> {
  const local = await db.local.findUnique({ where: { id: localId }, select: { fudoApiKey: true, fudoApiSecret: true } });
  if (!local?.fudoApiKey || !local.fudoApiSecret) throw new Error("Este local no tiene cargadas las claves de Fudo");
  const token = await obtenerTokenFudo(local.fudoApiKey, local.fudoApiSecret);

  const [rooms, tables, kitchens, categorias, productos, medios, roles] = await Promise.all([
    todos(token, "/rooms"),
    todos(token, "/tables"),
    todos(token, "/kitchens"),
    todos(token, "/product-categories"),
    todos(token, "/products"),
    todos(token, "/payment-methods"),
    todos(token, "/roles"),
  ]);

  // Salones y mesas.
  const salonPorFudo = new Map<number, string>();
  for (const [k, r] of rooms.entries()) {
    const fudoId = Number(r.id);
    const s = await db.salon.upsert({
      where: { localId_fudoId: { localId, fudoId } },
      create: { localId, fudoId, nombre: texto(r.attributes.name) || `Salón ${k + 1}`, orden: k },
      update: { nombre: texto(r.attributes.name) || undefined },
    });
    salonPorFudo.set(fudoId, s.id);
  }
  let mesas = 0;
  for (const t of tables) {
    const salonId = salonPorFudo.get(num(rel(t, "room")) ?? -1);
    if (!salonId) continue;
    const datos = {
      fila: Number(t.attributes.row ?? 0),
      columna: Number(t.attributes.column ?? 0),
      // En Fudo la forma "1" es la redonda y el tamaño "l" el grande.
      forma: (String(t.attributes.shape) === "1" ? "REDONDA" : "CUADRADA") as FormaMesa,
      tamano: (t.attributes.size === "l" ? "GRANDE" : "CHICA") as TamanoMesa,
      fudoId: Number(t.id),
    };
    const numero = Number(t.attributes.number);
    await db.mesa.upsert({
      where: { salonId_numero: { salonId, numero } },
      create: { salonId, numero, ...datos },
      update: datos,
    });
    mesas++;
  }

  // Cocinas.
  const cocinaPorFudo = new Map<number, string>();
  for (const c of kitchens) {
    const fudoId = Number(c.id);
    const x = await db.cocina.upsert({
      where: { localId_fudoId: { localId, fudoId } },
      create: { localId, fudoId, nombre: texto(c.attributes.name) || "Cocina" },
      update: { nombre: texto(c.attributes.name) || undefined },
    });
    cocinaPorFudo.set(fudoId, x.id);
  }

  // Categorías: primero todas, después los padres (una puede apuntar a otra que viene más adelante).
  const categoriaPorFudo = new Map<number, string>();
  for (const c of categorias) {
    const fudoId = Number(c.id);
    const datos = {
      nombre: texto(c.attributes.name) || "Sin nombre",
      orden: Number(c.attributes.position ?? 0),
      cocinaId: cocinaPorFudo.get(num(rel(c, "kitchen")) ?? -1) ?? null,
    };
    const x = await db.categoriaVenta.upsert({
      where: { localId_fudoId: { localId, fudoId } },
      create: { localId, fudoId, ...datos },
      update: datos,
    });
    categoriaPorFudo.set(fudoId, x.id);
  }
  await db.$transaction(
    categorias.map((c) =>
      db.categoriaVenta.update({
        where: { id: categoriaPorFudo.get(Number(c.id))! },
        data: { padreId: categoriaPorFudo.get(num(rel(c, "parentCategory")) ?? -1) ?? null },
      })
    )
  );

  // Productos: son más de mil, así que van en tandas y no de a uno (de a uno
  // tardaba cinco minutos).
  const CAMPOS = ["categoriaId", "nombre", "codigo", "precio", "activo", "favorito", "orden", "cocinaId"] as const;
  const productoPorFudo = new Map(
    (
      await db.productoVenta.findMany({
        where: { localId, fudoId: { not: null } },
        select: { id: true, fudoId: true, categoriaId: true, nombre: true, codigo: true, precio: true, activo: true, favorito: true, orden: true, cocinaId: true, editadoEn: true },
      })
    ).map((p) => [p.fudoId!, p])
  );
  const nuevos: Prisma.ProductoVentaCreateManyInput[] = [];
  const cambios: { id: string; datos: Record<string, unknown> }[] = [];
  for (const p of productos) {
    const categoriaId = categoriaPorFudo.get(num(rel(p, "productCategory")) ?? -1);
    if (!categoriaId) continue;
    const fudoId = Number(p.id);
    const datos = {
      categoriaId,
      nombre: texto(p.attributes.name) || "Sin nombre",
      codigo: texto(p.attributes.code) || null,
      precio: Number(p.attributes.price ?? 0),
      activo: Boolean(p.attributes.active),
      favorito: Boolean(p.attributes.favourite),
      orden: Number(p.attributes.position ?? 0),
      cocinaId: cocinaPorFudo.get(num(rel(p, "kitchen")) ?? -1) ?? null,
    };
    const actual = productoPorFudo.get(fudoId);
    // Sólo se escribe lo que cambió: re-sincronizar una carta sin cambios no
    // toca la base.
    if (!actual) nuevos.push({ localId, fudoId, ...datos });
    // Lo que se editó en Pulso manda: Fudo ya no lo pisa.
    else if (actual.editadoEn) continue;
    else if (CAMPOS.some((c) => actual[c] !== datos[c])) cambios.push({ id: actual.id, datos });
  }
  if (nuevos.length) await db.productoVenta.createMany({ data: nuevos, skipDuplicates: true });
  for (let k = 0; k < cambios.length; k += 200) {
    await db.$transaction(cambios.slice(k, k + 200).map((c) => db.productoVenta.update({ where: { id: c.id }, data: c.datos })));
  }
  const cantidadProductos = nuevos.length + cambios.length;
  const productosSinCambios = productoPorFudo.size - cambios.length;

  // Medios de pago de venta.
  let cantidadMedios = 0;
  for (const [k, m] of medios.entries()) {
    if (m.attributes.forSales === false) continue;
    const fudoId = Number(m.id);
    const nombre = texto(m.attributes.name) || "Medio de pago";
    const datos = { nombre, tipo: tipoDeMedio(nombre), activo: m.attributes.active !== false, orden: Number(m.attributes.position ?? k) };
    await db.medioPago.upsert({
      where: { localId_fudoId: { localId, fudoId } },
      create: { localId, fudoId, ...datos },
      update: datos,
    });
    cantidadMedios++;
  }

  // Roles: son de todo el negocio, se identifican por nombre. Si ya existe uno
  // con ese nombre (importado de otro local o editado acá) no se pisa.
  let cantidadRoles = 0;
  for (const r of roles) {
    const nombre = texto(r.attributes.name);
    // Fudo a veces manda un null suelto en la lista: se descarta.
    const permisos = Array.isArray(r.attributes.permissions)
      ? (r.attributes.permissions as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (!nombre || permisos.length === 0) continue;
    const existe = await db.rolVenta.findUnique({ where: { nombre } });
    if (!existe) {
      await db.rolVenta.create({ data: { nombre, esMozo: r.attributes.isWaiter === true, permisos, fudoId: Number(r.id) } });
      cantidadRoles++;
    }
  }

  return {
    salones: rooms.length,
    mesas,
    cocinas: kitchens.length,
    categorias: categorias.length,
    productos: cantidadProductos,
    productosSinCambios,
    mediosPago: cantidadMedios,
    roles: cantidadRoles,
  };
}
