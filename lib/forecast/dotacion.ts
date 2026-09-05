import type { Sector } from "@prisma/client";
import { SECTORES, type CargaPorSector } from "./carga";

/**
 * Traduce carga en personas (puntos 10 y 11).
 *
 * Decisión de diseño: el pedido plantea DOS cosas — una matriz de rangos
 * (0-100 → 1 persona, 101-180 → 2…) y una capacidad por empleado. Son la
 * misma cosa escrita de dos formas: la matriz ES `ceil(carga / capacidad)`
 * tabulada. Mantener las dos por separado obliga a recalibrar dos lugares y
 * abre la puerta a que se contradigan.
 *
 * Acá la fuente de verdad es `capacidadPorEmpleado`, y la matriz de rangos se
 * DERIVA de ella para mostrarla (`matrizDesdeCapacidad`). Se calibra un solo
 * número por sector y la tabla se actualiza sola.
 *
 * Precedencia de configuración, como pide el punto 11: local → tipo de local
 * → cadena. La resuelve quien consulta la base; acá sólo se aplica el valor.
 */

export type CapacidadSectorial = {
  capacidadPorEmpleado: number;
  minPersonas: number;
  maxPersonas: number;
};

export type DotacionPorSector = Record<Sector, number>;

export function recomendarDotacion(
  cargaHora: CargaPorSector,
  capacidades: Partial<Record<Sector, CapacidadSectorial>>
): DotacionPorSector {
  const out = { COCINA: 0, SALON: 0, CAJA: 0, DESPACHO: 0, ENCARGADO: 0 } as DotacionPorSector;

  for (const sector of SECTORES) {
    const cap = capacidades[sector];
    if (!cap || cap.capacidadPorEmpleado <= 0) {
      out[sector] = cargaHora[sector] > 0 ? cap?.minPersonas ?? 0 : 0;
      continue;
    }
    const necesarias = Math.ceil(cargaHora[sector] / cap.capacidadPorEmpleado);
    // El mínimo sólo aplica si el local está operando esa franja: no tiene
    // sentido pedir un cocinero a las 4 de la mañana con la persiana baja.
    const piso = cargaHora[sector] > 0 ? cap.minPersonas : 0;
    out[sector] = Math.min(Math.max(necesarias, piso), cap.maxPersonas);
  }

  return out;
}

/** Tabla rango-de-carga → personas, derivada de la capacidad. Es la vista que
 * pide el punto 11, generada para no tener dos verdades. */
export function matrizDesdeCapacidad(
  cap: CapacidadSectorial,
  filas = 6
): { desde: number; hasta: number | null; personas: number }[] {
  const out: { desde: number; hasta: number | null; personas: number }[] = [];
  for (let personas = Math.max(cap.minPersonas, 1); personas < Math.max(cap.minPersonas, 1) + filas; personas++) {
    const desde = (personas - 1) * cap.capacidadPorEmpleado;
    const hasta = personas * cap.capacidadPorEmpleado;
    out.push({
      desde: Math.round(desde),
      hasta: personas >= cap.maxPersonas ? null : Math.round(hasta),
      personas,
    });
    if (personas >= cap.maxPersonas) break;
  }
  return out;
}

/**
 * Aprende la capacidad a partir del histórico: junta franjas donde se sabe
 * cuánta gente había en el sector y cuánta carga hubo, y toma un percentil
 * alto de carga-por-persona como "lo que una persona sostiene".
 *
 * Se usa el percentil 75 y no el promedio a propósito: el promedio incluye
 * las franjas muertas (dos personas mirando la puerta a las 16:00) y
 * subestimaría la capacidad, inflando la dotación recomendada.
 *
 * Devuelve null cuando no hay observaciones suficientes — hoy es el caso de
 * todos los locales, y el motor tiene que decirlo en vez de fingir que midió.
 */
export function aprenderCapacidad(
  observaciones: { cargaHora: number; personas: number }[],
  minObservaciones = 30
): { capacidadPorEmpleado: number; observaciones: number; confianza: number } | null {
  const validas = observaciones.filter((o) => o.personas > 0 && o.cargaHora > 0);
  if (validas.length < minObservaciones) return null;

  const porPersona = validas.map((o) => o.cargaHora / o.personas).sort((a, b) => a - b);
  const p75 = porPersona[Math.floor(porPersona.length * 0.75)];

  // La confianza crece con la muestra y se estanca: 200 observaciones no dan
  // el doble de certeza que 100.
  const confianza = Math.min(0.9, 0.3 + Math.log10(validas.length / minObservaciones + 1) * 0.6);

  return { capacidadPorEmpleado: p75, observaciones: validas.length, confianza };
}
