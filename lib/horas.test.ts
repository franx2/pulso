import assert from "node:assert";
import { calcularHoras, proximoFichaje } from "./horas";

const h = (iso: string) => new Date(iso);
const casi = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// Jornada normal: 9:00 a 17:30 = 8.5 horas.
const normal = calcularHoras([
  { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
  { tipo: "SALIDA", timestamp: h("2026-01-01T17:30:00Z") },
]);
assert.ok(casi(normal.horasTrabajadas, 8.5), "jornada normal debería dar 8.5h");
assert.strictEqual(normal.abierto, false);

// Turno que cruza medianoche: 22:00 a 02:00 = 4 horas.
const nocturno = calcularHoras([
  { tipo: "ENTRADA", timestamp: h("2026-01-01T22:00:00Z") },
  { tipo: "SALIDA", timestamp: h("2026-01-02T02:00:00Z") },
]);
assert.ok(casi(nocturno.horasTrabajadas, 4), "turno nocturno debería dar 4h");

// Descanso descontado: 9-17 con 1h de descanso = 7h.
const conDescanso = calcularHoras(
  [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
    { tipo: "DESCANSO_INICIO", timestamp: h("2026-01-01T13:00:00Z") },
    { tipo: "DESCANSO_FIN", timestamp: h("2026-01-01T14:00:00Z") },
    { tipo: "SALIDA", timestamp: h("2026-01-01T17:00:00Z") },
  ],
  { descuentaDescanso: true }
);
assert.ok(casi(conDescanso.horasBrutas, 8), "brutas deberían ser 8h");
assert.ok(casi(conDescanso.horasDescanso, 1), "descanso debería ser 1h");
assert.ok(casi(conDescanso.horasTrabajadas, 7), "con descuento deberían quedar 7h");

// El mismo día con descanso pago: 8h.
const descansoPago = calcularHoras(
  [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
    { tipo: "DESCANSO_INICIO", timestamp: h("2026-01-01T13:00:00Z") },
    { tipo: "DESCANSO_FIN", timestamp: h("2026-01-01T14:00:00Z") },
    { tipo: "SALIDA", timestamp: h("2026-01-01T17:00:00Z") },
  ],
  { descuentaDescanso: false }
);
assert.ok(casi(descansoPago.horasTrabajadas, 8), "sin descuento deberían ser 8h");

// Se fue sin cerrar el descanso: la salida lo cierra.
const descansoSinCerrar = calcularHoras([
  { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
  { tipo: "DESCANSO_INICIO", timestamp: h("2026-01-01T16:00:00Z") },
  { tipo: "SALIDA", timestamp: h("2026-01-01T17:00:00Z") },
]);
assert.ok(casi(descansoSinCerrar.horasDescanso, 1), "la salida debe cerrar el descanso");
assert.ok(casi(descansoSinCerrar.horasTrabajadas, 7), "y descontarlo");
assert.strictEqual(descansoSinCerrar.enDescanso, false);

// Turno abierto: no suma horas pero marca estado.
const abierto = calcularHoras([{ tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") }]);
assert.strictEqual(abierto.horasTrabajadas, 0, "turno abierto no suma horas");
assert.strictEqual(abierto.abierto, true);
assert.strictEqual(proximoFichaje(abierto), "SALIDA");

// En descanso ahora mismo.
const enDescanso = calcularHoras([
  { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
  { tipo: "DESCANSO_INICIO", timestamp: h("2026-01-01T13:00:00Z") },
]);
assert.strictEqual(enDescanso.enDescanso, true);
assert.strictEqual(proximoFichaje(enDescanso), "DESCANSO_FIN");

// Sin fichajes: toca marcar entrada.
assert.strictEqual(proximoFichaje(calcularHoras([])), "ENTRADA");

// Dos turnos partidos el mismo día.
const partido = calcularHoras([
  { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
  { tipo: "SALIDA", timestamp: h("2026-01-01T13:00:00Z") },
  { tipo: "ENTRADA", timestamp: h("2026-01-01T18:00:00Z") },
  { tipo: "SALIDA", timestamp: h("2026-01-01T22:00:00Z") },
]);
assert.ok(casi(partido.horasTrabajadas, 8), "dos tramos de 4h son 8h");

// Datos huérfanos: SALIDA sin ENTRADA y DESCANSO_FIN suelto se ignoran.
const huerfanos = calcularHoras([
  { tipo: "SALIDA", timestamp: h("2026-01-01T08:00:00Z") },
  { tipo: "DESCANSO_FIN", timestamp: h("2026-01-01T08:30:00Z") },
  { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
  { tipo: "SALIDA", timestamp: h("2026-01-01T17:00:00Z") },
]);
assert.ok(casi(huerfanos.horasTrabajadas, 8), "los huérfanos no deben alterar el total");

// Fichajes desordenados en el input: se ordenan antes de emparejar.
const desordenado = calcularHoras([
  { tipo: "SALIDA", timestamp: h("2026-01-01T17:00:00Z") },
  { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
]);
assert.ok(casi(desordenado.horasTrabajadas, 8), "debe ordenar antes de emparejar");

// Panel en vivo: con `ahora`, el turno abierto cuenta lo transcurrido.
const enVivo = calcularHoras([{ tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") }], {
  ahora: h("2026-01-01T14:30:00Z"),
});
assert.ok(casi(enVivo.horasTrabajadas, 5.5), "en vivo debe contar 5.5h transcurridas");
assert.strictEqual(enVivo.abierto, true, "aunque cuente el tiempo, la jornada sigue abierta");

// El mismo caso sin `ahora` (un reporte) no inventa horas.
const mismoEnReporte = calcularHoras([{ tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") }]);
assert.strictEqual(mismoEnReporte.horasTrabajadas, 0, "un reporte no cuenta lo que no se fichó");

// En vivo y en descanso: el descanso en curso también se descuenta.
const enVivoDescansando = calcularHoras(
  [
    { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
    { tipo: "DESCANSO_INICIO", timestamp: h("2026-01-01T13:00:00Z") },
  ],
  { ahora: h("2026-01-01T14:00:00Z"), descuentaDescanso: true }
);
assert.ok(casi(enVivoDescansando.horasBrutas, 5), "5h desde que entró");
assert.ok(casi(enVivoDescansando.horasDescanso, 1), "1h de descanso en curso");
assert.ok(casi(enVivoDescansando.horasTrabajadas, 4), "descuenta el descanso en curso");
assert.strictEqual(enVivoDescansando.enDescanso, true);

// El descanso nunca puede dejar las horas en negativo.
const descansoAbsurdo = calcularHoras([
  { tipo: "ENTRADA", timestamp: h("2026-01-01T09:00:00Z") },
  { tipo: "DESCANSO_INICIO", timestamp: h("2026-01-01T09:30:00Z") },
  { tipo: "DESCANSO_FIN", timestamp: h("2026-01-01T23:00:00Z") },
  { tipo: "SALIDA", timestamp: h("2026-01-01T10:00:00Z") },
]);
assert.ok(descansoAbsurdo.horasTrabajadas >= 0, "las horas nunca son negativas");

console.log("lib/horas.test.ts: todos los checks pasaron");
