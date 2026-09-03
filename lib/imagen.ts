const LADO_MAXIMO = 1400;
const CALIDAD = 0.82;

/**
 * Achica una foto en el navegador antes de subirla.
 *
 * Una foto de celular son 3–6 MB; el certificado de un médico se lee perfecto
 * con 1400 px de lado. Esto la deja en 150–400 KB, así que el pedido entra sin
 * problema y no hace falta almacenamiento externo.
 */
export async function achicarImagen(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", CALIDAD);
}
