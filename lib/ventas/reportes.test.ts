import assert from "node:assert";
import { armarReporte, type VentaReporte } from "./reportes";

const venta = (iso: string, extra: Partial<VentaReporte> = {}): VentaReporte => ({
  tipo: "MESA",
  abiertaEn: new Date(iso),
  descuentoPct: null,
  descuentoMonto: 0,
  mozo: "Martina",
  abiertaPor: "Martina",
  items: [{ nombre: "CORTADO", precio: 5000, cantidad: 2, anulado: false, motivoAnulacion: null, anuladoPor: null }],
  pagos: [{ medio: "Efectivo", monto: 10000, propina: 0, anulado: false }],
  ...extra,
});

// Lunes 16/11/2026 a las 9 de la mañana argentina = 12:00 UTC.
const ventas = [
  venta("2026-11-16T12:00:00Z"),
  venta("2026-11-16T12:30:00Z", {
    tipo: "MOSTRADOR",
    mozo: null,
    abiertaPor: "Nicolas",
    descuentoPct: 10,
    items: [
      { nombre: "CORTADO", precio: 5000, cantidad: 1, anulado: false, motivoAnulacion: null, anuladoPor: null },
      { nombre: "TOSTADO", precio: 12000, cantidad: 1, anulado: true, motivoAnulacion: "ERROR", anuladoPor: "Nicolas" },
    ],
    pagos: [{ medio: "Débito", monto: 4500, propina: 0, anulado: false }],
  }),
];
const r = armarReporte(ventas, [venta("2026-11-09T12:00:00Z")], ["2026-11-16", "2026-11-17"]);

assert.strictEqual(r.indicadores.brutas.valor, 15000, "lo anulado no es venta bruta");
assert.strictEqual(r.indicadores.netas.valor, 14500);
assert.strictEqual(r.indicadores.descuentos.valor, 500);
assert.strictEqual(r.indicadores.cantidad.valor, 2);
assert.strictEqual(r.indicadores.netas.variacion, 45, "contra los 10.000 del período anterior");
assert.strictEqual(r.porDiaSemana[0].ventas, 14500, "el lunes argentino");
assert.strictEqual(r.porHora[9].cantidad, 2, "las 9 argentinas, no las 12 UTC");
assert.deepStrictEqual(r.evolucion.map((d) => d.cantidad), [2, 0], "los días sin ventas también aparecen");
assert.deepStrictEqual(r.origen.map((o) => o.nombre), ["Mesas", "Mostrador"]);
assert.strictEqual(r.mozos[1].usuario, "Nicolas", "en mostrador cuenta quien abrió la venta");
assert.deepStrictEqual(r.cancelaciones, [{ producto: "TOSTADO", usuario: "Nicolas", cantidad: 1, monto: 12000 }]);
assert.strictEqual(r.motivos[0].nombre, "ERROR");
assert.strictEqual(armarReporte([], [], []).indicadores.netas.variacion, null, "sin período anterior no hay variación");

console.log("lib/ventas/reportes.test.ts: todos los checks pasaron");
