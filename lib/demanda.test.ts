import assert from "node:assert";
import { agregarPorDiaHora } from "./demanda";

// Dos semanas exactas: cada día de semana ocurre 2 veces.
const desde = new Date("2026-06-01T00:00:00.000Z"); // lunes
const hasta = new Date("2026-06-15T00:00:00.000Z"); // 14 días después

// 4 ventas un lunes a las 10hs (dos lunes distintos), 1 sola el otro lunes.
const ventas = [
  { createdAt: "2026-06-01T10:15:00.000Z" }, // lunes 1, 10hs
  { createdAt: "2026-06-01T10:45:00.000Z" }, // lunes 1, 10hs
  { createdAt: "2026-06-08T10:00:00.000Z" }, // lunes 2, 10hs
  { createdAt: "2026-06-08T14:00:00.000Z" }, // lunes 2, 14hs
];

const franjas = agregarPorDiaHora(ventas, desde, hasta);

// Lunes (1) a las 10hs: 3 ventas en 2 ocurrencias = 1.5 promedio.
const lunes10 = franjas.find((f) => f.diaSemana === 1 && f.hora === 10);
assert.ok(lunes10, "debe existir la franja lunes 10hs");
assert.strictEqual(lunes10!.ventasProm, 1.5);

// Lunes a las 14hs: 1 venta en 2 ocurrencias = 0.5 promedio.
const lunes14 = franjas.find((f) => f.diaSemana === 1 && f.hora === 14);
assert.strictEqual(lunes14!.ventasProm, 0.5);

// Un día sin ninguna venta no aparece en el resultado (no se infla con ceros).
const martes = franjas.filter((f) => f.diaSemana === 2);
assert.strictEqual(martes.length, 0);

// Una venta justo en el borde derecho (exclusivo) no cuenta.
const bordeExcluido = agregarPorDiaHora(
  [{ createdAt: hasta.toISOString() }],
  desde,
  hasta
);
assert.strictEqual(bordeExcluido.length, 0, "el borde derecho del rango es exclusivo");

console.log("lib/demanda.test.ts: todos los checks pasaron");
