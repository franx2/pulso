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

/**
 * Todas las entradas son instantes absolutos ("...Z") y todas las
 * afirmaciones son sobre instantes absolutos.
 *
 * Eso es a propósito y es el punto del archivo: la versión anterior de estos
 * checks construía fechas con `new Date(2026, 7, 28)` y las verificaba con
 * `.getDate()` — local adentro, local afuera. Pasaban en cualquier zona
 * horaria, incluso mientras producción estaba corrida 21 horas. Un test que
 * no puede fallar en UTC no protege nada acá.
 */

// 18:42Z es 15:42 en Argentina: mismo día calendario.
const tarde = new Date("2026-08-28T18:42:10.000Z");
assert.strictEqual(inicioDelDia(tarde).toISOString(), "2026-08-28T03:00:00.000Z");
assert.strictEqual(finDelDia(tarde).toISOString(), "2026-08-29T02:59:59.999Z");

// EL BUG: 02:27Z del 5 de septiembre son las 23:27 del 4 en Argentina. El día
// que se está trabajando es el 4, no el 5. Con getters locales en un proceso
// UTC esto daba 2026-09-05T00:00:00Z: 21 horas de corrimiento.
const casiMedianocheAR = new Date("2026-09-05T02:27:40.000Z");
assert.strictEqual(
  inicioDelDia(casiMedianocheAR).toISOString(),
  "2026-09-04T03:00:00.000Z",
  "las 23:27 argentinas todavía pertenecen al día anterior en UTC"
);
assert.strictEqual(claveDia(casiMedianocheAR), "2026-09-04");
assert.strictEqual(comoFechaSql(casiMedianocheAR).toISOString(), "2026-09-04T00:00:00.000Z");

// El rango de un día cubre cualquier instante de ese día, incluidos los bordes.
const inicio = inicioDelDia(tarde);
const fin = finDelDia(tarde);
assert.ok(inicio <= tarde && tarde <= fin, "un instante del día cae dentro del rango");
assert.ok(new Date("2026-08-29T02:59:59.500Z") <= fin, "23:59:59.5 argentinas siguen siendo del día");
assert.ok(new Date("2026-08-29T03:00:00.000Z") > fin, "la medianoche argentina siguiente quedó afuera");

// El primer instante del día también entra: el borde de abajo es inclusivo.
assert.ok(inicioDelDia(inicio).getTime() === inicio.getTime(), "el arranque del día es idempotente");

// desdeISO interpreta el texto como día ARGENTINO, no como medianoche UTC.
assert.strictEqual(desdeISO("2026-08-28").toISOString(), "2026-08-28T03:00:00.000Z");
assert.strictEqual(claveDia(desdeISO("2026-08-28")), "2026-08-28", "ida y vuelta sin corrimiento");

// comoFechaSql da medianoche UTC del día argentino, que es como Prisma
// devuelve los campos @db.Date.
assert.strictEqual(comoFechaSql(tarde).toISOString(), "2026-08-28T00:00:00.000Z");

// Un instante de la mañana y otro de la noche del mismo día argentino
// comparten clave, aunque en UTC caigan en días distintos.
assert.strictEqual(claveDia(new Date("2026-08-28T12:00:00.000Z")), "2026-08-28");
assert.strictEqual(claveDia(new Date("2026-08-29T02:00:00.000Z")), "2026-08-28");
assert.strictEqual(claveDia(new Date("2026-08-29T03:00:00.000Z")), "2026-08-29");

// Meses y días de un dígito se rellenan con cero.
assert.strictEqual(claveDia(new Date("2026-01-05T15:00:00.000Z")), "2026-01-05");

// Cruce de año: las 22:00 del 31 de diciembre siguen siendo del año viejo.
assert.strictEqual(claveDia(new Date("2026-01-01T01:00:00.000Z")), "2025-12-31");

// Un @db.Date serializado se muestra con SU día calendario, no corrido por la
// zona horaria: en UTC-3, formatear "2026-08-28T00:00:00Z" a secas daría 27.
const soloDia: Intl.DateTimeFormatOptions = { day: "numeric", month: "numeric", year: "numeric" };
assert.strictEqual(formatearFechaSql("2026-08-28T00:00:00.000Z", soloDia), "28/8/2026");

// Y lo mismo cruzando el año, que es donde más duele equivocarse.
assert.strictEqual(formatearFechaSql("2026-01-01T00:00:00.000Z", soloDia), "1/1/2026");

// Ida y vuelta: guardar un día argentino y volver a mostrarlo da el mismo día.
assert.strictEqual(
  formatearFechaSql(comoFechaSql(new Date("2026-08-28T18:00:00.000Z")).toISOString(), soloDia),
  "28/8/2026"
);

// claveFechaSql lee el día calendario de un @db.Date: no lo corre un día.
assert.strictEqual(claveFechaSql(new Date("2026-05-01T00:00:00.000Z")), "2026-05-01");
assert.strictEqual(claveFechaSql(new Date("2026-01-01T00:00:00.000Z")), "2026-01-01");

// --- Semana ISO ---

// La semana va de lunes a domingo: los 7 días comparten clave.
// 2026-08-24 es lunes. Se toma el mediodía argentino de cada día.
const alMediodiaAR = (dia: string) => new Date(`${dia}T15:00:00.000Z`);
const semanaDelLunes = claveSemana(alMediodiaAR("2026-08-24"));
for (let i = 0; i < 7; i++) {
  const dia = `2026-08-${24 + i}`;
  assert.strictEqual(
    claveSemana(alMediodiaAR(dia)),
    semanaDelLunes,
    `${dia} debería caer en la misma semana que el lunes 24`
  );
}

// El lunes siguiente ya es otra semana.
assert.notStrictEqual(claveSemana(alMediodiaAR("2026-08-31")), semanaDelLunes);

// El domingo pertenece a la semana que arrancó el lunes anterior, no a la próxima.
assert.strictEqual(claveSemana(alMediodiaAR("2026-08-30")), semanaDelLunes, "el domingo cierra la semana");

// Un fichaje de las 23:30 del domingo (02:30Z del lunes) sigue siendo de la
// semana que cierra, no de la que arranca: es el mismo criterio que el día.
assert.strictEqual(claveSemana(new Date("2026-08-31T02:30:00.000Z")), semanaDelLunes);

// Formato esperado.
assert.match(semanaDelLunes, /^\d{4}-W\d{2}$/);

// Cruce de año: el 31 de diciembre y el 1 de enero pueden compartir semana ISO.
// 2025-12-31 es miércoles, así que esa semana incluye el 1 de enero de 2026.
assert.strictEqual(
  claveSemana(alMediodiaAR("2025-12-31")),
  claveSemana(alMediodiaAR("2026-01-01")),
  "el fin de año no debe partir la semana en dos"
);
assert.strictEqual(claveSemana(alMediodiaAR("2025-12-31")), "2026-W01");

// El 1 de enero que cae domingo pertenece a la última semana del año anterior.
// 2023-01-01 fue domingo.
assert.strictEqual(claveSemana(alMediodiaAR("2023-01-01")), "2022-W52");

console.log("lib/fechas.test.ts: todos los checks pasaron");
