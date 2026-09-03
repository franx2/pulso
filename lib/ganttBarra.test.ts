import assert from "node:assert";
import { posicionBarra } from "./ganttBarra";

const casi = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// Local 09:00-23:00 (14h de ventana), turno 09:00-17:00: arranca en el borde
// izquierdo y ocupa 8/14 del ancho.
const r1 = posicionBarra("09:00", "23:00", "09:00", "17:00");
assert.ok(r1);
assert.ok(casi(r1!.leftPct, 0));
assert.ok(casi(r1!.widthPct, (8 / 14) * 100), `esperaba ${(8 / 14) * 100}, dio ${r1!.widthPct}`);

// Turno a mitad del día: 13:00-15:00 dentro de 09:00-23:00.
const r2 = posicionBarra("09:00", "23:00", "13:00", "15:00");
assert.ok(r2);
assert.ok(casi(r2!.leftPct, (4 / 14) * 100));
assert.ok(casi(r2!.widthPct, (2 / 14) * 100));

// Turno que llega hasta el cierre exacto: 20:00-23:00.
const r3 = posicionBarra("09:00", "23:00", "20:00", "23:00");
assert.ok(r3);
assert.ok(casi(r3!.leftPct + r3!.widthPct, 100), "debe llegar justo al borde derecho");

// Turno completamente antes de abrir: no se dibuja.
assert.strictEqual(posicionBarra("09:00", "23:00", "05:00", "08:00"), null);

// Turno completamente después de cerrar: no se dibuja.
assert.strictEqual(posicionBarra("09:00", "23:00", "23:30", "23:59"), null);

// Turno que empieza antes de abrir pero sigue trabajando cuando abre: se
// recorta al borde izquierdo, no se descarta.
const r4 = posicionBarra("09:00", "23:00", "07:00", "11:00");
assert.ok(r4);
assert.ok(casi(r4!.leftPct, 0), "se recorta contra el borde de apertura");
assert.ok(casi(r4!.widthPct, (2 / 14) * 100), "sólo cuentan las 2h dentro de la ventana");

// Local que cruza medianoche (boliche 20:00-02:00, 6h de ventana), turno normal.
const r5 = posicionBarra("20:00", "02:00", "22:00", "01:00");
assert.ok(r5);
assert.ok(casi(r5!.leftPct, (2 / 6) * 100));
assert.ok(casi(r5!.widthPct, (3 / 6) * 100));

// Turno que en sí mismo cruza medianoche dentro de un local de horario normal.
const r6 = posicionBarra("09:00", "23:00", "22:00", "02:00");
assert.ok(r6);
// De 22:00 a 23:00 (cierre) son 1h de las 14h de ventana; el resto (22-2) cae afuera.
assert.ok(casi(r6!.leftPct, (13 / 14) * 100));
assert.ok(casi(r6!.widthPct, (1 / 14) * 100));

// Turno que ocupa toda la ventana.
const r7 = posicionBarra("09:00", "23:00", "09:00", "23:00");
assert.ok(r7);
assert.ok(casi(r7!.leftPct, 0));
assert.ok(casi(r7!.widthPct, 100));

console.log("lib/ganttBarra.test.ts: todos los checks pasaron");
