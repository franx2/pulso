import assert from "node:assert";
import { sumarDias } from "@/lib/fechaAR";
import {
  ajustarTendencia,
  backtestEstacional,
  construirPerfilEstacional,
  medirEstacionalidad,
  proyectarConTemporada,
  ultimoCierre,
  type DiaVentas,
} from "./estacionalidad";

/**
 * Se arma una serie sintética con estacionalidad y crecimiento CONOCIDOS y se
 * comprueba que el módulo los recupera. Es la única forma de saber si separa
 * bien "temporada" de "los precios subieron": con datos reales las dos cosas
 * están mezcladas y no hay contra qué comparar.
 */

const INDICE_REAL = [1.35, 1.2, 1.0, 0.9, 0.85, 0.8, 0.85, 0.85, 0.95, 1.0, 1.05, 1.2]; // ene…dic
const CRECIMIENTO_DIARIO = 0.002; // +0,2% por día ≈ +6,2% mensual
const PERFIL_DIA = [0.9, 0.85, 0.9, 0.95, 1.05, 1.25, 1.1]; // dom…sáb

function serieSintetica(desde: string, dias: number, ruido = 0): DiaVentas[] {
  // Ruido determinístico: el test tiene que dar siempre lo mismo.
  let semilla = 7;
  const aleatorio = () => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
  };
  const salida: DiaVentas[] = [];
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(desde, i);
    const mes = Number(fecha.slice(5, 7));
    const dow = new Date(`${fecha}T12:00:00.000Z`).getUTCDay();
    const base = 100000 * Math.pow(1 + CRECIMIENTO_DIARIO, i) * INDICE_REAL[mes - 1] * PERFIL_DIA[dow];
    salida.push({ fecha, ventas: base * (1 + (aleatorio() - 0.5) * 2 * ruido) });
  }
  return salida;
}

// --- Tendencia ---

const dosAnios = serieSintetica("2025-01-01", 730);
const tendencia = ajustarTendencia(dosAnios);
assert.ok(tendencia, "con dos años tiene que ajustar");
assert.ok(
  Math.abs(tendencia.crecimientoDiario - CRECIMIENTO_DIARIO) < 0.0002,
  `recupera el crecimiento diario: dio ${tendencia.crecimientoDiario}`
);
assert.ok(
  Math.abs(tendencia.crecimientoMensualPct - 6.18) < 0.5,
  `+0,2% diario es ~+6,2% mensual: dio ${tendencia.crecimientoMensualPct}`
);

// Series cortas no se ajustan: mejor null que una pendiente inventada.
assert.strictEqual(ajustarTendencia(serieSintetica("2025-01-01", 20)), null);
assert.strictEqual(ajustarTendencia([]), null);

// --- Índice mensual ---

const perfil = construirPerfilEstacional(dosAnios);
assert.ok(perfil, "dos años alcanzan para un perfil");
assert.strictEqual(perfil.meses.length, 12);
assert.strictEqual(perfil.mesesConfiables, 12, "con dos años los doce meses tienen respaldo");
assert.strictEqual(perfil.mesesRepetidos, 12, "y los doce se vieron dos veces");

// Con veinte meses (ene-2025 a ago-2026) sep a dic se vieron UNA sola vez.
// Es la advertencia que separa "así es diciembre" de "así fue ese diciembre".
const veinteMeses = construirPerfilEstacional(serieSintetica("2025-01-01", 608));
assert.ok(veinteMeses);
assert.strictEqual(veinteMeses.mesesConfiables, 12, "todos tienen días de sobra");
assert.strictEqual(veinteMeses.mesesRepetidos, 8, "pero sólo ocho se repitieron en dos años");
assert.strictEqual(veinteMeses.meses[11].anios, 1, "diciembre es uno solo");
assert.strictEqual(veinteMeses.meses[11].repetido, false);
assert.strictEqual(veinteMeses.meses[0].anios, 2, "enero sí se vio dos veces");

// El índice recuperado tiene que parecerse al que se usó para generar la
// serie. Se comparan normalizados, porque el módulo normaliza contra el
// promedio de lo observado.
const promedioReal = INDICE_REAL.reduce((s, v) => s + v, 0) / 12;
for (const mes of perfil.meses) {
  const esperado = INDICE_REAL[mes.mes - 1] / promedioReal;
  assert.ok(
    Math.abs(mes.indice - esperado) < 0.06,
    `mes ${mes.mes}: esperaba ~${esperado.toFixed(2)} y dio ${mes.indice.toFixed(2)}`
  );
}

// EL PUNTO DEL MÓDULO: con inflación fuerte, un promedio crudo por mes diría
// que diciembre es enorme sólo porque llega once meses después. Acá enero
// tiene que seguir siendo el mes alto.
const enero = perfil.meses[0].indice;
const diciembre = perfil.meses[11].indice;
assert.ok(enero > diciembre, `enero (${enero.toFixed(2)}) tiene que superar a diciembre (${diciembre.toFixed(2)})`);
const junio = perfil.meses[5].indice;
assert.ok(enero / junio > 1.4, "la diferencia entre temporada alta y baja tiene que sobrevivir al destendenciado");

// Un mes sin historia queda neutro y declarado, no inventado.
const medioAnio = construirPerfilEstacional(serieSintetica("2025-01-01", 150));
assert.ok(medioAnio);
const sinDatos = medioAnio.meses.find((m) => m.dias === 0);
assert.ok(sinDatos, "medio año deja meses sin observar");
assert.strictEqual(sinDatos.indice, 1);
assert.strictEqual(sinDatos.confiable, false);

// --- Proyección ---

const proyeccion = proyectarConTemporada(dosAnios, { desde: "2027-01-01", dias: 90 });
assert.ok(proyeccion, "proyecta");
assert.strictEqual(proyeccion.dias.length, 90);
assert.deepStrictEqual(
  proyeccion.porMes.map((m) => m.mes),
  ["2027-01", "2027-02", "2027-03"]
);
assert.ok(proyeccion.dias.every((d) => d.ventas > 0), "ningún día negativo");

// Enero es temporada alta: el mes proyectado tiene que quedar por encima de
// marzo aunque marzo esté más adelante en la tendencia.
const [ene, , mar] = proyeccion.porMes;
assert.ok(ene.ventas / ene.dias > (mar.ventas / mar.dias) * 1.2, "enero por día tiene que superar a marzo");

// Y contra la misma proyección sin temporada, el total de un trimestre alto
// tiene que ser mayor.
assert.ok(proyeccion.total > proyeccion.totalSinTemporada, "el verano levanta el trimestre");

// Sin suficientes días recientes no se proyecta.
assert.strictEqual(proyectarConTemporada(serieSintetica("2025-01-01", 400), { desde: "2030-01-01", dias: 30 }), null);

// --- Backtest: la estacionalidad tiene que ganarle al promedio simple ---

// Serie con ruido, que es el caso realista.
const conRuido = serieSintetica("2025-01-01", 760, 0.12);
const medicion = backtestEstacional(conRuido, { corte: "2026-11-15", horizonte: 45 });
assert.ok(medicion, "hay backtest");
assert.ok(medicion.conTemporada.wape < medicion.sinTemporada.wape, "tiene que mejorar al promedio de 28 días");
assert.ok(medicion.mejora > 0);
// Entrando en temporada alta, repetir el promedio de noviembre subestima
// diciembre y enero: el sesgo del método bobo tiene que ser negativo.
assert.ok(medicion.sinTemporada.sesgoPct < 0, "el promedio simple se queda corto entrando al verano");

// Sin horizonte real no se inventa una medición.
assert.strictEqual(backtestEstacional(conRuido, { corte: "2027-06-01", horizonte: 30 }), null);

// --- Cierres largos ---

// Un feriado suelto no es un cierre.
const conFeriado = serieSintetica("2025-01-01", 400).filter((d) => d.fecha !== "2025-05-01");
assert.strictEqual(ultimoCierre(conFeriado), null, "un día suelto no es un cierre");

// Seis días seguidos sí, y se reporta con sus fechas exactas.
const conReforma = serieSintetica("2025-01-01", 400).filter(
  (d) => d.fecha < "2025-06-10" || d.fecha > "2025-06-15"
);
const cierre = ultimoCierre(conReforma);
assert.ok(cierre);
assert.deepStrictEqual(
  { desde: cierre.desde, hasta: cierre.hasta, dias: cierre.dias },
  { desde: "2025-06-10", hasta: "2025-06-15", dias: 6 }
);

// EL CASO REAL: seis días cerrado y reapertura un 30% abajo, con el cierre
// ADENTRO de la ventana de 28 días que fija el nivel de arranque. Que esté
// adentro es lo que hace al test: con el cierre más atrás, los dos caminos
// dan lo mismo y el test pasa sin probar nada — pasó en el primer intento.
// La serie va del 2025-01-01 al 2026-07-14; el cierre queda a seis días del
// final, igual que el de QuickPoint cuando se detectó.
const cierreDesde = "2026-07-03";
const cierreHasta = "2026-07-08";
const conEscalon = serieSintetica("2025-01-01", 560)
  .filter((d) => d.fecha < cierreDesde || d.fecha > cierreHasta)
  .map((d) => (d.fecha > cierreHasta ? { ...d, ventas: d.ventas * 0.7 } : d));
const desde = sumarDias(conEscalon[conEscalon.length - 1].fecha, 1);
const conCierre = proyectarConTemporada(conEscalon, { desde, dias: 30 });
assert.ok(conCierre);
assert.ok(conCierre.cierre, "tiene que declarar el cierre");
assert.strictEqual(conCierre.cierre.dias, 6);

// Contra la misma serie sin el escalón: la proyección post-reforma tiene que
// quedar cerca del 70%, no a mitad de camino.
const sinEscalon = serieSintetica("2025-01-01", 560).filter(
  (d) => d.fecha < cierreDesde || d.fecha > cierreHasta
);
const referencia = proyectarConTemporada(sinEscalon, { desde, dias: 30 });
assert.ok(referencia);
const razon = conCierre.total / referencia.total;
assert.ok(
  Math.abs(razon - 0.7) < 0.06,
  `la proyección tiene que seguir al nivel nuevo (~0,70) y dio ${razon.toFixed(2)}`
);

// Con menos de 5 días de reapertura no se salta al nivel nuevo: son pocos
// datos para declarar un escalón, y se dice que no hubo corte.
const reciénReabierto = serieSintetica("2025-01-01", 560).filter(
  (d) => d.fecha < "2026-07-08" || d.fecha > "2026-07-13"
);
const apenas = proyectarConTemporada(reciénReabierto, { desde: "2026-07-17", dias: 30 });
assert.ok(apenas);
assert.strictEqual(apenas.cierre, null, "3 días de reapertura no alcanzan para redefinir el nivel");

// --- Medición sobre varias ventanas ---

const medicion4 = medirEstacionalidad(conRuido, { hasta: "2026-12-31", horizonte: 45, ventanas: 4 });
assert.ok(medicion4);
assert.strictEqual(medicion4.ventanas.length, 4, "mide las cuatro ventanas pedidas");
assert.ok(medicion4.medianaMejora > 0, "con estacionalidad real la mediana tiene que mejorar");
assert.ok(medicion4.ventanasQueMejoran >= 3, "y tiene que ganar en casi todas");
assert.ok(medicion4.peorMejora <= medicion4.medianaMejora, "el peor caso no puede superar a la mediana");
// Los cortes van hacia atrás desde el final, el más reciente primero.
assert.deepStrictEqual(
  medicion4.ventanas.map((v) => v.corte),
  ["2026-11-16", "2026-10-02", "2026-08-18", "2026-07-04"]
);

console.log("lib/forecast/estacionalidad.test.ts: todos los checks pasaron");
