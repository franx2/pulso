/**
 * Lectura de las facturas A del proveedor.
 *
 * Desde fines de octubre de 2026 el proveedor dejó de mandar los remitos
 * ("Presupuesto X") y manda la factura electrónica de cada uno. Cambia el
 * formato y cambia la plata: la factura discrimina IVA por línea (21% o
 * 10,5%) y ese IVA es crédito fiscal, mientras que el remito no daba crédito.
 *
 *     Producto                         Cant.  P. Unitario  Subtotal  Alicuota  Subtotal C/IVA
 *     CAFE PRESTIGE NEGRO CABRALES x kg 3,00  $49.245,79 $147.737,36  21%     $178.762,20
 *
 * Mismo criterio que el lector de remitos: determinístico, o entiende la
 * línea o falla. Y la factura no trae código de producto, así que el renglón
 * se identifica por el detalle (que es, de todos modos, lo que usan las
 * reglas de sector).
 *
 * El "Desc./Rec." del pie es informativo: el descuento ya viene aplicado en
 * los precios de cada línea, y el total es neto + IVA sin restarlo de nuevo.
 */

import { RemitoIlegible, type LineaRemito, type RemitoParseado } from "@/lib/compras/remito";

export type LineaFactura = LineaRemito & {
  /** 21 o 10,5. */
  alicuota: number;
  /** El subtotal de la línea con su IVA. */
  totalConIva: number;
};

export type FacturaParseada = Omit<RemitoParseado, "lineas"> & {
  lineas: LineaFactura[];
  /** Suma de los IVA del pie: el crédito fiscal de esta compra. */
  iva: number;
  /** "Importe Neto Gravado" tal como lo declara la factura. */
  netoGravado: number;
  /** "REMITO 07/11" de las observaciones, como "YYYY-MM-DD". */
  remitoReferido: string | null;
};

const num = (texto: string): number => Number(texto.replace(/[$\s.]/g, "").replace(",", "."));

const PLATA = String.raw`\$\s*-?\d[\d.]*,\d{2}`;

/** Detalle, cantidad, unitario, subtotal, alícuota y subtotal con IVA. */
const LINEA = new RegExp(
  String.raw`^\s*(.+?)\s+(\d[\d.]*,\d{2})\s+(${PLATA})\s+(${PLATA})\s+(\d+(?:,\d+)?)%\s+(${PLATA})\s*$`,
  "u"
);

/** Renglones que nunca son la continuación de un detalle. */
const NO_ES_DETALLE = /P[áa]gina|Producto|Observaciones|Impuestos|CAE|Fecha|FACTURA|CUIT|Raz[óo]n Social/i;

const campo = (texto: string, patron: RegExp): string | null => texto.match(patron)?.[1]?.trim() ?? null;

/** Si el texto es una factura electrónica (de cualquier letra). */
export const pareceFactura = (texto: string) => /FACTURA\s+\d+-\d+/.test(texto) && /CAE/.test(texto);

export function parsearFactura(texto: string): FacturaParseada {
  const comprobante = texto.match(/FACTURA\s+(\d+)-(\d+)/);
  if (!comprobante) throw new RemitoIlegible("No encontré el número de factura");
  // Sólo la A discrimina IVA con este formato. Una B o una nota de crédito
  // tienen otra forma y otra cuenta: mejor ilegible que mal leída.
  if (!/COD\.\s*01\b/.test(texto)) throw new RemitoIlegible("No es una Factura A (COD. 01)");
  const puntoVenta = Number(comprobante[1]);
  const numeroComprobante = Number(comprobante[2]);

  const fechaCruda = campo(texto, /Fecha:\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!fechaCruda) throw new RemitoIlegible("No encontré la fecha");
  const [dia, mes, anio] = fechaCruda.split("/");
  const fecha = `${anio}-${mes}-${dia}`;

  // El nombre del cliente viene seguido de su número de cliente: "(Nro: 3".
  const cliente = campo(texto, /Nombre:\s*(.+?)\s*(?:\(Nro:[^)]*\)?)?\s*$/m);
  if (!cliente) throw new RemitoIlegible("No encontré el nombre del cliente");
  // Hay dos CUIT: el primero es el del proveedor. El que asigna el local es
  // el del cliente, que está después del nombre.
  const desdeCliente = texto.slice(texto.indexOf("Nombre:"));
  const cuit = campo(desdeCliente, /CUIT:\s*(\d+)/);

  const lineas: LineaFactura[] = [];
  let enDetalle = false;
  for (const renglon of texto.split("\n")) {
    if (/Producto\s+Cant\./.test(renglon)) {
      enDetalle = true;
      continue;
    }
    if (/Observaciones:/.test(renglon)) enDetalle = false;
    if (!enDetalle) continue;

    const m = renglon.match(LINEA);
    if (m) {
      const precioUnitario = num(m[3]);
      const total = num(m[4]);
      lineas.push({
        codigo: "",
        detalle: m[1].trim(),
        cantidad: num(m[2]),
        cantidadExacta: precioUnitario > 0 ? total / precioUnitario : num(m[2]),
        unidad: /x\s*kg|helado/i.test(m[1]) ? "Kilogramos" : "Unidades",
        precioUnitario,
        total,
        alicuota: num(m[5]),
        totalConIva: num(m[6]),
      });
      continue;
    }
    // Un detalle largo sigue en el renglón de abajo ("…CHOCOLATE" / "CON LECHE").
    const resto = renglon.trim();
    if (resto && lineas.length > 0 && !NO_ES_DETALLE.test(resto) && !/\$/.test(resto)) {
      const ultima = lineas[lineas.length - 1];
      ultima.detalle = `${ultima.detalle} ${resto}`;
    }
  }
  if (lineas.length === 0) throw new RemitoIlegible("No encontré ninguna línea de producto");

  const netoCrudo = campo(texto, /Importe Neto Gravado\s+\$\s*([\d.,]+)/);
  const totalCrudo = campo(texto, /Importe Total\s+\$\s*([\d.,]+)/);
  if (!netoCrudo || !totalCrudo) throw new RemitoIlegible("No encontré el neto gravado o el total");
  // En una factura de varias páginas el pie se repite en cada una: un IVA por
  // alícuota, el último que aparece. Sumarlos todos contaba el IVA dos veces.
  const ivaPorAlicuota = new Map<string, number>();
  for (const m of texto.matchAll(/IVA\s+(\d+(?:,\d+)?)%\s+\$\s*([\d.,]+)/g)) ivaPorAlicuota.set(m[1], num(m[2]));
  const iva = [...ivaPorAlicuota.values()].reduce((s, v) => s + v, 0);

  const observaciones = campo(texto, /Observaciones:\s*([\s\S]*?)\s*Impuestos/)?.replace(/\s+/g, " ") || null;

  // "REMITO 07/11": el año es el de la factura, salvo que el mes del remito
  // sea posterior (una factura de enero por un remito de diciembre).
  let remitoReferido: string | null = null;
  const ref = observaciones?.match(/REMITO\s+(\d{1,2})\/(\d{1,2})/i);
  if (ref) {
    const mesRef = Number(ref[2]);
    const anioRef = mesRef > Number(mes) ? Number(anio) - 1 : Number(anio);
    remitoReferido = `${anioRef}-${String(mesRef).padStart(2, "0")}-${ref[1].padStart(2, "0")}`;
  }

  const total = num(totalCrudo);
  return {
    // Con prefijo: la numeración de facturas y la de remitos son series
    // distintas del mismo punto de venta y podrían cruzarse.
    numero: `FA ${puntoVenta}-${numeroComprobante}`,
    puntoVenta,
    numeroComprobante,
    fecha,
    cliente,
    cuit,
    observaciones,
    lineas,
    sumaLineas: lineas.reduce((s, l) => s + l.total, 0),
    // Para el resto del sistema (cuenta corriente, totales) el subtotal es lo
    // que se le debe al proveedor: el total con IVA.
    subtotal: total,
    total,
    ajustePct: null,
    iva,
    netoGravado: num(netoCrudo),
    remitoReferido,
  };
}

const TOLERANCIA_PESOS = 1;

/** Que lo leído cierre contra lo que la propia factura declara. */
export function verificarFactura(f: FacturaParseada): { ok: boolean; problemas: string[] } {
  const problemas: string[] = [];
  if (Math.abs(f.sumaLineas - f.netoGravado) > TOLERANCIA_PESOS) {
    problemas.push(
      `La suma de las líneas (${f.sumaLineas.toFixed(2)}) no da el neto gravado (${f.netoGravado.toFixed(2)}). Puede haber líneas sin leer.`
    );
  }
  if (Math.abs(f.netoGravado + f.iva - f.total) > TOLERANCIA_PESOS) {
    problemas.push(
      `Neto (${f.netoGravado.toFixed(2)}) más IVA (${f.iva.toFixed(2)}) no da el total (${f.total.toFixed(2)}): puede haber percepciones u otro concepto sin leer.`
    );
  }
  for (const l of f.lineas) {
    // Mismo criterio que el remito: la cantidad impresa tiene dos decimales y
    // la facturada puede tener tres.
    if (Math.abs(l.cantidad * l.precioUnitario - l.total) > 0.005 * l.precioUnitario + TOLERANCIA_PESOS) {
      problemas.push(`"${l.detalle}": ${l.cantidad} × ${l.precioUnitario} no da ${l.total.toFixed(2)}.`);
    }
    if (Math.abs(l.total * (1 + l.alicuota / 100) - l.totalConIva) > TOLERANCIA_PESOS) {
      problemas.push(`"${l.detalle}": ${l.total.toFixed(2)} más ${l.alicuota}% no da ${l.totalConIva.toFixed(2)}.`);
    }
  }
  return { ok: problemas.length === 0, problemas };
}
