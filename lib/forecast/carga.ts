import type { Sector } from "@prisma/client";

/**
 * SectorLoadScore (puntos 8 y 9): traduce lo que se vende en carga de trabajo
 * por sector. La carga de una franja es
 *
 *   Σ (unidades de la categoría × coeficiente[categoría][sector])
 * + Σ (tickets del canal   × coeficiente[canal][sector])
 *
 * La parte de canal existe porque atender una mesa cuesta aunque el pedido
 * sea chico, y un delivery ocupa despacho sin importar qué lleve.
 */

export const SECTORES: Sector[] = ["COCINA", "SALON", "CAJA", "DESPACHO", "ENCARGADO"];

export type MatrizCoeficientes = Map<string, Partial<Record<Sector, number>>>;

/**
 * Valores iniciales. NO son medidos: son un punto de partida declarado para
 * que el sistema arranque, marcados como DEFECTO en la base. La idea es que
 * el encargado los corrija mirando su operación y que después se aprendan.
 *
 * Criterio usado: cuánto trabajo de elaboración pide la categoría (cocina),
 * cuánto de atención (salón), y cuánto de cobro/armado.
 */
export const COEFICIENTES_INICIALES: Record<string, Partial<Record<Sector, number>>> = {
  cafeteria: { COCINA: 1, SALON: 0.5, CAJA: 0.5, DESPACHO: 0.2 },
  promociones: { COCINA: 2.5, SALON: 0.8, CAJA: 0.4, DESPACHO: 0.4 },
  panificados: { COCINA: 0.8, SALON: 0.4, CAJA: 0.3, DESPACHO: 0.3 },
  heladeria: { COCINA: 1.5, SALON: 0.5, CAJA: 0.4, DESPACHO: 0.5 },
  "bebidas y jugos": { COCINA: 0.3, SALON: 0.5, CAJA: 0.5, DESPACHO: 0.2 },
  pasteleria: { COCINA: 1.2, SALON: 0.5, CAJA: 0.3, DESPACHO: 0.3 },
  brunch: { COCINA: 3, SALON: 1.2, CAJA: 0.4, DESPACHO: 0.4 },
  chocolateria: { COCINA: 0.4, SALON: 0.3, CAJA: 0.4, DESPACHO: 0.3 },
  adicionales: { COCINA: 0.3, SALON: 0.2, CAJA: 0.1, DESPACHO: 0.1 },
  "sin tacc": { COCINA: 1, SALON: 0.5, CAJA: 0.3, DESPACHO: 0.3 },
  waffles: { COCINA: 2.5, SALON: 0.8, CAJA: 0.3, DESPACHO: 0.3 },
  focaccias: { COCINA: 2.5, SALON: 0.8, CAJA: 0.3, DESPACHO: 0.3 },
  ensaladas: { COCINA: 2, SALON: 0.8, CAJA: 0.3, DESPACHO: 0.3 },
  pastas: { COCINA: 3, SALON: 1, CAJA: 0.3, DESPACHO: 0.3 },
  carnes: { COCINA: 4, SALON: 1, CAJA: 0.3, DESPACHO: 0.3 },
  pizzas: { COCINA: 3, SALON: 0.8, CAJA: 0.3, DESPACHO: 0.5 },
  /** Cualquier categoría sin fila propia cae acá (la cola larga: 40+
   * categorías que juntas no llegan al 3% de las unidades). */
  otros: { COCINA: 0.8, SALON: 0.4, CAJA: 0.3, DESPACHO: 0.2 },
};

export const COEFICIENTES_CANAL_INICIALES: Record<string, Partial<Record<Sector, number>>> = {
  "EAT-IN": { SALON: 2, CAJA: 0.5, ENCARGADO: 0.2 },
  TAKEAWAY: { CAJA: 1, DESPACHO: 0.5, ENCARGADO: 0.1 },
  DELIVERY: { DESPACHO: 2, CAJA: 0.3, ENCARGADO: 0.1 },
};

export type CargaPorSector = Record<Sector, number>;

const cargaVacia = (): CargaPorSector => ({ COCINA: 0, SALON: 0, CAJA: 0, DESPACHO: 0, ENCARGADO: 0 });

/**
 * Carga de una franja. `unidadesPorCategoria` usa categorías canónicas
 * (ver categorias.ts) y `ticketsPorCanal` los canales de Fudo.
 */
export function calcularCarga(
  unidadesPorCategoria: Record<string, number>,
  ticketsPorCanal: Record<string, number>,
  matrizCategoria: Record<string, Partial<Record<Sector, number>>> = COEFICIENTES_INICIALES,
  matrizCanal: Record<string, Partial<Record<Sector, number>>> = COEFICIENTES_CANAL_INICIALES
): CargaPorSector {
  const carga = cargaVacia();

  for (const [categoria, unidades] of Object.entries(unidadesPorCategoria)) {
    const coefs = matrizCategoria[categoria] ?? matrizCategoria.otros ?? {};
    for (const sector of SECTORES) {
      carga[sector] += unidades * (coefs[sector] ?? 0);
    }
  }

  for (const [canal, tickets] of Object.entries(ticketsPorCanal)) {
    const coefs = matrizCanal[canal] ?? {};
    for (const sector of SECTORES) {
      carga[sector] += tickets * (coefs[sector] ?? 0);
    }
  }

  return carga;
}

/** La carga de una franja de 30 minutos, expresada por hora, que es la
 * unidad en la que se mide la capacidad de una persona. */
export function cargaPorHora(cargaDeSlot: CargaPorSector): CargaPorSector {
  const out = cargaVacia();
  for (const s of SECTORES) out[s] = cargaDeSlot[s] * 2;
  return out;
}
