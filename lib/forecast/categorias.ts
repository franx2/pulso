/**
 * Las cuentas de Fudo de cada local nombran la misma categoría de formas
 * distintas: "1.Promociones", "PROMOCIONES", "2.Cafetería", "2.Cafeteria",
 * "CAFETERIA", "7. Heladería", "7.Heladeria". Son 110 nombres crudos para
 * ~25 conceptos reales.
 *
 * Sin unificarlos, la matriz categoría × sector tendría 110 filas duplicadas
 * y el mismo producto pesaría distinto según la sucursal, que es exactamente
 * lo que el modelo NO tiene que hacer.
 */

/** Quita acentos, prefijos de orden ("1.", "13. ") y normaliza el caso. */
export function canonizarCategoria(cruda: string | null | undefined): string {
  if (!cruda) return "sin categoria";
  return cruda
    .normalize("NFD")
    // Marcas de acento, ya separadas de su letra por NFD.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+\s*[.)-]?\s*/, "") // "1.", "13. ", "7)"
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Sinónimos que la normalización sola no junta (plurales, marcas propias).
 * Se mantiene corto a propósito: cada entrada es una decisión de negocio,
 * no una regla general.
 */
const SINONIMOS: Record<string, string> = {
  "pasteleria historica": "pasteleria",
  tartas: "pasteleria",
  "tartas y tortas": "pasteleria",
  tortas: "pasteleria",
  monoporcion: "pasteleria",
  bebidas: "bebidas y jugos",
  "bebidas alcoholicas": "bebidas y jugos",
  "productos para celiacos": "sin tacc",
  "productos aptos celiacos": "sin tacc",
  "productos sin tacc": "pasteleria",
  "cafe molido": "cafeteria",
  panninis: "panificados",
  "promos mananas": "promociones",
  cuadrados: "pasteleria",
  monoporciones: "pasteleria",
  alfajores: "pasteleria",
  tabletas: "chocolateria",
  chupetines: "chocolateria",
  conos: "heladeria",
  presentaciones: "heladeria",
  "adicionales extras": "adicionales",
  vajilla: "otros",
  "consumo personal": "otros",
  menu: "brunch",
};

/** Sufijos que marcan una variante del mismo rubro, no un rubro nuevo:
 * "Heladeria PYA" y "Heladeria DELIVERY" son heladería. El canal ya se
 * modela aparte (`CoeficienteCanal`), no hace falta duplicarlo acá. */
const SUFIJOS_VARIANTE = [" pya", " delivery", " historica"];

export function categoriaCanonica(cruda: string | null | undefined): string {
  let base = canonizarCategoria(cruda);
  for (const sufijo of SUFIJOS_VARIANTE) {
    if (base.endsWith(sufijo) && base.length > sufijo.length) {
      base = base.slice(0, -sufijo.length).trim();
    }
  }
  return SINONIMOS[base] ?? base;
}
