import assert from "node:assert";
import { evaluarJornada, extrasDelPeriodo, extrasSemanales } from "./jornada";

const h = (iso: string) => new Date(iso);
const casi = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const turno9a17 = { inicioAt: h("2026-01-01T09:00:00Z"), finAt: h("2026-01-01T17:00:00Z") };

// Llegó y salió en horario.
const puntual = evaluarJornada({
  fichajes: [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
    { tipo: "SALIDA", timestamp: h("2026-01-01T17:00:00Z") },
  ],
  turno: turno9a17,
});
assert.strictEqual(puntual.minutosTarde, 0);
assert.strictEqual(puntual.minutosSalidaTemprana, 0);
assert.strictEqual(puntual.estado, "COMPLETA");
assert.ok(casi(puntual.horasPrevistas, 8));

// Llegó 5 minutos tarde con tolerancia 10: no es tardanza.
const dentroTolerancia = evaluarJornada({
  fichajes: [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:05:00Z") },
    { tipo: "SALIDA", timestamp: h("2026-01-01T17:00:00Z") },
  ],
  turno: turno9a17,
  toleranciaMin: 10,
});
assert.strictEqual(dentroTolerancia.minutosTarde, 0, "5 min con tolerancia 10 no es tardanza");

// Llegó 25 minutos tarde con tolerancia 10: cuenta 15.
const tarde = evaluarJornada({
  fichajes: [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:25:00Z") },
    { tipo: "SALIDA", timestamp: h("2026-01-01T17:00:00Z") },
  ],
  turno: turno9a17,
  toleranciaMin: 10,
});
assert.strictEqual(tarde.minutosTarde, 15, "descuenta la tolerancia de la tardanza");

// Se fue una hora antes.
const salioAntes = evaluarJornada({
  fichajes: [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
    { tipo: "SALIDA", timestamp: h("2026-01-01T16:00:00Z") },
  ],
  turno: turno9a17,
  toleranciaMin: 10,
});
assert.strictEqual(salioAntes.minutosSalidaTemprana, 50, "60 min menos 10 de tolerancia");

// Se quedó 2 horas de más: hora extra diaria.
const conExtra = evaluarJornada({
  fichajes: [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
    { tipo: "SALIDA", timestamp: h("2026-01-01T19:00:00Z") },
  ],
  turno: turno9a17,
});
assert.ok(casi(conExtra.horasExtra, 2), "10h trabajadas sobre 8 previstas = 2 extra");

// El descanso descontado reduce las horas extra.
const extraConDescanso = evaluarJornada({
  fichajes: [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
    { tipo: "DESCANSO_INICIO", timestamp: h("2026-01-01T13:00:00Z") },
    { tipo: "DESCANSO_FIN", timestamp: h("2026-01-01T14:00:00Z") },
    { tipo: "SALIDA", timestamp: h("2026-01-01T19:00:00Z") },
  ],
  turno: turno9a17,
  descuentaDescanso: true,
});
assert.ok(casi(extraConDescanso.horasExtra, 1), "9h netas sobre 8 previstas = 1 extra");

// Tenía turno y no fichó nada.
const noVino = evaluarJornada({ fichajes: [], turno: turno9a17 });
assert.strictEqual(noVino.estado, "SIN_FICHAR");

// Está trabajando ahora.
const trabajando = evaluarJornada({
  fichajes: [{ tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") }],
  turno: turno9a17,
});
assert.strictEqual(trabajando.estado, "EN_CURSO");
assert.strictEqual(trabajando.minutosSalidaTemprana, 0, "no se juzga la salida de quien sigue adentro");

// Está en descanso ahora.
const descansando = evaluarJornada({
  fichajes: [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
    { tipo: "DESCANSO_INICIO", timestamp: h("2026-01-01T13:00:00Z") },
  ],
  turno: turno9a17,
});
assert.strictEqual(descansando.estado, "EN_DESCANSO");

// Trabajó sin turno asignado: no hay tardanza ni extra que medir.
const sinTurno = evaluarJornada({
  fichajes: [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
    { tipo: "SALIDA", timestamp: h("2026-01-01T19:00:00Z") },
  ],
  turno: null,
});
assert.strictEqual(sinTurno.horasExtra, 0);
assert.strictEqual(sinTurno.minutosTarde, 0);
assert.ok(casi(sinTurno.horasTrabajadas, 10), "igual se cuentan las horas");

// Turno nocturno que cruza medianoche.
const nocturno = evaluarJornada({
  fichajes: [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T22:00:00Z") },
    { tipo: "SALIDA", timestamp: h("2026-01-02T02:00:00Z") },
  ],
  turno: { inicioAt: h("2026-01-01T22:00:00Z"), finAt: h("2026-01-02T02:00:00Z") },
});
assert.ok(casi(nocturno.horasPrevistas, 4), "el turno nocturno prevé 4h");
assert.strictEqual(nocturno.minutosTarde, 0);
assert.strictEqual(nocturno.horasExtra, 0);

// Semana con extras diarias mayores que el excedente semanal.
const semanaDiaria = extrasSemanales({
  horasPorDia: [10, 10, 8, 8, 4],
  extraDiariaPorDia: [2, 2, 0, 0, 0],
  topeSemanalHoras: 48,
});
assert.ok(casi(semanaDiaria.totalSemana, 40));
assert.ok(casi(semanaDiaria.extraSemanal, 0), "40h no superan el tope de 48");
assert.ok(casi(semanaDiaria.extraALiquidar, 4), "se liquidan las 4 extras diarias");

// Semana que además pasa el tope: se liquida la mayor, no la suma.
const semanaTope = extrasSemanales({
  horasPorDia: [11, 11, 11, 11, 10],
  extraDiariaPorDia: [3, 3, 3, 3, 2],
  topeSemanalHoras: 48,
});
assert.ok(casi(semanaTope.totalSemana, 54));
assert.ok(casi(semanaTope.extraSemanal, 6), "54h menos el tope de 48");
assert.ok(casi(semanaTope.extraDiaria, 14));
assert.ok(casi(semanaTope.extraALiquidar, 14), "la mayor de las dos, nunca la suma");

// --- Extras de un período de varias semanas ---

// Cuatro semanas de 40 h: ninguna supera el tope de 48, así que no hay extra
// semanal. Aplicar el tope al total del mes (160 h) habría dado 112 h falsas.
const mesTranquilo = extrasDelPeriodo({
  dias: [
    ...Array.from({ length: 5 }, () => ({ semana: "2026-W01", horas: 8, extraDiaria: 0 })),
    ...Array.from({ length: 5 }, () => ({ semana: "2026-W02", horas: 8, extraDiaria: 0 })),
    ...Array.from({ length: 5 }, () => ({ semana: "2026-W03", horas: 8, extraDiaria: 0 })),
    ...Array.from({ length: 5 }, () => ({ semana: "2026-W04", horas: 8, extraDiaria: 0 })),
  ],
  topeSemanalHoras: 48,
});
assert.ok(casi(mesTranquilo.totalHoras, 160), "el total del mes son 160h");
assert.ok(casi(mesTranquilo.extraSemanal, 0), "ninguna semana superó el tope");
assert.ok(casi(mesTranquilo.extraALiquidar, 0), "no hay nada extra que liquidar");

// Una sola semana pasada de rosca dentro de un mes normal: sólo cuenta esa.
const mesConUnaSemanaLarga = extrasDelPeriodo({
  dias: [
    ...Array.from({ length: 5 }, () => ({ semana: "2026-W01", horas: 8, extraDiaria: 0 })),
    ...Array.from({ length: 6 }, () => ({ semana: "2026-W02", horas: 10, extraDiaria: 2 })),
    ...Array.from({ length: 5 }, () => ({ semana: "2026-W03", horas: 8, extraDiaria: 0 })),
  ],
  topeSemanalHoras: 48,
});
assert.ok(casi(mesConUnaSemanaLarga.totalHoras, 140), "40 + 60 + 40 = 140h");
assert.ok(casi(mesConUnaSemanaLarga.extraSemanal, 12), "sólo la semana de 60h excede: 60-48");
assert.ok(casi(mesConUnaSemanaLarga.extraDiaria, 12), "6 días con 2h extra cada uno");
assert.ok(casi(mesConUnaSemanaLarga.extraALiquidar, 12), "la mayor de las dos, no la suma");

// Una semana con extras diarias pero sin pasar el tope: se liquidan las diarias.
const semanaCorta = extrasDelPeriodo({
  dias: [
    { semana: "2026-W05", horas: 12, extraDiaria: 4 },
    { semana: "2026-W05", horas: 12, extraDiaria: 4 },
    { semana: "2026-W05", horas: 8, extraDiaria: 0 },
  ],
  topeSemanalHoras: 48,
});
assert.ok(casi(semanaCorta.totalHoras, 32));
assert.ok(casi(semanaCorta.extraSemanal, 0), "32h no llegan al tope de 48");
assert.ok(casi(semanaCorta.extraALiquidar, 8), "pero las 8h extra diarias sí se pagan");

// Período vacío: todo en cero, sin explotar.
const vacio = extrasDelPeriodo({ dias: [], topeSemanalHoras: 48 });
assert.ok(casi(vacio.totalHoras, 0) && casi(vacio.extraALiquidar, 0));

console.log("lib/jornada.test.ts: todos los checks pasaron");
