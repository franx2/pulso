import assert from "node:assert";
import { diaDeFechaSql, diasEntre } from "./fechaAR";
import { resolverRango, ultimoDiaDelMes, MAX_DIAS_RANGO } from "./periodo";

/**
 * Comparar contra una ventana incompleta inventa variaciones. Ya pasó tres
 * veces en este proyecto — un local con 6 días sin sincronizar reportó +922%
 * de crecimiento e infló la variación de toda la cadena de +2,4% a +27,7% —
 * así que la resolución de períodos se testea sola, sin base de datos.
 */

const rango = (query: string, hoy: string) => resolverRango(new URLSearchParams(query), hoy);
const partes = (r: ReturnType<typeof rango>) => ({
  actual: [diaDeFechaSql(r.inicioActual), diaDeFechaSql(r.finActual)] as const,
  previo: [diaDeFechaSql(r.inicioPrevio), diaDeFechaSql(r.finPrevio)] as const,
});
const largo = (par: readonly [string, string]) => diasEntre(par[0], par[1]);

// --- Presets: ventana móvil que termina hoy, contra la ventana pegada antes ---

const semana = partes(rango("periodo=semana", "2026-09-05"));
assert.deepStrictEqual(semana.actual, ["2026-08-30", "2026-09-05"]);
assert.deepStrictEqual(semana.previo, ["2026-08-23", "2026-08-29"]);
assert.strictEqual(largo(semana.actual), 7);
assert.strictEqual(largo(semana.previo), 7, "las dos ventanas tienen que medir lo mismo");

const hoyMismo = partes(rango("periodo=hoy", "2026-01-01"));
assert.deepStrictEqual(hoyMismo.actual, ["2026-01-01", "2026-01-01"]);
assert.deepStrictEqual(hoyMismo.previo, ["2025-12-31", "2025-12-31"], "cruza el año sin romperse");

// Un período desconocido cae en la semana, no explota.
assert.strictEqual(rango("periodo=cualquiera", "2026-09-05").dias, 7);

// --- Mes en curso (mtd): mismos días del mes pasado, no el mes entero ---

const mtd = partes(rango("periodo=mtd", "2026-09-04"));
assert.deepStrictEqual(mtd.actual, ["2026-09-01", "2026-09-04"]);
assert.deepStrictEqual(mtd.previo, ["2026-08-01", "2026-08-04"]);
assert.strictEqual(largo(mtd.actual), largo(mtd.previo));

// EL CASO QUE ROMPE: 31 de marzo contra febrero. Sumar un mes daría 31 de
// febrero, que `Date` corre al 3 de marzo y contaminaría la comparación con
// días del propio mes que se está midiendo.
const mtd31 = partes(rango("periodo=mtd", "2026-03-31"));
assert.deepStrictEqual(mtd31.actual, ["2026-03-01", "2026-03-31"]);
assert.deepStrictEqual(mtd31.previo, ["2026-02-01", "2026-02-28"], "febrero se recorta, no se desborda");

// Enero compara contra diciembre del año anterior.
const mtdEnero = partes(rango("periodo=mtd", "2026-01-15"));
assert.deepStrictEqual(mtdEnero.previo, ["2025-12-01", "2025-12-15"]);

// --- Mes calendario ---

// Un mes cerrado va entero contra el mes anterior entero.
const enero = partes(rango("periodo=mes-calendario&mes=2026-01", "2026-09-05"));
assert.deepStrictEqual(enero.actual, ["2026-01-01", "2026-01-31"]);
assert.deepStrictEqual(enero.previo, ["2025-12-01", "2025-12-31"]);

// Marzo cerrado contra febrero: el mes previo se recorta al día que existe.
// Las ventanas quedan desparejas (31 contra 28) y eso es correcto: quien pide
// "marzo contra febrero" quiere los meses, no dos ventanas de igual largo. La
// pantalla muestra las dos fechas para que se lea así.
const marzo = partes(rango("periodo=mes-calendario&mes=2026-03", "2026-09-05"));
assert.deepStrictEqual(marzo.actual, ["2026-03-01", "2026-03-31"]);
assert.deepStrictEqual(marzo.previo, ["2026-02-01", "2026-02-28"]);

// El mes EN CURSO se corta hoy, y el previo se corta el mismo día: si fuera
// el mes pasado completo, todo mes en curso parecería una caída.
const enCurso = partes(rango("periodo=mes-calendario&mes=2026-09", "2026-09-05"));
assert.deepStrictEqual(enCurso.actual, ["2026-09-01", "2026-09-05"]);
assert.deepStrictEqual(enCurso.previo, ["2026-08-01", "2026-08-05"]);
assert.strictEqual(largo(enCurso.actual), largo(enCurso.previo));

// Un mes basura no rompe: cae al preset.
assert.strictEqual(rango("periodo=mes-calendario&mes=2026-13", "2026-09-05").dias, 7);
assert.strictEqual(rango("periodo=mes-calendario", "2026-09-05").dias, 7);

// --- Año calendario ---

const anioCerrado = partes(rango("periodo=anio-calendario&anio=2025", "2026-09-05"));
assert.deepStrictEqual(anioCerrado.actual, ["2025-01-01", "2025-12-31"]);
assert.deepStrictEqual(anioCerrado.previo, ["2024-01-01", "2024-12-31"]);

// El año en curso se corta hoy, y el anterior en la misma fecha.
const anioEnCurso = partes(rango("periodo=anio-calendario&anio=2026", "2026-09-05"));
assert.deepStrictEqual(anioEnCurso.actual, ["2026-01-01", "2026-09-05"]);
assert.deepStrictEqual(anioEnCurso.previo, ["2025-01-01", "2025-09-05"]);

// 29 de febrero de un año bisiesto contra un año que no lo es.
const bisiesto = partes(rango("periodo=anio-calendario&anio=2024", "2024-02-29"));
assert.deepStrictEqual(bisiesto.actual, ["2024-01-01", "2024-02-29"]);
assert.deepStrictEqual(bisiesto.previo, ["2023-01-01", "2023-02-28"], "2023 no tiene 29 de febrero");
assert.strictEqual(ultimoDiaDelMes(2024, 2), 29);
assert.strictEqual(ultimoDiaDelMes(2023, 2), 28);

// --- Rango a medida ---

const aMedida = partes(rango("desde=2026-06-01&hasta=2026-06-30", "2026-09-05"));
assert.deepStrictEqual(aMedida.actual, ["2026-06-01", "2026-06-30"]);
assert.deepStrictEqual(aMedida.previo, ["2026-05-02", "2026-05-31"], "30 días pegados antes");
assert.strictEqual(largo(aMedida.actual), largo(aMedida.previo));

// Un solo día.
const unDia = partes(rango("desde=2026-06-01&hasta=2026-06-01", "2026-09-05"));
assert.deepStrictEqual(unDia.actual, ["2026-06-01", "2026-06-01"]);
assert.deepStrictEqual(unDia.previo, ["2026-05-31", "2026-05-31"]);

// Un rango gigante se recorta al tope, y lo que se devuelve es el rango
// RECORTADO: la pantalla muestra lo que se midió, no lo que se pidió.
const gigante = rango("desde=2020-01-01&hasta=2026-09-05", "2026-09-05");
assert.strictEqual(gigante.dias, MAX_DIAS_RANGO);
assert.strictEqual(diasEntre(diaDeFechaSql(gigante.inicioActual), diaDeFechaSql(gigante.finActual)), MAX_DIAS_RANGO);
assert.strictEqual(diaDeFechaSql(gigante.inicioActual), "2020-01-01", "se recorta el final, no el arranque");

// Fechas dadas vuelta, inexistentes o con formato raro caen al preset en vez
// de devolver una ventana negativa.
assert.strictEqual(rango("desde=2026-06-30&hasta=2026-06-01", "2026-09-05").dias, 7);
assert.strictEqual(rango("desde=2026-02-31&hasta=2026-03-05", "2026-09-05").dias, 7, "el 31 de febrero no existe");
assert.strictEqual(rango("desde=ayer&hasta=hoy", "2026-09-05").dias, 7);
assert.strictEqual(rango("desde=2026-06-01", "2026-09-05").dias, 7, "falta hasta");

// --- Invariante general ---

// Salvo el mes y el año calendario, donde la comparación es contra el período
// calendario anterior por definición, las dos ventanas miden lo mismo.
for (const query of ["periodo=hoy", "periodo=semana", "periodo=mes", "periodo=anio", "periodo=mtd", "desde=2026-04-10&hasta=2026-05-09"]) {
  const r = partes(rango(query, "2026-09-05"));
  assert.strictEqual(largo(r.actual), largo(r.previo), `${query}: ventanas desparejas`);
  assert.ok(r.previo[1] < r.actual[0], `${query}: el período previo tiene que terminar antes del actual`);
}

console.log("lib/periodo.test.ts: todos los checks pasaron");
