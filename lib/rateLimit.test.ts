import assert from "node:assert";
import { intentoBloqueado, limpiarIntentos, registrarIntentoFallido } from "./rateLimit";

const clave = "test:" + Math.random();

assert.ok(!intentoBloqueado(clave), "sin intentos previos no está bloqueado");

for (let i = 0; i < 7; i++) registrarIntentoFallido(clave);
assert.ok(!intentoBloqueado(clave), "7 intentos fallidos todavía no bloquean (tope 8)");

registrarIntentoFallido(clave); // 8º intento
assert.ok(intentoBloqueado(clave), "al 8º intento fallido se bloquea");

limpiarIntentos(clave);
assert.ok(!intentoBloqueado(clave), "un login exitoso limpia el bloqueo");

// Claves distintas no se pisan entre sí.
const otra = "test:" + Math.random();
for (let i = 0; i < 8; i++) registrarIntentoFallido(clave);
assert.ok(intentoBloqueado(clave));
assert.ok(!intentoBloqueado(otra), "el bloqueo de un usuario no afecta a otro");

console.log("lib/rateLimit.test.ts: todos los checks pasaron");
