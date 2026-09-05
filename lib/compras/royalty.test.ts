import assert from "node:assert";
import { controlarRoyalty, mesDelRoyalty, ALICUOTA_IVA, PORCENTAJE_ROYALTY } from "./royalty";

// --- Qué mes cubre el remito ---

// El remito de agosto llega fechado el 30 de agosto, antes de que el mes
// termine: el mes sale del texto, no de la fecha de emisión.
assert.deepStrictEqual(mesDelRoyalty("USO DE MARCA AGOSTO", "2026-08-30"), {
  mes: "2026-08",
  origen: "texto",
});

// Sin texto se cae a la fecha, pero declarándolo.
assert.deepStrictEqual(mesDelRoyalty(null, "2026-08-30"), { mes: "2026-08", origen: "fecha" });
assert.deepStrictEqual(mesDelRoyalty("", "2026-03-02"), { mes: "2026-03", origen: "fecha" });

// Un remito de diciembre emitido en enero es del año anterior. Sin esto, el
// control compararía contra un mes que todavía no pasó y daría cualquier cosa.
assert.deepStrictEqual(mesDelRoyalty("USO DE MARCA DICIEMBRE", "2027-01-05"), {
  mes: "2026-12",
  origen: "texto",
});

// --- La cuenta ---

assert.strictEqual(ALICUOTA_IVA, 0.21);
assert.strictEqual(PORCENTAJE_ROYALTY, 0.05);

// EL CASO REAL: agosto de 2026 en Las Cañas. Venta con IVA $23.933.039;
// neta $19.779.371; el 5% da $988.969 y el remito cobró $1.017.340.
const agosto = controlarRoyalty({
  mes: "2026-08",
  origenMes: "texto",
  ventaConIva: 23933039,
  cobrado: 1017340.23,
  diasConDatos: 31,
});
assert.strictEqual(Math.round(agosto.ventaNeta), 19779371);
assert.strictEqual(Math.round(agosto.esperado), 988969);
assert.strictEqual(Math.round(agosto.diferencia), 28372);
assert.ok(Math.abs(agosto.diferenciaPct - 2.87) < 0.01, `dio ${agosto.diferenciaPct}`);
assert.strictEqual(agosto.diasDelMes, 31);
assert.ok(agosto.completo);

// Un mes al que le faltan días no se puede controlar: la venta está
// subestimada y la diferencia saldría a favor del proveedor por un motivo que
// no es el suyo. Es el mismo error que ya apareció tres veces en el dashboard.
const incompleto = controlarRoyalty({
  mes: "2026-08",
  origenMes: "texto",
  ventaConIva: 20000000,
  cobrado: 1017340.23,
  diasConDatos: 25,
});
assert.ok(!incompleto.completo, "25 de 31 días no es un mes");

// Febrero tiene 28 y el bisiesto 29: el control no puede pedir 31 siempre.
assert.strictEqual(controlarRoyalty({ mes: "2026-02", origenMes: "texto", ventaConIva: 1, cobrado: 1, diasConDatos: 28 }).diasDelMes, 28);
assert.strictEqual(controlarRoyalty({ mes: "2024-02", origenMes: "texto", ventaConIva: 1, cobrado: 1, diasConDatos: 29 }).diasDelMes, 29);

// Cobro exacto: diferencia cero, no un residuo de punto flotante.
const exacto = controlarRoyalty({
  mes: "2026-08",
  origenMes: "texto",
  ventaConIva: 24200000,
  cobrado: (24200000 / 1.21) * 0.05,
  diasConDatos: 31,
});
assert.ok(Math.abs(exacto.diferencia) < 0.01);
assert.ok(Math.abs(exacto.diferenciaPct) < 0.001);

// Sin ventas cargadas no se inventa un porcentaje infinito.
const sinVentas = controlarRoyalty({ mes: "2026-08", origenMes: "texto", ventaConIva: 0, cobrado: 100, diasConDatos: 0 });
assert.strictEqual(sinVentas.diferenciaPct, 0);

console.log("lib/compras/royalty.test.ts: todos los checks pasaron");
