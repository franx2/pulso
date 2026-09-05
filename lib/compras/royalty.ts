/**
 * Control del royalty de marca.
 *
 * La regla, según el dueño: **(venta total del local ÷ 1,21) × 0,05**. O sea
 * el 5% de la venta neta de IVA. Las ventas que devuelve Fudo son finales
 * (con IVA), así que hay que sacarle el 21% antes de aplicar el 5%.
 *
 * Existe como control y no como registro: el proveedor emite el remito de
 * "USO DE MARCA" por su cuenta y nadie estaba rehaciendo la cuenta. Sobre el
 * único mes que hay cargado (agosto de 2026) da una diferencia a favor del
 * proveedor, así que la cuenta vale la pena hacerla todos los meses.
 *
 * El remito de agosto llega fechado el 30 aunque el mes no haya terminado —
 * es para que a ellos les cierre el cuadro fiscal del mes— así que el mes que
 * se compara sale del texto del remito ("USO DE MARCA AGOSTO") y no de su
 * fecha de emisión.
 */

export const ALICUOTA_IVA = 0.21;
export const PORCENTAJE_ROYALTY = 0.05;

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

/**
 * Mes que cubre el remito, deducido de sus observaciones.
 *
 * Si el texto no lo dice, cae en el mes de la fecha de emisión, que es lo más
 * probable pero no seguro: por eso se devuelve de dónde salió, para que la
 * pantalla pueda decir "supuesto" en vez de afirmarlo.
 */
export function mesDelRoyalty(
  observaciones: string | null,
  fechaEmision: string
): { mes: string; origen: "texto" | "fecha" } {
  const texto = (observaciones ?? "").toUpperCase();
  const indice = MESES.findIndex((mes) => texto.includes(mes));
  if (indice >= 0) {
    // El remito nombra el mes pero no el año: se asume el año de emisión,
    // salvo que eso caiga en el futuro (un "DICIEMBRE" emitido en enero).
    const anioEmision = Number(fechaEmision.slice(0, 4));
    const mesEmision = Number(fechaEmision.slice(5, 7)) - 1;
    const anio = indice > mesEmision ? anioEmision - 1 : anioEmision;
    return { mes: `${anio}-${String(indice + 1).padStart(2, "0")}`, origen: "texto" };
  }
  return { mes: fechaEmision.slice(0, 7), origen: "fecha" };
}

export type ControlRoyalty = {
  mes: string;
  origenMes: "texto" | "fecha";
  /** Venta del mes tal como la reporta Fudo, con IVA. */
  ventaConIva: number;
  ventaNeta: number;
  /** Lo que correspondería cobrar según la regla. */
  esperado: number;
  /** Lo que el remito cobra, antes del ajuste del 10,5%. */
  cobrado: number;
  diferencia: number;
  diferenciaPct: number;
  /** Días del mes con datos, contra los que tiene el mes. Si faltan, la
   * comparación no sirve y hay que decirlo en vez de mostrar una diferencia. */
  diasConDatos: number;
  diasDelMes: number;
  completo: boolean;
};

/** Cuánta diferencia se tolera antes de marcarla. Medio punto es redondeo. */
export const TOLERANCIA_PCT = 0.5;

export function controlarRoyalty(entrada: {
  mes: string;
  origenMes: "texto" | "fecha";
  ventaConIva: number;
  cobrado: number;
  diasConDatos: number;
}): ControlRoyalty {
  const [anio, mes] = entrada.mes.split("-").map(Number);
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const ventaNeta = entrada.ventaConIva / (1 + ALICUOTA_IVA);
  const esperado = ventaNeta * PORCENTAJE_ROYALTY;
  const diferencia = entrada.cobrado - esperado;

  return {
    mes: entrada.mes,
    origenMes: entrada.origenMes,
    ventaConIva: entrada.ventaConIva,
    ventaNeta,
    esperado,
    cobrado: entrada.cobrado,
    diferencia,
    diferenciaPct: esperado > 0 ? (diferencia / esperado) * 100 : 0,
    diasConDatos: entrada.diasConDatos,
    diasDelMes,
    // Sin el mes completo la venta está subestimada y la diferencia saldría
    // siempre a favor del proveedor por un motivo que no es el suyo.
    completo: entrada.diasConDatos >= diasDelMes,
  };
}
