/**
 * Cliente mínimo de la API pública de Fudo (https://dev.fu.do/api), sólo para
 * leer ventas cerradas y armar el mapa de calor de demanda. Cada sucursal es
 * una cuenta de Fudo separada, con su propio apiKey/apiSecret.
 */

const AUTH_URL = "https://auth.fu.do/api";
const API_URL = "https://api.fu.do/v1alpha1";
const TAMANO_PAGINA = 100;

export class FudoError extends Error {}

/** El token de acceso vence a las 24hs — se pide uno nuevo en cada sync. */
export async function obtenerTokenFudo(apiKey: string, apiSecret: string): Promise<string> {
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ apiKey, apiSecret }),
  });
  if (!res.ok) {
    throw new FudoError(`No se pudo autenticar con Fudo (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data.token) throw new FudoError("Fudo no devolvió un token");
  return data.token as string;
}

/**
 * Todas las ventas cerradas creadas en [desde, hasta], paginando hasta
 * agotar los resultados. `desde`/`hasta` van en ISO UTC.
 *
 * El filtro `createdAt` de Fudo sólo acepta `lte` (inclusive), a diferencia
 * de `closedAt` que acepta `lt`. El borde exacto en `hasta` no importa acá:
 * `agregarPorDiaHora` (lib/demanda.ts) vuelve a filtrar con `< hasta` antes
 * de contar, así que una venta justo en el instante límite nunca se cuenta
 * dos veces aunque Fudo la incluya.
 */
/** Fudo exige "YYYY-MM-DDTHH:MM:SSZ": Date#toISOString() siempre agrega
 * milisegundos (".123Z"), que su patrón no acepta. */
function isoSinMilisegundos(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function obtenerVentasCerradas(
  token: string,
  desde: Date,
  hasta: Date
): Promise<{ createdAt: string }[]> {
  const filtroFecha = `and(gte.${isoSinMilisegundos(desde)},lte.${isoSinMilisegundos(hasta)})`;
  const ventas: { createdAt: string }[] = [];
  let pagina = 1;

  for (;;) {
    const params = new URLSearchParams({
      "filter[createdAt]": filtroFecha,
      "filter[saleState]": "in.(CLOSED)",
      "fields[sale]": "createdAt",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
      sort: "id",
    });
    const res = await fetch(`${API_URL}/sales?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new FudoError(`Fudo devolvió un error al listar ventas (HTTP ${res.status})`);
    }
    const data = await res.json();
    const lote = (data.data ?? []) as { attributes: { createdAt: string } }[];
    for (const v of lote) ventas.push({ createdAt: v.attributes.createdAt });

    if (lote.length < TAMANO_PAGINA) break;
    pagina++;
    // Cinturón de seguridad: 90 días no deberían superar esto ni de cerca.
    if (pagina > 200) break;
  }

  return ventas;
}

type PagoJson = {
  attributes: { amount: number; canceled: boolean | null };
  relationships?: { paymentMethod?: { data?: { id: string } | null } };
};
type MetodoPagoJson = { id: string; attributes: { name: string } };

/** Fudo no expone un "es efectivo" en el filtro de pagos: hay que resolverlo
 * por nombre de método de pago contra la lista de /payment-methods de la
 * cuenta. "Efectivo Uber Eats" cuenta como caja física igual que "Efectivo". */
const NOMBRES_EFECTIVO = new Set(["Efectivo", "Efectivo Uber Eats"]);

export function sumarPagosEnEfectivo(pagos: PagoJson[], metodos: MetodoPagoJson[]): number {
  const nombrePorId = new Map(metodos.map((m) => [m.id, m.attributes.name]));
  let total = 0;
  for (const p of pagos) {
    if (p.attributes.canceled) continue;
    const metodoId = p.relationships?.paymentMethod?.data?.id;
    const nombre = metodoId ? nombrePorId.get(metodoId) : undefined;
    if (nombre && NOMBRES_EFECTIVO.has(nombre)) total += p.attributes.amount;
  }
  return total;
}

/** Efectivo cobrado en Fudo entre `desde` y `hasta` (la ventana del turno de
 * un empleado), para el arqueo de caja al fichar salida. */
export async function obtenerEfectivoCobrado(token: string, desde: Date, hasta: Date): Promise<number> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  const filtroFecha = `and(gte.${isoSinMilisegundos(desde)},lte.${isoSinMilisegundos(hasta)})`;
  const pagos: PagoJson[] = [];
  const metodosVistos = new Map<string, MetodoPagoJson>();
  let pagina = 1;

  for (;;) {
    const params = new URLSearchParams({
      "filter[paidAt]": filtroFecha,
      "fields[payment]": "amount,paidAt,canceled,paymentMethod",
      include: "paymentMethod",
      "fields[paymentMethod]": "name",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
      sort: "id",
    });
    const res = await fetch(`${API_URL}/payments?${params}`, { headers });
    if (!res.ok) {
      throw new FudoError(`Fudo devolvió un error al listar pagos (HTTP ${res.status})`);
    }
    const data = await res.json();
    const lote = (data.data ?? []) as PagoJson[];
    pagos.push(...lote);
    for (const m of (data.included ?? []) as MetodoPagoJson[]) metodosVistos.set(m.id, m);

    if (lote.length < TAMANO_PAGINA) break;
    pagina++;
    if (pagina > 200) break;
  }

  return sumarPagosEnEfectivo(pagos, [...metodosVistos.values()]);
}

type VentaJson = {
  attributes: { people: number | null; total: number };
  relationships?: { waiter?: { data?: { id: string } | null } };
};
type UsuarioJson = { id: string; attributes: { name: string } };

export type ResumenVentas = {
  cantidadVentas: number;
  totalVentas: number;
  personasAtendidas: number;
  porMozo: { fudoUsuarioId: string; nombreFudo: string; cantidadVentas: number; totalVentas: number }[];
};

/** Agrega ventas cerradas para el panel "Ventas y mozos": personas atendidas
 * (sólo se carga en las EAT-IN, viene null en TAKEAWAY/DELIVERY) y un
 * desglose por mozo — sólo cuenta las ventas donde Fudo registró quién
 * atendió, que en la práctica es una minoría. */
export function resumirVentas(ventas: VentaJson[], usuarios: UsuarioJson[]): ResumenVentas {
  const nombrePorId = new Map(usuarios.map((u) => [u.id, u.attributes.name]));
  const porMozoId = new Map<
    string,
    { fudoUsuarioId: string; nombreFudo: string; cantidadVentas: number; totalVentas: number }
  >();

  let cantidadVentas = 0;
  let totalVentas = 0;
  let personasAtendidas = 0;

  for (const v of ventas) {
    cantidadVentas++;
    totalVentas += v.attributes.total;
    if (v.attributes.people != null) personasAtendidas += v.attributes.people;

    const mozoId = v.relationships?.waiter?.data?.id;
    if (!mozoId) continue;
    const nombreFudo = nombrePorId.get(mozoId) ?? `Usuario ${mozoId}`;
    const acc = porMozoId.get(mozoId) ?? { fudoUsuarioId: mozoId, nombreFudo, cantidadVentas: 0, totalVentas: 0 };
    acc.cantidadVentas++;
    acc.totalVentas += v.attributes.total;
    porMozoId.set(mozoId, acc);
  }

  return {
    cantidadVentas,
    totalVentas,
    personasAtendidas,
    porMozo: [...porMozoId.values()].sort((a, b) => b.totalVentas - a.totalVentas),
  };
}

/** Ventas cerradas de `desde` a `hasta`, para el panel "Ventas y mozos" de
 * cada sucursal (personas atendidas + desglose por mozo). */
export async function obtenerResumenVentas(token: string, desde: Date, hasta: Date): Promise<ResumenVentas> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const filtroFecha = `and(gte.${isoSinMilisegundos(desde)},lte.${isoSinMilisegundos(hasta)})`;
  const ventas: VentaJson[] = [];
  const usuariosVistos = new Map<string, UsuarioJson>();
  let pagina = 1;

  for (;;) {
    const params = new URLSearchParams({
      "filter[createdAt]": filtroFecha,
      "filter[saleState]": "in.(CLOSED)",
      "fields[sale]": "createdAt,people,total,waiter",
      include: "waiter",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
      sort: "id",
    });
    const res = await fetch(`${API_URL}/sales?${params}`, { headers });
    if (!res.ok) {
      throw new FudoError(`Fudo devolvió un error al listar ventas (HTTP ${res.status})`);
    }
    const data = await res.json();
    const lote = (data.data ?? []) as VentaJson[];
    ventas.push(...lote);
    for (const u of (data.included ?? []) as UsuarioJson[]) usuariosVistos.set(u.id, u);

    if (lote.length < TAMANO_PAGINA) break;
    pagina++;
    if (pagina > 200) break;
  }

  return resumirVentas(ventas, [...usuariosVistos.values()]);
}

/** Las "Cajas" de la cuenta de Fudo: en este negocio cada una es una persona
 * (no un canal fijo como mesas/delivery), por eso es la fuente correcta del
 * efectivo esperado en el arqueo — a diferencia del mozo, no todas las
 * personas tienen caja propia, ni toda caja es un mozo. */
export async function obtenerCajas(token: string): Promise<{ id: string; nombre: string }[]> {
  const res = await fetch(`${API_URL}/cash-registers?page[size]=100&fields[cashRegister]=name`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new FudoError(`Fudo devolvió un error al listar cajas (HTTP ${res.status})`);
  const data = await res.json();
  return ((data.data ?? []) as { id: string; attributes: { name: string } }[]).map((c) => ({
    id: c.id,
    nombre: c.attributes.name,
  }));
}

type VentaConCajaJson = {
  relationships?: {
    cashRegister?: { data?: { id: string } | null };
    payments?: { data?: { id: string }[] };
  };
};
type PagoConIdJson = {
  id: string;
  attributes: { amount: number; canceled: boolean | null };
  relationships?: { paymentMethod?: { data?: { id: string } | null } };
};

/** Efectivo cobrado en las ventas de UNA caja puntual, entre las ventas del
 * rango dado. `/payments` no expone la caja de origen — sólo `/sales` la
 * tiene, así que acá se arma la suma desde el lado de la venta. */
export function sumarEfectivoDeCaja(
  ventas: VentaConCajaJson[],
  pagos: PagoConIdJson[],
  metodos: MetodoPagoJson[],
  cajaId: string
): number {
  const nombrePorId = new Map(metodos.map((m) => [m.id, m.attributes.name]));
  const pagoPorId = new Map(pagos.map((p) => [p.id, p]));
  let total = 0;
  for (const v of ventas) {
    if (v.relationships?.cashRegister?.data?.id !== cajaId) continue;
    for (const ref of v.relationships?.payments?.data ?? []) {
      const p = pagoPorId.get(ref.id);
      if (!p || p.attributes.canceled) continue;
      const metodoId = p.relationships?.paymentMethod?.data?.id;
      const nombre = metodoId ? nombrePorId.get(metodoId) : undefined;
      if (nombre && NOMBRES_EFECTIVO.has(nombre)) total += p.attributes.amount;
    }
  }
  return total;
}

/** Efectivo cobrado por una caja/persona puntual entre `desde` y `hasta`,
 * para el arqueo de caja al fichar salida — reemplaza a
 * `obtenerEfectivoCobrado` cuando el empleado tiene su caja de Fudo vinculada
 * (`Empleado.fudoCajaId`), porque suma sólo lo que pasó por SU caja en vez de
 * todo el efectivo del local mientras estuvo fichado. */
export async function obtenerEfectivoCobradoDeCaja(
  token: string,
  desde: Date,
  hasta: Date,
  cajaId: string
): Promise<number> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const filtroFecha = `and(gte.${isoSinMilisegundos(desde)},lte.${isoSinMilisegundos(hasta)})`;
  const ventas: VentaConCajaJson[] = [];
  const pagos: PagoConIdJson[] = [];
  const metodosVistos = new Map<string, MetodoPagoJson>();
  let pagina = 1;

  for (;;) {
    const params = new URLSearchParams({
      "filter[createdAt]": filtroFecha,
      "filter[saleState]": "in.(CLOSED)",
      "fields[sale]": "createdAt,cashRegister,payments",
      include: "cashRegister,payments.paymentMethod",
      "fields[cashRegister]": "name",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
      sort: "id",
    });
    const res = await fetch(`${API_URL}/sales?${params}`, { headers });
    if (!res.ok) {
      throw new FudoError(`Fudo devolvió un error al listar ventas (HTTP ${res.status})`);
    }
    const data = await res.json();
    ventas.push(...((data.data ?? []) as VentaConCajaJson[]));
    for (const inc of (data.included ?? []) as { type: string; id: string; attributes: Record<string, unknown> }[]) {
      if (inc.type === "Payment") pagos.push(inc as unknown as PagoConIdJson);
      else if (inc.type === "PaymentMethod") metodosVistos.set(inc.id, inc as unknown as MetodoPagoJson);
    }

    if ((data.data ?? []).length < TAMANO_PAGINA) break;
    pagina++;
    if (pagina > 200) break;
  }

  return sumarEfectivoDeCaja(ventas, pagos, [...metodosVistos.values()], cajaId);
}

type GastoJson = {
  attributes: { amount: number; canceled: boolean | null; useInCashCount?: boolean | null };
  relationships?: { paymentMethod?: { data?: { id: string } | null } };
};
type MetodoPagoConCodigoJson = { id: string; attributes: { name: string; code?: string | null } };

/** Un método de pago es efectivo si Fudo lo marca con code "cash" (más
 * confiable que el nombre, que cada local renombra a gusto); si el endpoint
 * no devuelve `code`, se cae al nombre conocido. */
function esEfectivo(metodo: MetodoPagoConCodigoJson | undefined): boolean {
  if (!metodo) return false;
  if (metodo.attributes.code) return metodo.attributes.code === "cash";
  return NOMBRES_EFECTIVO.has(metodo.attributes.name);
}

/**
 * Gastos pagados en efectivo desde una caja: plata que salió del cajón
 * (pago a un proveedor, retiro) y que por lo tanto NO tiene que estar al
 * cerrar. Sin esto, el arqueo marca faltante cada vez que alguien pagó algo
 * de la caja.
 *
 * `useInCashCount` es la marca de Fudo para "esto entra en el arqueo": si
 * viene en false se respeta y no se descuenta; si no viene, un gasto en
 * efectivo se descuenta igual, porque la plata salió del cajón igual.
 */
export function sumarGastosEnEfectivo(gastos: GastoJson[], metodos: MetodoPagoConCodigoJson[]): number {
  const metodoPorId = new Map(metodos.map((m) => [m.id, m]));
  let total = 0;
  for (const g of gastos) {
    if (g.attributes.canceled) continue;
    if (g.attributes.useInCashCount === false) continue;
    const metodoId = g.relationships?.paymentMethod?.data?.id;
    if (esEfectivo(metodoId ? metodoPorId.get(metodoId) : undefined)) total += g.attributes.amount;
  }
  return total;
}

/** Gastos en efectivo cargados a una caja entre `desde` y `hasta`. */
export async function obtenerGastosEnEfectivoDeCaja(
  token: string,
  desde: Date,
  hasta: Date,
  cajaId: string
): Promise<number> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const gastos: GastoJson[] = [];
  const metodosVistos = new Map<string, MetodoPagoConCodigoJson>();
  let pagina = 1;

  for (;;) {
    const params = new URLSearchParams({
      "filter[cashRegisterId]": `eq.${cajaId}`,
      "filter[createdAt]": `and(gte.${isoSinMilisegundos(desde)},lte.${isoSinMilisegundos(hasta)})`,
      "filter[canceled]": "neq.true",
      "fields[expense]": "amount,canceled,useInCashCount,paymentMethod,cashRegister",
      include: "paymentMethod",
      "fields[paymentMethod]": "code,name",
      "page[size]": String(TAMANO_PAGINA),
      "page[number]": String(pagina),
    });
    const res = await fetch(`${API_URL}/expenses?${params}`, { headers });
    if (!res.ok) {
      throw new FudoError(`Fudo devolvió un error al listar gastos (HTTP ${res.status})`);
    }
    const data = await res.json();
    const lote = (data.data ?? []) as GastoJson[];
    gastos.push(...lote);
    for (const m of (data.included ?? []) as MetodoPagoConCodigoJson[]) metodosVistos.set(m.id, m);

    if (lote.length < TAMANO_PAGINA) break;
    pagina++;
    if (pagina > 200) break;
  }

  return sumarGastosEnEfectivo(gastos, [...metodosVistos.values()]);
}
