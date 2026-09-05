/**
 * PDF → texto con columnas, sin binarios externos.
 *
 * El parser de remitos (`lib/compras/remito.ts`) lee columnas separadas por
 * espacios, como las devuelve `pdftotext -layout`. Ese binario no existe en
 * Vercel, y las librerías de JS devuelven los fragmentos sueltos con sus
 * coordenadas y sin ningún espaciado: concatenarlos pegaría el precio con el
 * nombre del producto y el parser no reconocería una sola línea.
 *
 * Así que acá se reconstruye la grilla a partir de las posiciones: se agrupan
 * los fragmentos por su coordenada Y (un renglón) y se los ubica en la X que
 * les corresponde. El resultado es equivalente a `-layout`, y por eso los
 * fixtures del test —generados con pdftotext— siguen sirviendo de referencia.
 */

import { extractText, getDocumentProxy } from "unpdf";

/**
 * Ancho de carácter en puntos PDF, para pasar de coordenada a columna.
 *
 * El remito sale en una monoespaciada de ~6 pt. No hace falta que sea exacto:
 * el parser sólo necesita que entre columnas queden dos o más espacios y que
 * no se peguen fragmentos que en el papel están separados.
 */
const ANCHO_CARACTER = 6;

/** Diferencia en Y por debajo de la cual dos fragmentos son el mismo renglón. */
const TOLERANCIA_RENGLON = 3;

type Fragmento = { texto: string; x: number; y: number };

/** Ordena los fragmentos de una página en renglones y los espacia por su X. */
function reconstruirPagina(fragmentos: Fragmento[]): string {
  const renglones: { y: number; partes: Fragmento[] }[] = [];

  for (const fragmento of fragmentos) {
    if (fragmento.texto.trim().length === 0) continue;
    // Los PDF no garantizan orden de lectura, así que cada fragmento busca su
    // renglón por cercanía en vez de asumir que vienen en orden.
    const renglon = renglones.find((r) => Math.abs(r.y - fragmento.y) <= TOLERANCIA_RENGLON);
    if (renglon) renglon.partes.push(fragmento);
    else renglones.push({ y: fragmento.y, partes: [fragmento] });
  }

  // Y crece hacia arriba en PDF: se ordena descendente para leer de arriba
  // hacia abajo.
  renglones.sort((a, b) => b.y - a.y);

  return renglones
    .map(({ partes }) => {
      partes.sort((a, b) => a.x - b.x);
      let linea = "";
      for (const parte of partes) {
        const columna = Math.round(parte.x / ANCHO_CARACTER);
        // Si el fragmento arranca antes de donde venimos, ya hay texto ahí:
        // se separa con un espacio en vez de pisarlo.
        if (columna > linea.length) linea = linea.padEnd(columna, " ");
        else if (linea.length > 0 && !linea.endsWith(" ")) linea += " ";
        linea += parte.texto;
      }
      return linea.trimEnd();
    })
    .join("\n");
}

/**
 * Devuelve el texto del PDF con las columnas conservadas.
 *
 * Si el PDF es una imagen escaneada no hay texto que sacar y devuelve vacío;
 * quien llama tiene que tratarlo como ilegible, no como un remito sin líneas.
 */
export async function textoDePdf(datos: Uint8Array): Promise<string> {
  const documento = await getDocumentProxy(datos);
  const paginas: string[] = [];

  for (let numero = 1; numero <= documento.numPages; numero++) {
    const pagina = await documento.getPage(numero);
    const contenido = await pagina.getTextContent();
    const fragmentos: Fragmento[] = [];
    for (const item of contenido.items) {
      if (!("str" in item) || typeof item.str !== "string") continue;
      // transform = [a, b, c, d, e, f]; e y f son la posición.
      const [, , , , x, y] = item.transform as number[];
      fragmentos.push({ texto: item.str, x, y });
    }
    paginas.push(reconstruirPagina(fragmentos));
  }

  const texto = paginas.join("\n");
  // Respaldo: si la reconstrucción no dio nada (PDF raro), al menos se
  // devuelve el texto plano para que el error diga algo útil.
  if (texto.trim().length === 0) {
    const { text } = await extractText(datos, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  return texto;
}
