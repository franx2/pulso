import assert from "node:assert";
import {
  claveDia,
  claveFechaSql,
  claveSemana,
  comoFechaSql,
  desdeISO,
  finDelDia,
  formatearFechaSql,
  inicioDelDia,
} from "./fechas";

// El día local arranca a las 00:00 y termina a las 23:59:59.999 locales.
const unMomento = new Date(2026, 7, 28, 15, 42, 10);
assert.strictEqual(inicioDelDia(unMomento).getHours(), 0);
assert.strictEqual(inicioDelDia(unMomento).getDate(), 28);
assert.strictEqual(finDelDia(unMomento).getHours(), 23);
assert.strictEqual(finDelDia(unMomento).getMilliseconds(), 999);

// El rango de un día cubre cualquier instante de ese día, incluidos los bordes.
const inicio = inicioDelDia(unMomento);
const fin = finDelDia(unMomento);
assert.ok(inicio <= unMomento && unMomento <= fin, "un instante del día cae dentro del rango");
const casiMedianoche = new Date(2026, 7, 28, 23, 59, 59, 500);
assert.ok(casiMedianoche <= fin, "23:59:59.5 todavía es del mismo día");
const yaEsManana = new Date(2026, 7, 29, 0, 0, 0, 0);
assert.ok(yaEsManana > fin, "la medianoche siguiente ya quedó afuera");

// desdeISO interpreta el texto como día LOCAL, no como medianoche UTC: este era
// el bug que dejaba los reportes vacíos.
const local = desdeISO("2026-08-28");
assert.strictEqual(local.getFullYear(), 2026);
assert.strictEqual(local.getMonth(), 7);
assert.strictEqual(local.getDate(), 28);
assert.strictEqual(local.getHours(), 0);

// comoFechaSql da medianoche UTC del mismo día calendario, que es como Prisma
// devuelve los campos @db.Date.
const sql = comoFechaSql(unMomento);
assert.strictEqual(sql.toISOString(), "2026-08-28T00:00:00.000Z");

// Un instante de la tarde y otro de la mañana del mismo día comparten clave.
assert.strictEqual(claveDia(new Date(2026, 7, 28, 2, 0)), "2026-08-28");
assert.strictEqual(claveDia(new Date(2026, 7, 28, 22, 0)), "2026-08-28");
assert.notStrictEqual(claveDia(new Date(2026, 7, 29, 2, 0)), "2026-08-28");

// Meses y días de un dígito se rellenan con cero.
assert.strictEqual(claveDia(new Date(2026, 0, 5, 12, 0)), "2026-01-05");

// Un @db.Date serializado se muestra con SU día calendario, no corrido por la
// zona horaria: en UTC-3, formatear "2026-08-28T00:00:00Z" a secas daría 27.
// Se comparan las partes y no el texto, que depende del locale del sistema.
const soloDia: Intl.DateTimeFormatOptions = { day: "numeric", month: "numeric", year: "numeric" };
assert.strictEqual(
  formatearFechaSql("2026-08-28T00:00:00.000Z", soloDia),
  new Date(2026, 7, 28).toLocaleDateString("es-AR", soloDia),
  "un @db.Date del 28 debe mostrarse como 28, no como 27"
);

// Y lo mismo cruzando el año, que es donde más duele equivocarse.
assert.strictEqual(
  formatearFechaSql("2026-01-01T00:00:00.000Z", soloDia),
  new Date(2026, 0, 1).toLocaleDateString("es-AR", soloDia),
  "el 1 de enero no puede caer en diciembre del año anterior"
);

// Ida y vuelta: guardar un día local y volver a mostrarlo da el mismo día.
const guardado = comoFechaSql(new Date(2026, 7, 28, 15, 0)).toISOString();
assert.strictEqual(
  formatearFechaSql(guardado, soloDia),
  new Date(2026, 7, 28).toLocaleDateString("es-AR", soloDia)
);

// claveFechaSql lee el día calendario de un @db.Date con getters UTC: no lo
// corre un día en una zona al oeste de Greenwich (Argentina, UTC-3).
assert.strictEqual(claveFechaSql(new Date("2026-05-01T00:00:00.000Z")), "2026-05-01");
assert.strictEqual(claveFechaSql(new Date("2026-01-01T00:00:00.000Z")), "2026-01-01");

// --- Semana ISO ---

// La semana va de lunes a domingo: los 7 días comparten clave.
// 2026-08-24 es lunes.
const semanaDelLunes = claveSemana(new Date(2026, 7, 24));
for (let i = 0; i < 7; i++) {
  assert.strictEqual(
    claveSemana(new Date(2026, 7, 24 + i)),
    semanaDelLunes,
    `el día ${24 + i} debería caer en la misma semana que el lunes 24`
  );
}

// El lunes siguiente ya es otra semana.
assert.notStrictEqual(claveSemana(new Date(2026, 7, 31)), semanaDelLunes);

// El domingo pertenece a la semana que arrancó el lunes anterior, no a la próxima.
assert.strictEqual(claveSemana(new Date(2026, 7, 30)), semanaDelLunes, "el domingo cierra la semana");

// Formato esperado.
assert.match(semanaDelLunes, /^\d{4}-W\d{2}$/);

// Cruce de año: el 31 de diciembre y el 1 de enero pueden compartir semana ISO.
// 2025-12-31 es miércoles, así que esa semana incluye el 1 de enero de 2026.
assert.strictEqual(
  claveSemana(new Date(2025, 11, 31)),
  claveSemana(new Date(2026, 0, 1)),
  "el fin de año no debe partir la semana en dos"
);

console.log("lib/fechas.test.ts: todos los checks pasaron");
