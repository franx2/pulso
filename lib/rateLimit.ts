/**
 * Límite de intentos en memoria, sólo para el login por contraseña.
 *
 * El passkey no lo necesita: cada intento fallido ya exige tener el
 * dispositivo físico. La contraseña sí es de fuerza bruta.
 *
 * ponytail: mapa en memoria de un solo proceso — si el servicio escala a
 * varias instancias, esto deja de limitar entre ellas. Mover a la DB o a
 * Redis con TTL si eso pasa.
 */

type Estado = { cantidad: number; primerIntentoEn: number; bloqueadoHasta: number };

const intentos = new Map<string, Estado>();

const MAX_INTENTOS = 8;
const VENTANA_MS = 10 * 60 * 1000;

export function intentoBloqueado(clave: string): boolean {
  const e = intentos.get(clave);
  return Boolean(e && e.bloqueadoHasta > Date.now());
}

export function registrarIntentoFallido(clave: string): void {
  const ahora = Date.now();
  const e = intentos.get(clave);

  // Sin historial, o el primer intento de la racha ya quedó viejo: arranca
  // una ventana nueva. `bloqueadoHasta` nunca sirve para esto: empieza en 0.
  if (!e || ahora - e.primerIntentoEn > VENTANA_MS) {
    intentos.set(clave, { cantidad: 1, primerIntentoEn: ahora, bloqueadoHasta: 0 });
    return;
  }

  const cantidad = e.cantidad + 1;
  intentos.set(clave, {
    cantidad,
    primerIntentoEn: e.primerIntentoEn,
    bloqueadoHasta: cantidad >= MAX_INTENTOS ? ahora + VENTANA_MS : 0,
  });
}

export function limpiarIntentos(clave: string): void {
  intentos.delete(clave);
}
