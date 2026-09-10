/**
 * Extracto bancario: categorización y lectura del CSV que exporta el banco.
 *
 * Sirve para conciliar lo que Fudo dice que se cobró por tarjeta y
 * transferencia contra lo que de verdad entró a la cuenta. El extracto llega
 * por Nave (el agregador de pagos): liquida tarjeta, débito, Mercado Pago,
 * QR y posnet todo junto como "PAGO CON TARJETA", y las transferencias
 * aparte como "PAGO CON TRANSFERENCIA". Los pagos de Pedidos Ya y Uber Eats
 * NO pasan por acá — liquidan a otra cuenta — así que quedan afuera de la
 * conciliación de este extracto a propósito.
 */

export type CategoriaBancaria = "TARJETA" | "TRANSFERENCIA" | "IMPUESTO_COMISION" | "OTRO";

export type MovimientoBanco = {
  fecha: string;
  descripcion: string;
  referencia: string | null;
  categoria: CategoriaBancaria;
  credito: number;
  debito: number;
  saldo: number | null;
};

/**
 * A qué categoría pertenece un renglón, por su descripción.
 *
 * El orden importa: "PAGO CON TARJETA" tiene que ganarle a una coincidencia
 * más genérica. Basado en un extracto real de Banco Galicia con Nave como
 * procesador — otro banco u otro procesador puede escribirlo distinto, y
 * esas líneas van a cuenta como "Otro" (visible, no perdido) hasta que se
 * sume el patrón que corresponda.
 */
export function categoriaDe(descripcion: string): CategoriaBancaria {
  const texto = descripcion.toUpperCase();

  if (/PAGO CON TARJETA/.test(texto)) return "TARJETA";
  if (/PAGO CON TRANSFERENCIA/.test(texto)) return "TRANSFERENCIA";

  // Impuestos y comisiones del banco: nunca es una venta.
  if (/^IMP\.|COMISION|^IVA\b|PERCEP\./.test(texto)) return "IMPUESTO_COMISION";

  // Una transferencia recibida que no vino de Nave (un cliente que transfirió
  // directo, por ejemplo) sigue siendo una transferencia de venta.
  if (/CREDITO TRANSFERENCIA/.test(texto)) return "TRANSFERENCIA";

  return "OTRO";
}

const MESES_INVALIDOS = new Set(["00"]);

/** "03/08/26" o "03/08/2026" → "2026-08-03". `null` si no es una fecha válida. */
function fechaDeCelda(celda: string): string | null {
  const m = celda.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, dRaw, mRaw, aRaw] = m;
  if (MESES_INVALIDOS.has(mRaw.padStart(2, "0"))) return null;
  const anio = aRaw.length === 2 ? `20${aRaw}` : aRaw;
  const dia = dRaw.padStart(2, "0");
  const mes = mRaw.padStart(2, "0");
  if (Number(mes) < 1 || Number(mes) > 12 || Number(dia) < 1 || Number(dia) > 31) return null;
  return `${anio}-${mes}-${dia}`;
}

/** "10.521,99" / "-8.283,52" / "" → número. Formato argentino: punto de miles, coma decimal. */
function numeroDeCelda(celda: string): number {
  const limpio = celda.trim().replace(/\$/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

/** Delimitador del CSV: ';' si aparece en el encabezado, si no ','. Excel en
 * es-AR exporta con ';' porque la coma ya la usan los números. */
function delimitadorDe(primeraLinea: string): string {
  return primeraLinea.includes(";") ? ";" : ",";
}

/** Separa una línea de CSV respetando comillas, sin depender de una librería. */
function partirLinea(linea: string, delimitador: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      entreComillas = !entreComillas;
    } else if (c === delimitador && !entreComillas) {
      celdas.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  celdas.push(actual);
  return celdas.map((c) => c.trim());
}

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Nombres de columna que puede traer el CSV del banco, por campo. */
const ALIAS: Record<string, string[]> = {
  fecha: ["fecha"],
  descripcion: ["descripcion", "concepto", "detalle", "movimiento"],
  referencia: ["origen", "referencia"],
  debito: ["debito", "debe"],
  credito: ["credito", "haber"],
  saldo: ["saldo", "saldo acumulado"],
};

function indiceDeColumna(encabezado: string[], campo: keyof typeof ALIAS): number {
  const normalizados = encabezado.map(normalizar);
  for (const alias of ALIAS[campo]) {
    const i = normalizados.indexOf(alias);
    if (i >= 0) return i;
  }
  return -1;
}

export class ExtractoIlegible extends Error {}

/**
 * Lee el CSV del banco. Tolera los nombres de columna más comunes y los dos
 * delimitadores que suele usar Excel en español, pero no es universal: si el
 * banco cambia el formato de export, esto tira `ExtractoIlegible` con qué
 * columna faltó, en vez de adivinar.
 */
export function parsearCsvBanco(texto: string): MovimientoBanco[] {
  // BOM de Excel al exportar en UTF-8.
  const limpio = texto.replace(/^﻿/, "");
  const lineas = limpio.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2) throw new ExtractoIlegible("El archivo no tiene filas de datos");

  const delimitador = delimitadorDe(lineas[0]);
  const encabezado = partirLinea(lineas[0], delimitador);

  const iFecha = indiceDeColumna(encabezado, "fecha");
  const iDescripcion = indiceDeColumna(encabezado, "descripcion");
  const iReferencia = indiceDeColumna(encabezado, "referencia");
  const iDebito = indiceDeColumna(encabezado, "debito");
  const iCredito = indiceDeColumna(encabezado, "credito");
  const iSaldo = indiceDeColumna(encabezado, "saldo");

  if (iFecha < 0) throw new ExtractoIlegible("No encontré la columna Fecha");
  if (iDescripcion < 0) throw new ExtractoIlegible("No encontré la columna Descripción/Concepto");
  if (iDebito < 0 && iCredito < 0) {
    throw new ExtractoIlegible("No encontré las columnas de Débito/Crédito");
  }

  const movimientos: MovimientoBanco[] = [];
  for (const linea of lineas.slice(1)) {
    const celdas = partirLinea(linea, delimitador);
    const fecha = fechaDeCelda(celdas[iFecha] ?? "");
    if (!fecha) continue; // Fila de totales, encabezado repetido en otra página, etc.

    const debito = iDebito >= 0 ? Math.abs(numeroDeCelda(celdas[iDebito] ?? "")) : 0;
    const credito = iCredito >= 0 ? Math.abs(numeroDeCelda(celdas[iCredito] ?? "")) : 0;
    if (debito === 0 && credito === 0) continue; // Nada financiero en esta fila.

    const descripcion = (celdas[iDescripcion] ?? "").trim();
    movimientos.push({
      fecha,
      descripcion,
      referencia: iReferencia >= 0 ? celdas[iReferencia]?.trim() || null : null,
      categoria: categoriaDe(descripcion),
      credito,
      debito,
      saldo: iSaldo >= 0 ? numeroDeCelda(celdas[iSaldo] ?? "") : null,
    });
  }

  return movimientos;
}

/**
 * Lee el extracto en PDF (Banco Galicia), para cuando bajar el CSV es más
 * trabajo que bajar el PDF de siempre.
 *
 * El texto llega con las columnas reconstruidas por posición (ver
 * `lib/compras/pdf.ts`), pero cada movimiento se estira a dos o más
 * renglones: uno con fecha, descripción, importe y saldo, y uno o más sueltos
 * abajo con la referencia ("Operación XXXX", el mes al que corresponde un
 * descuento, quién transfirió). Se toman sólo los renglones que empiezan con
 * fecha y traen dos importes —el movimiento y el saldo que queda—; todo lo
 * demás (encabezados repetidos, pie de página, el casillero de datos de la
 * cuenta en la primera página) no calza con ese patrón y queda afuera solo,
 * sin necesidad de una lista de qué ignorar.
 */
const LINEA_CON_FECHA = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+)$/;
const PLATA_EN_LINEA = /-?\d[\d.]*,\d{2}/g;

/** Texto de página que puede aparecer entre dos movimientos y no es referencia de ninguno. */
const ES_TEXTO_DE_PAGINA = [
  /Resumen de Cuenta Corriente en Pesos/i,
  /P[aá]gina\s+\d+\s*\/\s*\d+/i,
  /^Fecha\s+Descripci[oó]n/i,
  // El código del documento que Galicia imprime al pie de cada página
  // ("20260831047001347H"): bastante más largo que un CUIT (11 dígitos) para
  // no confundirse con uno que venga como referencia de una transferencia.
  /^\d{14,}[A-Za-z]?$/,
];

/**
 * Dónde termina la lista de movimientos y empieza el resumen de cierre: una
 * tabla de retenciones del mes, aclaraciones legales y datos de contacto que
 * no tienen fecha y por eso, sin este corte, se le pegaban enteros como
 * "referencia" al último movimiento del extracto.
 */
const ES_FIN_DE_MOVIMIENTOS = [/^Total\s+.*\$/, /Consolidado de retenci[oó]n de impuestos/i];

export function parsearPdfBanco(texto: string): MovimientoBanco[] {
  const movimientos: MovimientoBanco[] = [];
  let actual: MovimientoBanco | null = null;
  let terminado = false;

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    if (terminado) continue;
    if (ES_FIN_DE_MOVIMIENTOS.some((r) => r.test(linea))) {
      terminado = true;
      continue;
    }

    const conFecha = linea.match(LINEA_CON_FECHA);
    if (conFecha) {
      const fecha = fechaDeCelda(conFecha[1]);
      const importes = conFecha[2].match(PLATA_EN_LINEA);
      // Un movimiento real trae el importe del movimiento y el saldo que
      // queda; con menos de dos números no hay nada confiable que leer acá.
      if (fecha && importes && importes.length >= 2) {
        const textoSaldo = importes[importes.length - 1];
        const textoMonto = importes[importes.length - 2];
        const descripcion = conFecha[2].slice(0, conFecha[2].indexOf(textoMonto)).trim();
        const monto = numeroDeCelda(textoMonto);
        actual = {
          fecha,
          descripcion,
          referencia: null,
          categoria: categoriaDe(descripcion),
          credito: monto > 0 ? monto : 0,
          debito: monto < 0 ? -monto : 0,
          saldo: numeroDeCelda(textoSaldo),
        };
        movimientos.push(actual);
        continue;
      }
    }

    // No es un renglón de movimiento: si hay uno abierto y esto no es texto
    // de página, es su referencia (a veces son dos o tres renglones seguidos).
    if (actual && !ES_TEXTO_DE_PAGINA.some((r) => r.test(linea))) {
      actual.referencia = actual.referencia ? `${actual.referencia} · ${linea}` : linea;
    }
  }

  if (movimientos.length === 0) {
    throw new ExtractoIlegible("No encontré ningún movimiento con fecha e importe en el PDF");
  }
  return movimientos;
}
