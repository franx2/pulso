import assert from "node:assert";
import { distanciaMetros } from "./geo";

// Mismo punto: distancia 0.
assert.strictEqual(distanciaMetros(-34.6037, -58.3816, -34.6037, -58.3816), 0);

// 1 grado de latitud son ~111.2 km, en cualquier longitud.
const dLat = distanciaMetros(0, 0, 1, 0);
assert.ok(dLat > 110_000 && dLat < 112_000, `esperaba ~111km, dio ${dLat}`);

// En el ecuador 1 grado de longitud también son ~111.2 km (cos(0) = 1).
const dLng = distanciaMetros(0, 0, 0, 1);
assert.ok(dLng > 110_000 && dLng < 112_000, `esperaba ~111km, dio ${dLng}`);

// Desplazamiento chico (~0.001 grados ~ 111m): debe quedar dentro de un radio típico de 150m.
const dChico = distanciaMetros(-34.6037, -58.3816, -34.6047, -58.3816);
assert.ok(dChico > 50 && dChico < 150, `esperaba ~111m, dio ${dChico}`);

console.log("lib/geo.test.ts: todos los checks pasaron");
