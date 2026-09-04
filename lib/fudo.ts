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
  porMozo: { nombreFudo: string; cantidadVentas: number; totalVentas: number }[];
};

/** Agrega ventas cerradas para el panel "Ventas y mozos": personas atendidas
 * (sólo se carga en las EAT-IN, viene null en TAKEAWAY/DELIVERY) y un
 * desglose por mozo — sólo cuenta las ventas donde Fudo registró quién
 * atendió, que en la práctica es una minoría. */
export function resumirVentas(ventas: VentaJson[], usuarios: UsuarioJson[]): ResumenVentas {
  const nombrePorId = new Map(usuarios.map((u) => [u.id, u.attributes.name]));
  const porMozoId = new Map<string, { nombreFudo: string; cantidadVentas: number; totalVentas: number }>();

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
    const acc = porMozoId.get(mozoId) ?? { nombreFudo, cantidadVentas: 0, totalVentas: 0 };
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
