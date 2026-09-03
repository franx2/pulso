import assert from "node:assert";
import { detectarAlertas } from "./alertas";
import { evaluarJornada } from "./jornada";
import type { FichajeSimple } from "./horas";

const h = (iso: string) => new Date(iso);
const turno9a17 = { inicioAt: h("2026-01-01T09:00:00Z"), finAt: h("2026-01-01T17:00:00Z") };

function alertasDe(fichajes: FichajeSimple[], ahora: string, turno = turno9a17 as typeof turno9a17 | null) {
  const jornada = evaluarJornada({ fichajes, turno, toleranciaMin: 10 });
  return detectarAlertas({ jornada, turno, ahora: h(ahora), toleranciaMin: 10 }).map((a) => a.tipo);
}

// Todavía no es hora de preocuparse: el turno arrancó hace 15 min (tolerancia 10).
assert.deepStrictEqual(alertasDe([], "2026-01-01T09:15:00Z"), [], "15 min no dispara NO_FICHO");

// Pasaron 45 min del inicio y no fichó: alerta.
assert.deepStrictEqual(alertasDe([], "2026-01-01T09:45:00Z"), ["NO_FICHO"]);

// Llegó tarde: se reporta la tardanza, no NO_FICHO.
assert.deepStrictEqual(
  alertasDe([{ tipo: "ENTRADA", timestamp: h("2026-01-01T09:40:00Z") }], "2026-01-01T09:45:00Z"),
  ["LLEGADA_TARDE"],
  "quien llegó tarde no puede además figurar como que no fichó"
);

// Llegó puntual y sigue trabajando dentro del turno: nada que avisar.
assert.deepStrictEqual(
  alertasDe([{ tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") }], "2026-01-01T14:00:00Z"),
  []
);

// El turno terminó hace 1 h y no marcó salida: todavía no alerta (umbral 2 h).
assert.deepStrictEqual(
  alertasDe([{ tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") }], "2026-01-01T18:00:00Z"),
  [],
  "1 h de gracia después del turno no alcanza"
);

// Tres horas después del fin del turno, sigue abierta: salida olvidada.
assert.deepStrictEqual(
  alertasDe([{ tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") }], "2026-01-01T20:00:00Z"),
  ["SALIDA_OLVIDADA"]
);

// Jornada cerrada bastante más larga que lo previsto.
assert.deepStrictEqual(
  alertasDe(
    [
      { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
      { tipo: "SALIDA", timestamp: h("2026-01-01T21:00:00Z") },
    ],
    "2026-01-01T21:05:00Z"
  ),
  ["EXCESO_HORARIO"],
  "12h sobre 8 previstas es exceso"
);

// Quedarse 1 h de más no es exceso (umbral 3 h).
assert.deepStrictEqual(
  alertasDe(
    [
      { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
      { tipo: "SALIDA", timestamp: h("2026-01-01T18:00:00Z") },
    ],
    "2026-01-01T18:05:00Z"
  ),
  [],
  "una hora extra es normal, no una alerta"
);

// Jornada completa y puntual: ninguna alerta.
assert.deepStrictEqual(
  alertasDe(
    [
      { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
      { tipo: "SALIDA", timestamp: h("2026-01-01T17:00:00Z") },
    ],
    "2026-01-01T17:05:00Z"
  ),
  []
);

// Sin turno asignado no se juzga puntualidad, pero sí una jornada desmedida.
assert.deepStrictEqual(
  alertasDe(
    [
      { tipo: "ENTRADA", timestamp: h("2026-01-01T08:00:00Z") },
      { tipo: "SALIDA", timestamp: h("2026-01-01T21:00:00Z") },
    ],
    "2026-01-01T21:05:00Z",
    null
  ),
  ["EXCESO_HORARIO"],
  "13h sin turno superan el tope absoluto"
);

// Sin turno y jornada normal: nada.
assert.deepStrictEqual(
  alertasDe(
    [
      { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
      { tipo: "SALIDA", timestamp: h("2026-01-01T17:00:00Z") },
    ],
    "2026-01-01T17:05:00Z",
    null
  ),
  []
);

// El día que nadie tenía turno y nadie fichó no genera ruido.
assert.deepStrictEqual(alertasDe([], "2026-01-01T20:00:00Z", null), []);

// Detectar dos veces con los mismos datos da el mismo resultado (idempotencia).
const unaVez = alertasDe([], "2026-01-01T09:45:00Z");
const otraVez = alertasDe([], "2026-01-01T09:45:00Z");
assert.deepStrictEqual(unaVez, otraVez);

console.log("lib/alertas.test.ts: todos los checks pasaron");
