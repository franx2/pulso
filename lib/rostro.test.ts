import assert from "node:assert";
import {
  bytesADescriptor,
  descriptorABytes,
  descriptorDesdeJson,
  distanciaRostros,
  LARGO_DESCRIPTOR,
} from "./rostro";

const random = (semilla: number) => {
  // Generador determinista para que el test no dependa del azar.
  let s = semilla;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648 - 0.5;
  };
};

const descriptorDe = (semilla: number) => {
  const r = random(semilla);
  return Float32Array.from({ length: LARGO_DESCRIPTOR }, () => r());
};

// La misma cara contra sí misma: distancia cero.
const cara = descriptorDe(1);
assert.strictEqual(distanciaRostros(cara, cara), 0, "el mismo descriptor debe dar distancia 0");

// Dos caras distintas: bien por encima de cualquier tolerancia razonable.
const otra = descriptorDe(999);
assert.ok(
  distanciaRostros(cara, otra) > 0.6,
  `dos caras distintas deberían superar 0.6, dio ${distanciaRostros(cara, otra)}`
);

// La misma cara con ruido chico (otra luz, otro ángulo): sigue cerca.
const conRuido = Float32Array.from(cara, (v) => v + 0.01);
assert.ok(
  distanciaRostros(cara, conRuido) < 0.55,
  `la misma cara con variación leve debe caer bajo la tolerancia, dio ${distanciaRostros(cara, conRuido)}`
);

// Largos distintos no explotan: se tratan como no coincidencia.
assert.strictEqual(
  distanciaRostros(cara, new Float32Array(10)),
  Number.POSITIVE_INFINITY,
  "un descriptor de otro largo nunca puede dar match"
);

// Ida y vuelta por la base: el descriptor sobrevive intacto.
const bytes = descriptorABytes(cara);
assert.strictEqual(bytes.byteLength, LARGO_DESCRIPTOR * 4);
const vuelta = bytesADescriptor(bytes);
assert.ok(vuelta !== null, "debería poder leerse de vuelta");
assert.strictEqual(distanciaRostros(cara, vuelta!), 0, "el ida y vuelta no debe perder precisión");

// Datos corruptos o ausentes: null, sin romper.
assert.strictEqual(bytesADescriptor(null), null);
assert.strictEqual(bytesADescriptor(new Uint8Array(7)), null, "un largo inválido debe dar null");

// --- Validación de lo que manda el navegador ---

const valido = Array.from({ length: LARGO_DESCRIPTOR }, (_, i) => (i % 10) / 20);
assert.ok(descriptorDesdeJson(valido) !== null, "un descriptor bien formado se acepta");

assert.strictEqual(descriptorDesdeJson(null), null);
assert.strictEqual(descriptorDesdeJson("no soy un array"), null);
assert.strictEqual(descriptorDesdeJson([1, 2, 3]), null, "largo incorrecto se rechaza");
assert.strictEqual(
  descriptorDesdeJson(Array(LARGO_DESCRIPTOR).fill("x")),
  null,
  "valores no numéricos se rechazan"
);
assert.strictEqual(
  descriptorDesdeJson(Array(LARGO_DESCRIPTOR).fill(NaN)),
  null,
  "NaN se rechaza: envenenaría la distancia"
);
assert.strictEqual(
  descriptorDesdeJson(Array(LARGO_DESCRIPTOR).fill(1e9)),
  null,
  "valores absurdos se rechazan"
);

// Un descriptor de puros ceros pasa la validación de forma pero queda lejos de
// cualquier cara real: no sirve como llave maestra.
const ceros = descriptorDesdeJson(Array(LARGO_DESCRIPTOR).fill(0));
assert.ok(ceros !== null);
assert.ok(
  distanciaRostros(cara, ceros!) > 0.55,
  "un descriptor vacío no puede hacerse pasar por una cara registrada"
);

console.log("lib/rostro.test.ts: todos los checks pasaron");
