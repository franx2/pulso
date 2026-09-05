/**
 * Lectura de los remitos del proveedor.
 *
 * Es un parser determinístico y no un modelo de lenguaje a propósito: acá se
 * leen precios y cantidades que después son el costo de la mercadería. Un
 * parser o entiende la línea o falla ruidosamente; un modelo puede devolver
 * un número plausible y equivocado, y nadie lo va a notar mirando un total.
 *
 * El formato viene del sistema del proveedor y es fijo:
 *
 *     Cód. Producto  Cantidad         Detalle                Unitario   Total
 *     1.099          2,00 Kilogramos  CAFE PRESTIGE NEGRO    47.997,85  95.995,70
 *
 * Todo el módulo es puro: entra el texto del PDF y sale la estructura. La
 * extracción del texto vive aparte porque depende del entorno.
 */

export type LineaRemito = {
  /** Código del proveedor. Es la clave estable: el nombre cambia de escritura
   * entre remitos ("X KG" y "x kg" el mismo mes) pero el código no. */
  codigo: string;
  detalle: string;
  /** La que imprime el remito, con dos decimales. */
  cantidad: number;
  /**
   * La que se deduce de dividir el total por el unitario.
   *
   * El proveedor imprime dos decimales y factura con tres: un helado que
   * figura como 7,27 kg y cierra en $66.111,50 a $9.100 pesaba 7,265. Para
   * control de stock esta es la buena; para mostrar, la impresa.
   */
  cantidadExacta: number;
  unidad: string;
  precioUnitario: number;
  /** Lo que dice la línea, que es lo que efectivamente se cobra. */
  total: number;
};

export type RemitoParseado = {
  /** "16-5004": punto de venta y número. Es la clave para no cargar dos veces. */
  numero: string;
  puntoVenta: number;
  numeroComprobante: number;
  /** "YYYY-MM-DD". */
  fecha: string;
  /** Razón social del cliente tal cual figura: con eso se asigna el local. */
  cliente: string;
  cuit: string | null;
  observaciones: string | null;
  lineas: LineaRemito[];
  /** Suma de las líneas, sin el recargo. */
  sumaLineas: number;
  /** Lo que el remito declara como subtotal. */
  subtotal: number;
  total: number;
  /**
   * El campo que el remito rotula "Desc. aplicado (%)".
   *
   * Ojo: **suma, no resta**. En los cuatro remitos de agosto de 2026 el
   * subtotal es exactamente la suma de las líneas × 1,105. Se guarda tal cual
   * viene y el signo se decide al calcular el costo, no acá.
   */
  ajustePct: number | null;
};

export class RemitoIlegible extends Error {}

const num = (texto: string): number => Number(texto.replace(/\./g, "").replace(",", "."));

/** Plata del remito: siempre con dos decimales y coma. "9.100,00", "754,63". */
const PLATA = String.raw`\d[\d.]*,\d{2}`;

/**
 * Una línea de producto.
 *
 * El detalle puede tener cualquier cosa adentro (paréntesis, "x kg", "&",
 * "x 100 u"), así que la línea se ancla por los extremos: código, cantidad y
 * unidad al principio, y **dos importes con formato de plata al final**.
 *
 * Anclar en el formato de plata y no en "dos o más espacios" es a propósito:
 * el espaciado depende de cómo se extrajo el texto. `pdftotext -layout` deja
 * dos espacios entre la unidad y el detalle y la reconstrucción desde las
 * coordenadas del PDF deja uno. Con el ancla en los importes, las dos entran
 * por el mismo camino. Los digitos sueltos del detalle no se confunden con un
 * precio porque no tienen los dos decimales.
 */
const LINEA = new RegExp(
  String.raw`^\s*([\d.]+)\s+([\d.,]+)\s+(\p{L}+)\s+(.+?)\s+(${PLATA})\s+(${PLATA})\s*$`,
  "u"
);

const campo = (texto: string, patron: RegExp): string | null => texto.match(patron)?.[1]?.trim() ?? null;

export function parsearRemito(texto: string): RemitoParseado {
  const numero = campo(texto, /Nro:\s*([\d.]+\s*-\s*[\d.]+)/);
  if (!numero) throw new RemitoIlegible("No encontré el número de remito (Nro:)");
  const [puntoVenta, numeroComprobante] = numero.split("-").map((parte) => Number(parte.replace(/\./g, "").trim()));

  const fechaCruda = campo(texto, /Fecha:\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!fechaCruda) throw new RemitoIlegible("No encontré la fecha");
  const [dia, mes, anio] = fechaCruda.split("/");
  const fecha = `${anio}-${mes}-${dia}`;

  const cliente = campo(texto, /Nombre:\s*(.+?)\s*$/m);
  if (!cliente) throw new RemitoIlegible("No encontré el nombre del cliente");

  const lineas: LineaRemito[] = [];
  const vistas = new Set<string>();
  for (const renglon of texto.split("\n")) {
    const m = renglon.match(LINEA);
    if (!m) continue;
    // El PDF repite el encabezado en cada página; una línea idéntica repetida
    // sí puede ser real (dos entregas del mismo producto), así que se
    // deduplica por el renglón completo y no por el código.
    const huella = renglon.trim();
    if (vistas.has(huella)) continue;
    vistas.add(huella);
    const precioUnitario = num(m[5]);
    const total = num(m[6]);
    lineas.push({
      codigo: m[1].replace(/\./g, ""),
      cantidad: num(m[2]),
      cantidadExacta: precioUnitario > 0 ? total / precioUnitario : num(m[2]),
      unidad: m[3],
      detalle: m[4].trim(),
      precioUnitario,
      total,
    });
  }
  if (lineas.length === 0) throw new RemitoIlegible("No encontré ninguna línea de producto");

  const subtotalCrudo = campo(texto, /Subtotal\s*\$\s*([\d.,]+)/);
  const totalCrudo = campo(texto, /Total:\s*\$\s*([\d.,]+)/);
  if (!subtotalCrudo || !totalCrudo) throw new RemitoIlegible("No encontré el subtotal o el total");

  const ajuste = campo(texto, /Desc\. aplicado \(%\)\s*([\d.,]+)/);
  const observaciones = campo(texto, /Observaciones:\s*(.+?)\s*$/m);

  return {
    numero: `${puntoVenta}-${numeroComprobante}`,
    puntoVenta,
    numeroComprobante,
    fecha,
    cliente,
    cuit: campo(texto, /CUIT:\s*(\d+)/),
    observaciones: observaciones && observaciones.length > 0 ? observaciones : null,
    lineas,
    sumaLineas: lineas.reduce((s, l) => s + l.total, 0),
    subtotal: num(subtotalCrudo),
    total: num(totalCrudo),
    ajustePct: ajuste ? num(ajuste) : null,
  };
}

export type Verificacion = {
  ok: boolean;
  /** Diferencia entre la suma de líneas ajustada y el subtotal declarado. */
  diferencia: number;
  /** El multiplicador que hace falta para llegar del detalle al subtotal. */
  factorObservado: number;
  problemas: string[];
};

/** Cuánto se tolera de diferencia en pesos antes de dudar del recorrido. */
const TOLERANCIA_PESOS = 1;

/**
 * Comprueba que lo leído cierre contra lo que el propio remito declara.
 *
 * Es la red que evita el error caro: si una línea no se leyó, la suma no da y
 * el remito se marca en vez de entrar con un costo incompleto. Sin esto, un
 * producto con un carácter raro en el nombre desaparecería en silencio y el
 * food cost saldría bajo sin ninguna señal.
 */
export function verificarRemito(remito: RemitoParseado): Verificacion {
  const problemas: string[] = [];
  const factorObservado = remito.sumaLineas > 0 ? remito.subtotal / remito.sumaLineas : 0;
  const esperado = remito.ajustePct != null ? remito.sumaLineas * (1 + remito.ajustePct / 100) : remito.sumaLineas;
  const diferencia = remito.subtotal - esperado;

  if (Math.abs(diferencia) > TOLERANCIA_PESOS) {
    problemas.push(
      `La suma del detalle (${remito.sumaLineas.toFixed(2)}) con el ajuste declarado no da el subtotal ` +
        `(${remito.subtotal.toFixed(2)}): faltan ${diferencia.toFixed(2)}. Puede haber líneas sin leer.`
    );
  }
  if (Math.abs(remito.total - remito.subtotal) > TOLERANCIA_PESOS) {
    problemas.push(`El total (${remito.total.toFixed(2)}) no coincide con el subtotal (${remito.subtotal.toFixed(2)}).`);
  }
  for (const linea of remito.lineas) {
    const calculado = linea.cantidad * linea.precioUnitario;
    // El proveedor IMPRIME la cantidad con dos decimales pero FACTURA con
    // tres: "HELADO DE CHOCOLATE AMARGO 7,27 × 9.100" cierra en 66.111,50 y
    // no en 66.157, porque el peso real era 7,265 kg. Así que la tolerancia
    // por línea es lo que ese redondeo permite —medio centésimo de unidad por
    // el precio— y no un peso fijo. Con un peso fijo, todo lo que se vende
    // por kilo caro daría un falso problema.
    const porRedondeo = 0.005 * linea.precioUnitario;
    if (Math.abs(calculado - linea.total) > porRedondeo + TOLERANCIA_PESOS) {
      problemas.push(
        `"${linea.detalle}": ${linea.cantidad} × ${linea.precioUnitario} da ${calculado.toFixed(2)} y la línea dice ${linea.total.toFixed(2)}.`
      );
    }
  }

  return { ok: problemas.length === 0, diferencia, factorObservado, problemas };
}

/**
 * Costo de cada línea con el ajuste del remito prorrateado.
 *
 * Se devuelven las dos lecturas porque todavía no está decidido si ese 10,5%
 * es parte del costo de la mercadería o un costo financiero aparte: `lista`
 * es lo que dice la línea y `conAjuste` lo que efectivamente se paga.
 */
export function costoPorLinea(remito: RemitoParseado) {
  const factor = remito.ajustePct != null ? 1 + remito.ajustePct / 100 : 1;
  return remito.lineas.map((linea) => ({
    ...linea,
    costoLista: linea.total,
    costoConAjuste: linea.total * factor,
    unitarioConAjuste: linea.precioUnitario * factor,
  }));
}
