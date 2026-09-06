/**
 * El resultado operativo: de la venta al resultado, línea por línea.
 *
 * Las piezas ya existían todas y no había pantalla que las sumara. El margen
 * por sector vive en Sectores, la mercadería en Compras, el costo laboral en
 * Reportes, las comisiones y los impuestos en `impuestos.ts` y el alquiler en
 * Configuración. Cada una respondía su pregunta y ninguna respondía la única
 * que importa: si el mes cerró arriba o abajo.
 *
 * Dos decisiones que cambian el número y por eso están escritas acá:
 *
 * 1. **Todo se mide en netos.** El IVA no es un costo para un responsable
 *    inscripto: se cobra y se paga. Restarlo como línea y además trabajar con
 *    precios finales lo contaría dos veces. La venta entra neta, la
 *    mercadería entra neta, y la posición de IVA se informa aparte porque es
 *    una deuda a pagar, no un gasto del período.
 *
 * 2. **Una línea sin dato se marca, no se pone en cero.** Un cero dice "esto
 *    no costó nada" y un resultado construido sobre ceros es más peligroso
 *    que no tener resultado. Cada línea informa si su fuente está completa, y
 *    el total dice cuántas no lo están.
 */

import { IIBB, IVA, type CostoDeVenta } from "./impuestos";

export type Linea = {
  id: string;
  etiqueta: string;
  /** Negativo cuando resta. Es lo que se suma para llegar al resultado. */
  monto: number;
  /** Sobre la venta neta. */
  porcentaje: number;
  /** Qué mira esta línea, en una frase. */
  nota: string;
  /**
   * `false` cuando la fuente no está cargada. La línea igual se muestra con
   * lo que hay: media verdad marcada es útil, media verdad silenciosa no.
   */
  completa: boolean;
  /** Por qué está incompleta, para poder ir a arreglarlo. */
  falta?: string;
};

export type Resultado = {
  ventaBruta: number;
  ventaNeta: number;
  lineas: Linea[];
  resultado: number;
  resultadoPct: number;
  /** Cuántas líneas se apoyan en datos incompletos. */
  incompletas: number;
  /** La posición de IVA del período: no es gasto, es lo que hay que depositar. */
  iva: { debito: number; credito: number; aPagar: number };
};

export type EntradaResultado = {
  /** Venta con IVA, tal como la cobra la caja. */
  ventaBruta: number;
  /** Desglose por medio de pago, para las comisiones. */
  costoDeVenta: CostoDeVenta;
  /** Mercadería comprada en el período, con IVA. */
  mercaderiaBruta: number;
  /** Remitos de servicio: el royalty de la franquicia. */
  royaltyBruto: number;
  /** Parte de la mercadería respaldada con Factura A, que da crédito fiscal. */
  comprasConFactura: number;
  /** Sueldos del período. */
  costoLaboral: number;
  /** Costos fijos cargados a mano para el mes. */
  costosFijos: number;
  /** Señales de qué falta. */
  hayRemitos: boolean;
  empleadosSinPrecio: number;
  conceptosFijosSinCargar: number;
};

/** Saca el IVA contenido en un precio final. */
export const neto = (bruto: number) => bruto / (1 + IVA);

export function calcularResultado(e: EntradaResultado): Resultado {
  const ventaNeta = neto(e.ventaBruta);
  const mercaderia = neto(e.mercaderiaBruta);
  const royalty = neto(e.royaltyBruto);

  // Ingresos Brutos se calcula sobre TODA la venta neta. Lo que depende del
  // medio de pago es la retención, que es un pago a cuenta del mismo
  // impuesto: quien cobra en efectivo lo debe igual, sólo que nadie se lo
  // retuvo. Usar la base retenida daría un impuesto menor que el real.
  const iibb = ventaNeta * IIBB;

  // La comisión que factura el procesador lleva IVA, y ese IVA es crédito
  // fiscal: lo que va al resultado es la comisión neta.
  const comisiones = neto(e.costoDeVenta.comisiones);

  const pct = (monto: number) => (ventaNeta > 0 ? (monto / ventaNeta) * 100 : 0);

  const lineas: Linea[] = [
    {
      id: "mercaderia",
      etiqueta: "Mercadería",
      monto: -mercaderia,
      porcentaje: pct(-mercaderia),
      nota: "Remitos del proveedor, sin IVA",
      completa: e.hayRemitos,
      falta: e.hayRemitos ? undefined : "No hay remitos cargados en el período",
    },
    {
      id: "royalty",
      etiqueta: "Royalty",
      monto: -royalty,
      porcentaje: pct(-royalty),
      nota: "Remitos de servicio de la franquicia",
      completa: true,
    },
    {
      id: "comisiones",
      etiqueta: "Comisiones de cobro",
      monto: -comisiones,
      porcentaje: pct(-comisiones),
      nota: "Tarjetas, billeteras y delivery, según lo cobrado por cada medio",
      completa: e.costoDeVenta.ventaSinTasa === 0,
      falta:
        e.costoDeVenta.ventaSinTasa > 0
          ? "Hay medios de pago que ninguna regla reconoce y no se les aplicó comisión"
          : undefined,
    },
    {
      id: "iibb",
      etiqueta: "Ingresos Brutos",
      monto: -iibb,
      porcentaje: pct(-iibb),
      nota: `${(IIBB * 100).toFixed(0)}% sobre la venta neta, incluido lo cobrado en efectivo`,
      completa: true,
    },
    {
      id: "laboral",
      etiqueta: "Costo laboral",
      monto: -e.costoLaboral,
      porcentaje: pct(-e.costoLaboral),
      nota: "Horas fichadas por el precio/hora de cada uno",
      completa: e.empleadosSinPrecio === 0,
      falta:
        e.empleadosSinPrecio > 0
          ? `${e.empleadosSinPrecio} ${e.empleadosSinPrecio === 1 ? "empleado no tiene" : "empleados no tienen"} precio/hora cargado`
          : undefined,
    },
    {
      id: "fijos",
      etiqueta: "Gastos fijos",
      monto: -e.costosFijos,
      porcentaje: pct(-e.costosFijos),
      nota: "Alquiler, servicios, seguros, impuestos y mantenimiento",
      completa: e.conceptosFijosSinCargar === 0,
      falta:
        e.conceptosFijosSinCargar > 0
          ? `${e.conceptosFijosSinCargar} ${e.conceptosFijosSinCargar === 1 ? "concepto" : "conceptos"} sin cargar este mes`
          : undefined,
    },
  ];

  const resultado = ventaNeta + lineas.reduce((suma, l) => suma + l.monto, 0);
  const debito = ventaNeta * IVA;
  const credito = neto(e.comprasConFactura) * IVA;

  return {
    ventaBruta: e.ventaBruta,
    ventaNeta,
    lineas,
    resultado,
    resultadoPct: ventaNeta > 0 ? (resultado / ventaNeta) * 100 : 0,
    incompletas: lineas.filter((l) => !l.completa).length,
    iva: { debito, credito, aPagar: debito - credito },
  };
}
