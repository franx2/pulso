/**
 * Comparación de rostros.
 *
 * El navegador calcula el descriptor (128 floats) con face-api y lo manda; la
 * comparación se hace acá, en el servidor. Es a propósito: si el navegador
 * decidiera si la cara coincide, alcanzaría con editar un `true` para saltear
 * el control. Falsificar un descriptor de 128 dimensiones que caiga cerca del
 * guardado es bastante más trabajo que eso.
 */

export const LARGO_DESCRIPTOR = 128;

/** Estándar del modelo de face-api; por debajo de esto se considera la misma cara. */
export const TOLERANCIA_POR_DEFECTO = 0.55;

/** Distancia euclídea entre dos descriptores: más chica, más parecidos. */
export function distanciaRostros(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let suma = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    suma += d * d;
  }
  return Math.sqrt(suma);
}

/** Serializa el descriptor para guardarlo como Bytes en Postgres. */
export function descriptorABytes(d: Float32Array): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(d.length * 4);
  new Float32Array(buf).set(d);
  return new Uint8Array(buf);
}

/** Lee el descriptor guardado. Devuelve null si el dato está corrupto. */
export function bytesADescriptor(bytes: Uint8Array | null | undefined): Float32Array | null {
  if (!bytes || bytes.byteLength !== LARGO_DESCRIPTOR * 4) return null;
  // Copia a un buffer propio y alineado: el de Postgres puede venir con offset.
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new Float32Array(buf);
}

/**
 * Valida lo que mandó el navegador antes de tocarlo.
 * Los descriptores de face-api son valores chicos alrededor de cero.
 */
export function descriptorDesdeJson(valor: unknown): Float32Array | null {
  if (!Array.isArray(valor) || valor.length !== LARGO_DESCRIPTOR) return null;
  const out = new Float32Array(LARGO_DESCRIPTOR);
  for (let i = 0; i < LARGO_DESCRIPTOR; i++) {
    const n = valor[i];
    if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 10) return null;
    out[i] = n;
  }
  return out;
}
