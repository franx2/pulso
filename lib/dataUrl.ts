const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp"];

/** Tope de una foto ya redimensionada en el navegador. */
export const MAX_IMAGEN_BYTES = 2 * 1024 * 1024;

export type ImagenSubida = { tipo: string; datos: Uint8Array<ArrayBuffer> };

/**
 * Lee una imagen mandada como data URL (`data:image/jpeg;base64,...`).
 *
 * Devuelve null si no es una imagen válida, si el tipo no está permitido o si
 * pesa de más. Se usa tanto para los certificados de ausencia como para las
 * fotos de rostro.
 */
export function leerDataUrl(url: string, maxBytes = MAX_IMAGEN_BYTES): ImagenSubida | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (!m || !TIPOS_IMAGEN.includes(m[1])) return null;

  try {
    const buf = Buffer.from(m[2], "base64");
    if (buf.byteLength === 0 || buf.byteLength > maxBytes) return null;
    // Copia a un ArrayBuffer propio: el Buffer de Node comparte un pool.
    const datos = new Uint8Array(new ArrayBuffer(buf.byteLength));
    datos.set(buf);
    return { tipo: m[1], datos };
  } catch {
    return null;
  }
}
