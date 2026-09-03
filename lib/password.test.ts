import assert from "node:assert";
import { hashPassword, passwordValida, verificarPassword } from "./password";

// La contraseña correcta verifica.
const guardado = hashPassword("unaClaveSegura123");
assert.ok(verificarPassword("unaClaveSegura123", guardado));

// Una incorrecta no.
assert.ok(!verificarPassword("otraClave456", guardado));

// El hash nunca contiene la contraseña en texto plano.
assert.ok(!guardado.includes("unaClaveSegura123"));

// Dos hashes de la misma contraseña son distintos (salt al azar), pero ambos verifican.
const guardado2 = hashPassword("unaClaveSegura123");
assert.notStrictEqual(guardado, guardado2, "el salt debe variar entre hashes");
assert.ok(verificarPassword("unaClaveSegura123", guardado2));

// Sin contraseña guardada, nunca verifica (no explota).
assert.ok(!verificarPassword("cualquiera", null));

// Datos corruptos no rompen, sólo fallan la verificación.
assert.ok(!verificarPassword("x", "no-tiene-el-formato-esperado"));
// Hex inválido/corto: Buffer.from lo trunca en vez de tirar error, así que
// dos strings basura podrían decodificar como buffers vacíos que "empatan".
// El chequeo de longitud exacta tiene que evitar que esto pase.
assert.ok(!verificarPassword("x", "scrypt:noEsHex:tampoco"));
assert.ok(!verificarPassword("", "scrypt::"));

// Validación de longitud mínima.
assert.ok(passwordValida("12345678"));
assert.ok(!passwordValida("1234567"));
assert.ok(!passwordValida(""));

console.log("lib/password.test.ts: todos los checks pasaron");
