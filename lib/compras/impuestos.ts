/**
 * Costo de venta e impuestos, según cómo funcionan en Argentina.
 *
 * Tres cosas que se confunden seguido y que acá van separadas a propósito,
 * porque tratarlas juntas da un resultado equivocado:
 *
 * 1. **La comisión** del medio de pago es un costo real y se descuenta.
 * 2. **Ingresos Brutos** es un impuesto provincial sobre la venta. Lo que
 *    depende del medio de pago no es el impuesto sino la RETENCIÓN: las
 *    tarjetas y las billeteras retienen al liquidar, y eso es un pago a
 *    cuenta del mismo impuesto, no un impuesto aparte ni una base distinta.
 * 3. **El IVA** no es un gasto para un responsable inscripto: se cobra y se
 *    paga. Lo que corresponde es trabajar en netos, no restarlo como línea.
 */

/** Alícuota general de IVA en gastronomía. */
export const IVA = 0.21;

/**
 * Ingresos Brutos, Mendoza.
 *
 * La base imponible NO incluye el débito fiscal de IVA: para un responsable
 * inscripto se calcula sobre la venta neta, no sobre el total con IVA. Sobre
 * $100 finales, la base son $82,64 y no $100.
 */
export const IIBB = 0.05;

export type TasaMedio = { patron: RegExp; tasa: number; etiqueta: string };

/** Las comisiones de un local, tal como se cargan en su configuración. */
export type Comisiones = {
  credito: number;
  debito: number;
  billetera: number;
  delivery: number;
};

export const COMISIONES_POR_DEFECTO: Comisiones = {
  credito: 0.04,
  debito: 0.02,
  billetera: 0.02,
  delivery: 0.27,
};

/**
 * Comisiones por medio de pago, con las tasas del local.
 *
 * **El orden importa y las apps van primero.** "Pedidos ya efectivo" contiene
 * la palabra "efectivo" y "Pedidos ya online" contiene "online": si ganara
 * otra regla, la venta más cara de cobrar quedaría contada como la más
 * barata. Delivery cobra 27% contra 2-4% del resto, así que el error costaría
 * un orden de magnitud.
 */
export function tasasDe(c: Comisiones = COMISIONES_POR_DEFECTO): TasaMedio[] {
  return [
    { patron: /uber|pedidos ?ya|pedidosya|rappi/i, tasa: c.delivery, etiqueta: "Delivery" },
    { patron: /efectivo/i, tasa: 0, etiqueta: "Efectivo" },
    { patron: /transferencia|cta\.? ?cte|cuenta corriente/i, tasa: 0, etiqueta: "Sin comisión" },
    { patron: /cr[eé]dito/i, tasa: c.credito, etiqueta: "Crédito" },
    { patron: /d[eé]bito|prepaga/i, tasa: c.debito, etiqueta: "Débito" },
    { patron: /mercado ?pago|\bqr\b|posnet|nave|modo/i, tasa: c.billetera, etiqueta: "Billetera / QR" },
  ];
}

export type CostoMedio = {
  medio: string;
  monto: number;
  /** Null cuando ninguna regla reconoce el medio: se informa, no se estima. */
  tasa: number | null;
  comision: number;
  etiqueta: string;
};

export type CostoDeVenta = {
  porMedio: CostoMedio[];
  comisiones: number;
  /** Venta cobrada por medios que ninguna regla reconoce. */
  ventaSinTasa: number;
  /** Venta cobrada en efectivo o por medios sin comisión. */
  ventaSinComision: number;
  /** Venta cobrada por apps de delivery, que es la comisión más cara. */
  ventaDelivery: number;
  comisionDelivery: number;
  total: number;
};

/**
 * Comisiones a partir del desglose por medio de pago que ya trae cada día.
 *
 * La comisión que factura el procesador lleva IVA, pero ese IVA es crédito
 * fiscal para un responsable inscripto: el costo que va al resultado es la
 * comisión neta, no la comisión más IVA.
 */
export function costoDeVenta(
  porMedioPago: Record<string, number>,
  comisiones: Comisiones = COMISIONES_POR_DEFECTO
): CostoDeVenta {
  const tasas = tasasDe(comisiones);
  const porMedio: CostoMedio[] = [];
  let total = 0;
  let suma = 0;
  let ventaSinTasa = 0;
  let ventaSinComision = 0;
  let ventaDelivery = 0;
  let comisionDelivery = 0;

  for (const [medio, monto] of Object.entries(porMedioPago)) {
    if (typeof monto !== "number" || monto === 0) continue;
    total += monto;
    const tasa = tasas.find((t) => t.patron.test(medio)) ?? null;
    const comision = tasa ? monto * tasa.tasa : 0;
    suma += comision;

    if (!tasa) ventaSinTasa += monto;
    else if (tasa.tasa === 0) ventaSinComision += monto;
    if (tasa?.etiqueta === "Delivery") {
      ventaDelivery += monto;
      comisionDelivery += comision;
    }

    porMedio.push({
      medio,
      monto,
      tasa: tasa ? tasa.tasa : null,
      comision,
      etiqueta: tasa ? tasa.etiqueta : "Medio desconocido",
    });
  }

  porMedio.sort((a, b) => b.monto - a.monto);
  return {
    porMedio,
    comisiones: suma,
    ventaSinTasa,
    ventaSinComision,
    ventaDelivery,
    comisionDelivery,
    total,
  };
}

export type CargaIIBB = {
  /** Lo que corresponde por ley: sobre TODA la venta, neta de IVA. */
  sobreVentaTotal: number;
  /**
   * Lo que se retiene automáticamente, que es sólo sobre lo no efectivo.
   *
   * Se calcula aparte para poder ver la diferencia. No es una base alternativa
   * del impuesto: el efectivo tributa igual, sólo que nadie lo retiene.
   */
  retenidoAproximado: number;
  diferencia: number;
  baseNeta: number;
};

export function ingresosBrutos(ventaTotal: number, ventaNoEfectivo: number): CargaIIBB {
  const baseNeta = ventaTotal / (1 + IVA);
  const sobreVentaTotal = baseNeta * IIBB;
  const retenidoAproximado = (ventaNoEfectivo / (1 + IVA)) * IIBB;
  return {
    baseNeta,
    sobreVentaTotal,
    retenidoAproximado,
    diferencia: sobreVentaTotal - retenidoAproximado,
  };
}

export type PosicionIVA = {
  debitoFiscal: number;
  creditoFiscal: number;
  aPagar: number;
};

/**
 * Posición de IVA del período.
 *
 * No es "ventas menos compras": es el IVA CONTENIDO en cada una. Sobre una
 * venta final de $121 el débito fiscal es $21, no $121.
 *
 * Y el crédito fiscal sólo existe con **Factura A**. Los remitos que carga
 * este sistema son "Presupuesto X", que es un comprobante no fiscal y no da
 * crédito: si la compra se respalda sólo con eso, el IVA de esa compra es un
 * costo real y no se recupera. Por eso `comprasConFactura` se pasa aparte y no
 * es simplemente el total comprado.
 */
export function posicionIVA(ventasGravadas: number, comprasConFactura: number): PosicionIVA {
  const debitoFiscal = (ventasGravadas / (1 + IVA)) * IVA;
  const creditoFiscal = (comprasConFactura / (1 + IVA)) * IVA;
  return { debitoFiscal, creditoFiscal, aPagar: debitoFiscal - creditoFiscal };
}

/** Conceptos de costo fijo que se ofrecen para cargar en cada local. */
export const CONCEPTOS_FIJOS = [
  "Alquiler",
  "Servicios",
  "Seguros",
  "Impuestos",
  "Mantenimiento",
  "Otros",
] as const;
