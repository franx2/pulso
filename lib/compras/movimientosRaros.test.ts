import assert from "node:assert";
import { movimientosRaros, quienDe, type MovimientoParaRevisar } from "./movimientosRaros";

/**
 * Datos de ejemplo con la forma del extracto real de Galicia: referencia con
 * el destinatario primero y el resto separado por " · ".
 */

let n = 0;
const deb = (fecha: string, descripcion: string, referencia: string | null, debito: number): MovimientoParaRevisar => ({
  id: `m${String(++n).padStart(3, "0")}`,
  fecha,
  descripcion,
  referencia,
  debito,
  credito: 0,
});

const movs: MovimientoParaRevisar[] = [
  // Historia: agosto y septiembre.
  deb("2026-08-05", "COMISION SERVICIO DE CUENTA", "Julio 2026", 75_000),
  deb("2026-09-05", "COMISION SERVICIO DE CUENTA", "Agosto 2026", 75_000),
  deb("2026-08-19", "PAGO DE SERVICIOS", "Luz Ejemplo", 900_000),
  deb("2026-08-19", "PAGO DE SERVICIOS", "Luz Ejemplo", 100_000),
  deb("2026-09-17", "PAGO DE SERVICIOS", "Luz Ejemplo", 905_000),
  deb("2026-09-17", "PAGO DE SERVICIOS", "Luz Ejemplo", 100_000),
  ...["2026-08-07", "2026-08-14", "2026-08-21", "2026-08-28", "2026-09-04"].map((f) =>
    deb(f, "TRF INMED PROVEED", "Proveedor Ejemplo SRL · 30111111110 · VARIOS", 1_000_000)
  ),
  deb("2026-08-10", "IMP. DEB. LEY 25413 GRAL.", null, 6_000),
  // Octubre, el período que se mira.
  deb("2026-10-05", "COMISION SERVICIO DE CUENTA", "Septiembre 2026", 95_000),
  deb("2026-10-19", "PAGO DE SERVICIOS", "Luz Ejemplo", 905_000),
  deb("2026-10-19", "PAGO DE SERVICIOS", "Luz Ejemplo", 100_000),
  deb("2026-10-08", "TRF INMED PROVEED", "Proveedor Ejemplo S.R.L.. · 30111111110 · VARIOS", 1_000_000),
  deb("2026-10-10", "TRF INMED PROVEED", "Proveedor Ejemplo SRL · 30111111110 · VARIOS", 1_000_000),
  deb("2026-10-20", "TRF INMED PROVEED", "Proveedor Ejemplo SRL · 30111111110 · VARIOS", 3_500_000),
  deb("2026-10-12", "DEB. AUTOM. DE SERV.", "Streaming Ejemplo", 12_000),
  deb("2026-10-14", "TRF INMED PROVEED", "Persona Ejemplo · 20111111112", 247_000),
  deb("2026-10-14", "SUSCRIPCION FIMA", "FIMA AHORRO PESOS CLASE A", 1_500_000),
  deb("2026-10-15", "NAVE DEVOLUCIÓN", "Operación ABC123", 25_000),
  deb("2026-10-16", "IMP. DEB. LEY 25413 GRAL.", null, 60_000),
  deb("2026-10-16", "TRANSF. CTAS PROPIAS", "Nuestra empresa", 500_000),
];

const { avisos, historiaSuficiente } = movimientosRaros(movs, "2026-10-01", "2026-10-31");
const de = (tipo: string) => avisos.filter((a) => a.tipo === tipo);

assert.ok(historiaSuficiente);

// La comisión subió de 75.000 a 95.000; la luz, igual en sus dos facturas, no.
assert.deepStrictEqual(de("subio").map((a) => [a.quien, a.monto]), [["COMISION SERVICIO DE CUENTA", 95_000]]);
assert.strictEqual(de("subio")[0].titulo, "Subió 27%");

// Nuevos: el débito automático (revisar aunque sea chico) y la persona.
const nuevos = de("nuevo");
assert.deepStrictEqual(nuevos.map((a) => a.quien).sort(), ["Persona Ejemplo", "Streaming Ejemplo"]);
assert.strictEqual(nuevos.find((a) => a.quien === "Streaming Ejemplo")!.titulo, "Débito automático nuevo");
assert.strictEqual(nuevos.find((a) => a.quien === "Streaming Ejemplo")!.gravedad, "revisar");
// "S.R.L.." y "SRL" son el mismo proveedor: no es nuevo.
assert.ok(!nuevos.some((a) => a.quien.startsWith("Proveedor")));

// El mismo millón al proveedor dos veces en dos días.
assert.strictEqual(de("duplicado").length, 1);
assert.deepStrictEqual(de("duplicado")[0].ids.length, 2);

// 3,5 millones cuando siempre sale 1 millón.
assert.strictEqual(de("fuera_de_lo_habitual").length, 1);
assert.strictEqual(de("fuera_de_lo_habitual")[0].monto, 3_500_000);

// Para saber, no para alarmarse.
assert.strictEqual(de("inversion")[0].gravedad, "info");
assert.strictEqual(de("devolucion")[0].gravedad, "info");

// Los impuestos proporcionales y las cuentas propias no generan avisos.
assert.ok(!avisos.some((a) => /LEY 25413|CTAS PROPIAS/.test(a.quien)));

// Lo grave va primero.
assert.ok(avisos.findIndex((a) => a.gravedad === "info") > avisos.findLastIndex((a) => a.gravedad === "revisar"));

// Un aumento se avisa el mes en que pasa, no todos los meses siguientes.
const noviembre = movimientosRaros(
  [...movs, deb("2026-11-05", "COMISION SERVICIO DE CUENTA", "Octubre 2026", 95_000)],
  "2026-11-01",
  "2026-11-30"
);
assert.strictEqual(noviembre.avisos.filter((a) => a.tipo === "subio").length, 0);

// Sin historia previa no se puede decir "nuevo": se avisa en vez de inventar.
const sinHistoria = movimientosRaros(movs, "2026-08-01", "2026-08-31");
assert.strictEqual(sinHistoria.historiaSuficiente, false);
assert.strictEqual(sinHistoria.avisos.filter((a) => a.tipo === "nuevo").length, 0);

// El destinatario sale de la referencia, salvo que sea un período o un código.
assert.strictEqual(quienDe({ descripcion: "X", referencia: "Septiembre 2026" }), null);
assert.strictEqual(quienDe({ descripcion: "X", referencia: "Operación ABC" }), null);
assert.strictEqual(quienDe({ descripcion: "X", referencia: "EDEMSA" }), "EDEMSA");

console.log("lib/compras/movimientosRaros.test.ts: todos los checks pasaron");
