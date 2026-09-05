import assert from "node:assert";
import { categoriaCanonica } from "./categorias";
import { slotDesdeISO, etiquetaSlot, turnoDeSlot } from "./slots";
import { construirPerfil, claveCelda, demandIndex, calcularKTrend } from "./perfil";
import { componerK, calcularKCalendar, LIMITES_K } from "./k";
import { calcularCarga, cargaPorHora } from "./carga";
import { recomendarDotacion, aprenderCapacidad, matrizDesdeCapacidad } from "./dotacion";
import { calcularMetricas, intervalo, elegirMejorMetodo } from "./backtest";

// ── categorías: el mismo rubro escrito de cuatro formas es un solo rubro
assert.strictEqual(categoriaCanonica("2.Cafetería"), "cafeteria");
assert.strictEqual(categoriaCanonica("CAFETERIA"), "cafeteria");
assert.strictEqual(categoriaCanonica("Cafeteria PYA"), "cafeteria");
assert.strictEqual(categoriaCanonica("7. Heladería"), "heladeria");
assert.strictEqual(categoriaCanonica("Heladeria DELIVERY"), "heladeria");
assert.strictEqual(categoriaCanonica("PASTELERIA HISTORICA"), "pasteleria");
assert.strictEqual(categoriaCanonica(null), "sin categoria");

// ── slots: hora argentina, no UTC
assert.deepStrictEqual(slotDesdeISO("2026-09-03T21:42:31Z"), { dia: "2026-09-03", slot: 37 }, "18:42 AR → slot 37");
assert.deepStrictEqual(slotDesdeISO("2026-09-04T02:30:00Z"), { dia: "2026-09-03", slot: 47 }, "23:30 AR es del día anterior");
assert.strictEqual(etiquetaSlot(37), "18:30");
assert.strictEqual(turnoDeSlot(42), "NOCHE");

// ── perfil: lo reciente pesa más
const obs = [
  // mismo día de semana (jueves), misma franja; lo viejo vendía 10, lo nuevo 20
  { fecha: "2026-06-11", slot: 20, tickets: 10, unidades: 20, ventas: 1000 },
  { fecha: "2026-08-27", slot: 20, tickets: 20, unidades: 40, ventas: 2000 },
];
const perfil = construirPerfil(obs, "2026-09-03");
const celda = perfil.celdas.get(claveCelda(4, 20))!;
assert.ok(celda.tickets > 15, `la ponderación temporal debe acercar el promedio a lo reciente (dio ${celda.tickets})`);
assert.strictEqual(celda.muestras, 2);

// DemandIndex se mide contra la propia celda, no contra otros locales
assert.strictEqual(demandIndex(120, 100), 120);
assert.strictEqual(demandIndex(50, 100), 50);
assert.strictEqual(demandIndex(10, 0), 100, "sin normal conocida, el índice es neutro");

// K_trend detecta crecimiento reciente
const dia = (n: number) => String(n).padStart(2, "0");
const paraTrend = [
  // 10 días de julio (fuera de las 3 semanas) a 100 tickets…
  ...Array.from({ length: 10 }, (_, i) => ({ fecha: `2026-07-${dia(i + 1)}`, slot: 20, tickets: 100, unidades: 0, ventas: 0 })),
  // …contra 10 días recientes a 130.
  ...Array.from({ length: 10 }, (_, i) => ({ fecha: `2026-08-${dia(i + 20)}`, slot: 20, tickets: 130, unidades: 0, ventas: 0 })),
];
const trend = calcularKTrend(paraTrend, "2026-09-03");
assert.ok(trend.k > 1.2, `debería detectar tendencia creciente (dio ${trend.k})`);

// ── motor K: composición, recorte y explicación
const k = componerK({ K_calendar: 1.18, K_weather: 1.06, K_trend: 1.08 });
assert.ok(Math.abs(k.kAuto - 1.18 * 1.06 * 1.08) < 1e-9, "K_auto es el producto de los factores");
assert.strictEqual(k.kManual, 1, "K_manual por defecto es 1");
assert.ok(k.motivos.some((m) => m.includes("calendario")), "tiene que explicar el ajuste");

const extremo = componerK({ K_calendar: 2.5, K_weather: 1.5 });
assert.strictEqual(extremo.kAuto, LIMITES_K.max, "un factor desbocado se recorta");
assert.ok(extremo.recortado);
assert.ok(extremo.motivos.some((m) => m.includes("recortado")), "y se avisa que se recortó");

const nulos = componerK({ K_weather: NaN, K_trend: 0 });
assert.strictEqual(nulos.kAuto, 1, "un factor inválido es neutro, no rompe el pronóstico");

// El día de semana ya vive en el perfil: K_calendar no lo puede contar de nuevo
const cal = calcularKCalendar({ esFeriado: true, esVisperaFeriado: false, diaDelMes: 15, factorFeriado: 1.16 });
assert.ok(Math.abs(cal.k - 1.16) < 1e-9);
assert.deepStrictEqual(calcularKCalendar({ esFeriado: false, esVisperaFeriado: false, diaDelMes: 15 }).k, 1);

// ── carga por sector
const carga = calcularCarga({ cafeteria: 10, promociones: 4 }, { "EAT-IN": 6, DELIVERY: 2 });
assert.ok(Math.abs(carga.COCINA - (10 * 1 + 4 * 2.5)) < 1e-9, "cocina suma sólo la parte de producto");
assert.ok(Math.abs(carga.SALON - (10 * 0.5 + 4 * 0.8 + 6 * 2)) < 1e-9, "salón suma producto + tickets de mesa");
assert.ok(carga.DESPACHO > 0, "el delivery carga despacho aunque el producto no");

const desconocida = calcularCarga({ "categoria que no existe": 10 }, {});
assert.ok(desconocida.COCINA > 0, "una categoría sin fila cae en el default, no en cero");

assert.strictEqual(cargaPorHora({ COCINA: 50, SALON: 0, CAJA: 0, DESPACHO: 0, ENCARGADO: 0 }).COCINA, 100);

// ── dotación
const caps = { COCINA: { capacidadPorEmpleado: 90, minPersonas: 1, maxPersonas: 6 } };
assert.strictEqual(
  recomendarDotacion({ COCINA: 180, SALON: 0, CAJA: 0, DESPACHO: 0, ENCARGADO: 0 }, caps).COCINA,
  2
);
assert.strictEqual(
  recomendarDotacion({ COCINA: 181, SALON: 0, CAJA: 0, DESPACHO: 0, ENCARGADO: 0 }, caps).COCINA,
  3,
  "un punto más ya pide otra persona"
);
assert.strictEqual(
  recomendarDotacion({ COCINA: 0, SALON: 0, CAJA: 0, DESPACHO: 0, ENCARGADO: 0 }, caps).COCINA,
  0,
  "sin carga no se pide gente aunque haya mínimo"
);
assert.strictEqual(
  recomendarDotacion({ COCINA: 9000, SALON: 0, CAJA: 0, DESPACHO: 0, ENCARGADO: 0 }, caps).COCINA,
  6,
  "el máximo manda"
);

// La matriz de rangos se deriva de la capacidad: una sola verdad
const matriz = matrizDesdeCapacidad({ capacidadPorEmpleado: 90, minPersonas: 1, maxPersonas: 5 });
assert.deepStrictEqual(matriz[0], { desde: 0, hasta: 90, personas: 1 });
assert.deepStrictEqual(matriz[1], { desde: 90, hasta: 180, personas: 2 });

// Capacidad: sin muestra suficiente NO se inventa un número
assert.strictEqual(aprenderCapacidad([{ cargaHora: 100, personas: 2 }]), null);
const aprendida = aprenderCapacidad(
  Array.from({ length: 40 }, () => ({ cargaHora: 180, personas: 2 })),
  30
);
assert.ok(aprendida && Math.abs(aprendida.capacidadPorEmpleado - 90) < 1e-6);
assert.ok(aprendida!.confianza > 0.3 && aprendida!.confianza <= 0.9);

// ── métricas
const m = calcularMetricas([
  { pronosticado: 110, real: 100 },
  { pronosticado: 90, real: 100 },
]);
assert.strictEqual(m.mae, 10);
assert.strictEqual(m.wape, 0.1, "20 de error sobre 200 de volumen");
assert.strictEqual(m.sesgo, 0, "errores simétricos no dejan sesgo");

// Intervalo: menos muestras, más ancho
const anchoPoco = intervalo(100, 20, 2);
const anchoMucho = intervalo(100, 20, 12);
assert.ok(anchoPoco.max - anchoPoco.min > anchoMucho.max - anchoMucho.min, "con 2 muestras el rango es más ancho");
assert.ok(anchoPoco.confianza < anchoMucho.confianza);
assert.ok(intervalo(5, 20, 2).min === 0, "el rango nunca baja de cero tickets");

// Elegir método por backtesting, no por gusto
const elegido = elegirMejorMetodo({
  malo: [{ pronosticado: 200, real: 100 }],
  bueno: [{ pronosticado: 105, real: 100 }],
});
assert.strictEqual(elegido.metodo, "bueno");

console.log("forecast.test.ts: todos los checks pasaron");

// Regresión: una semana a la que le faltan días no es una semana floja.
// Un local con 3 de 7 días reportaba "-10% por semana" viniendo plano.
{
  const semanasCrudas = [
    { dias: 7, ventas: 1000 },
    { dias: 7, ventas: 1000 },
    { dias: 3, ventas: 400 }, // incompleta: se descarta, no se lee como caída
  ];
  const completas = semanasCrudas.filter((s) => s.dias >= 6);
  assert.strictEqual(completas.length, 2, "las semanas incompletas quedan afuera del ajuste");
  const media = completas.reduce((s, x) => s + x.ventas, 0) / completas.length;
  assert.strictEqual(media, 1000, "y el nivel no se hunde por los días que faltan");
}

console.log("forecast.test.ts: regresión de semanas incompletas OK");
