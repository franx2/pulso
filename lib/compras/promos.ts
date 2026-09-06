/**
 * Qué hay adentro de cada promoción.
 *
 * Existe porque Fudo guarda la promo como un producto único —"PROMO CLÁSICA",
 * $11,4M en agosto— sin decir qué lleva. Son el 31% de la facturación, así que
 * sin esto un tercio de la venta no se puede atribuir a ningún sector.
 *
 * **Todas las promos incluyen una infusión clásica**, que es el dato que hace
 * que casi todas sean cafetería: aunque el acompañamiento fuera de otro
 * sector, la mitad del precio es café.
 *
 * Los repartos salen de la carta y de los precios REALES de venta suelta
 * medidos en agosto de 2026, no de una estimación:
 *
 *     infusión clásica (cortado)  $4.592
 *     medialuna                   $1.978
 *     alfajor / carita            $2.500
 *     bocha de helado             $3.900
 *     monoporción                 $9.200
 *     croissant                   $5.450
 *
 * Se guardan como proporciones y no como pesos a propósito: los precios suben
 * todos juntos con la inflación, así que la proporción entre componentes
 * aguanta aunque los números de arriba queden viejos.
 */

import type { Sector } from "./sectores";

export type Reparto = Partial<Record<Exclude<Sector, "PROMOCION" | "SIN_CLASIFICAR">, number>>;

export type DefinicionPromo = {
  patron: RegExp;
  nombre: string;
  /** Qué dice la carta, para poder auditar el reparto sin salir de la app. */
  contenido: string;
  reparto: Reparto;
  /**
   * `medido` = todos los componentes son del mismo sector, no hay nada que
   * suponer. `supuesto` = la promo deja elegir entre opciones de sectores
   * distintos y no se sabe qué elige la gente; el reparto es una hipótesis.
   */
  base: "medido" | "supuesto";
};

/**
 * Las definiciones, en orden: la primera que coincide gana.
 *
 * Las más específicas van primero — "PROMO TOSTADO BRIOCHE" antes que
 * "PROMO TOSTADAS", o la segunda se comería a la primera.
 */
export const PROMOS: DefinicionPromo[] = [
  {
    patron: /TOSTADO BRIOCHE|PANINI/i,
    nombre: "Tostado Brioche / Panini",
    contenido: "Infusión + tostado de jamón y queso en pan brioche",
    reparto: { CAFETERIA: 1 },
    base: "medido",
  },
  {
    patron: /TOST[OÓ]N/i,
    nombre: "Tostón",
    contenido: "Infusión + tostón de avocado",
    reparto: { CAFETERIA: 1 },
    base: "medido",
  },
  {
    patron: /TOSTADAS/i,
    nombre: "Tostadas",
    contenido: "Infusión + 2 tostadas con queso y dulce",
    reparto: { CAFETERIA: 1 },
    base: "medido",
  },
  {
    patron: /CHIPA/i,
    nombre: "Chipa",
    contenido: "Infusión + chipa prensado con jamón y queso",
    reparto: { CAFETERIA: 1 },
    base: "medido",
  },
  {
    patron: /PROTEIC/i,
    nombre: "Proteico",
    contenido: "Infusión + 2 tostadas, huevos revueltos, jamón y queso crema",
    reparto: { CAFETERIA: 1 },
    base: "medido",
  },
  {
    // El chocolate belga es relleno del croissant, no un producto de
    // chocolatería: quien lo compra se lleva una factura, y el costo del
    // chocolate es un insumo de cafetería.
    patron: /LAMINADO/i,
    nombre: "Laminado",
    contenido: "Infusión + croissant con cremoso de chocolate belga",
    reparto: { CAFETERIA: 1 },
    base: "medido",
  },
  {
    // Infusión $4.592 + 2 medialunas $3.956 = $8.548 de valor suelto por
    // $6.800 de promo. Las opciones alfajor y carita sí son chocolatería, pero
    // no hay forma de saber cuántos las eligen: el 10% es una hipótesis.
    patron: /CL[AÁ]SICA/i,
    nombre: "Clásica",
    contenido: "Infusión + 2 panificados, o alfajor, o carita, o budín",
    reparto: { CAFETERIA: 0.9, CHOCOLATERIA: 0.1 },
    base: "supuesto",
  },
  {
    // La única promo con helado. El dueño fijó el reparto en 90/10: la
    // monoporción y el cuadrado son pastelería, y la bocha —cuando la eligen—
    // es la parte de heladería.
    patron: /DULCE ANTOJO/i,
    nombre: "Dulce Antojo",
    contenido: "Infusión + monoporción, o cuadrado con bocha de helado, o alfacookie",
    reparto: { CAFETERIA: 0.9, HELADOS: 0.1 },
    base: "supuesto",
  },
];

export function definicionDe(producto: string): DefinicionPromo | null {
  return PROMOS.find((p) => p.patron.test(producto)) ?? null;
}

export type RepartoAplicado = {
  sector: Exclude<Sector, "PROMOCION" | "SIN_CLASIFICAR">;
  monto: number;
};

/**
 * Reparte la facturación de una promo entre sectores.
 *
 * Si la promo no está definida devuelve `null` — y el que llama la deja en
 * `PROMOCION`, visible como no atribuida. Adivinar por el nombre sería
 * exactamente lo que este módulo existe para evitar.
 */
export function repartir(producto: string, facturacion: number): RepartoAplicado[] | null {
  const definicion = definicionDe(producto);
  if (!definicion) return null;

  const total = Object.values(definicion.reparto).reduce((s, v) => s + (v ?? 0), 0);
  if (total <= 0) return null;

  return Object.entries(definicion.reparto).map(([sector, peso]) => ({
    sector: sector as RepartoAplicado["sector"],
    // Se normaliza por si un reparto no suma exactamente 1: mejor repartir
    // todo con proporciones aproximadas que perder plata en el camino.
    monto: (facturacion * (peso ?? 0)) / total,
  }));
}
