import assert from "node:assert";
import { calcularMonto } from "./pago";

// Sin precio/hora cargado, no hay monto (no se inventa un valor).
assert.strictEqual(
  calcularMonto({ dias: [{ clave: "2026-09-01", horas: 8 }], precioHora: null, feriados: new Set() }),
  0
);

// Día normal: horas × precio.
assert.strictEqual(
  calcularMonto({ dias: [{ clave: "2026-09-01", horas: 8 }], precioHora: 1000, feriados: new Set() }),
  8000
);

// Día feriado: se aplica el multiplicador del local.
assert.strictEqual(
  calcularMonto({
    dias: [{ clave: "2026-05-01", horas: 8 }],
    precioHora: 1000,
    feriados: new Set(["2026-05-01"]),
    multiplicadorFeriado: 2,
  }),
  16000
);

// Multiplicador distinto de 2 (configurable por local).
assert.strictEqual(
  calcularMonto({
    dias: [{ clave: "2026-05-01", horas: 8 }],
    precioHora: 1000,
    feriados: new Set(["2026-05-01"]),
    multiplicadorFeriado: 1.5,
  }),
  12000
);

// Período mixto: sólo el día que cae en el calendario se duplica.
assert.strictEqual(
  calcularMonto({
    dias: [
      { clave: "2026-05-01", horas: 8 },
      { clave: "2026-05-02", horas: 6 },
    ],
    precioHora: 1000,
    feriados: new Set(["2026-05-01"]),
  }),
  8 * 1000 * 2 + 6 * 1000
);

console.log("lib/pago.test.ts: todos los checks pasaron");
