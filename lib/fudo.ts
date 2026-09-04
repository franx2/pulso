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
 * Todas las ventas cerradas creadas en [desde, hasta), paginando hasta
 * agotar los resultados. `desde`/`hasta` van en ISO UTC.
 */
export async function obtenerVentasCerradas(
  token: string,
  desde: Date,
  hasta: Date
): Promise<{ createdAt: string }[]> {
  const filtroFecha = `and(gte.${desde.toISOString()},lt.${hasta.toISOString()})`;
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
