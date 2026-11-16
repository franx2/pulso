import assert from "node:assert";
import { choca, primerLugarLibre, tamanoGrilla, type MesaPlano } from "./plano";

// El Salón de Las Cañas como viene de Fudo: grandes de a dos columnas.
const salon: MesaPlano[] = [
  { id: "1", fila: 0, columna: 0, tamano: "GRANDE" },
  { id: "2", fila: 0, columna: 2, tamano: "GRANDE" },
  { id: "5", fila: 0, columna: 8, tamano: "GRANDE" },
  { id: "6", fila: 1, columna: 8, tamano: "GRANDE" },
  { id: "7", fila: 2, columna: 0, tamano: "GRANDE" },
];

// Las mesas 5 y 6 están en filas contiguas: no se pisan (antes se dibujaban superpuestas).
assert.strictEqual(choca(salon, salon[3]), false);
// Una grande corrida una columna pisa a su vecina; una chica en el hueco no.
assert.strictEqual(choca(salon, { id: "2", fila: 0, columna: 1, tamano: "GRANDE" }), true);
assert.strictEqual(choca(salon, { id: "x", fila: 0, columna: 4, tamano: "CHICA" }), false);
// Moverse sobre sí misma no es chocar; salirse de la grilla sí.
assert.strictEqual(choca(salon, { id: "1", fila: 0, columna: 1, tamano: "GRANDE" }), true, "pisa la 2");
assert.strictEqual(choca(salon, { id: "7", fila: 2, columna: 1, tamano: "GRANDE" }), false, "corrida sobre su propio lugar");
assert.strictEqual(choca(salon, { id: "x", fila: -1, columna: 0, tamano: "CHICA" }), true);

// Una mesa nueva va al primer hueco, sin pisar.
assert.deepStrictEqual(primerLugarLibre(salon, "GRANDE", 10), { fila: 0, columna: 4 });
assert.deepStrictEqual(primerLugarLibre([], "CHICA", 10), { fila: 0, columna: 0 });
assert.deepStrictEqual(tamanoGrilla(salon), { filas: 3, columnas: 10 });

console.log("lib/ventas/plano.test.ts: todos los checks pasaron");
