import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash de contraseñas con scrypt, de la librería estándar de Node.
 *
 * Sin bcrypt: scrypt ya está en `node:crypto`, es igual de apto para esto
 * (memory-hard, resistente a fuerza bruta por GPU) y ahorra una dependencia.
 */

const KEYLEN = 64;

/** Formato guardado: "scrypt:saltHex:hashHex". */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

const HEX_VALIDO = /^[0-9a-f]+$/i;

/** Comparación en tiempo constante: evita que la duración delate si acertó. */
export function verificarPassword(password: string, guardado: string | null): boolean {
  if (!guardado) return false;
  const [algo, saltHex, hashHex] = guardado.split(":");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;

  // Hex inválido o truncado hace que Buffer.from devuelva un buffer corto (o
  // vacío) en vez de tirar error; sin este chequeo, dos hashes corruptos de
  // longitud 0 "coinciden" y la verificación pasa igual. Se exige el largo
  // exacto que produce hashPassword, no cualquier hex parseable.
  if (
    saltHex.length !== 32 ||
    hashHex.length !== KEYLEN * 2 ||
    !HEX_VALIDO.test(saltHex) ||
    !HEX_VALIDO.test(hashHex)
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, "hex");
    const esperado = Buffer.from(hashHex, "hex");
    const calculado = scryptSync(password, salt, esperado.length);
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

export function passwordValida(password: string): boolean {
  return typeof password === "string" && password.length >= 8;
}
