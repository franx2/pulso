import assert from "node:assert";
import { categoriaDe, parsearCsvBanco, ExtractoIlegible } from "./banco";

/**
 * Este parser sostiene la conciliación bancaria: si categoriza mal una fila
 * o rompe con un CSV real, la comparación contra Fudo queda mintiendo sin
 * que se note. Los casos vienen del extracto real que se usó para diseñarlo.
 */

// --- Categorización ---

assert.strictEqual(categoriaDe("NAVE PAGO CON TARJETA"), "TARJETA");
assert.strictEqual(categoriaDe("NAVE PAGO CON TRANSFERENCIA"), "TRANSFERENCIA");
assert.strictEqual(categoriaDe("CREDITO TRANSFERENCIA"), "TRANSFERENCIA", "transferencia sin pasar por Nave");
assert.strictEqual(categoriaDe("IMP. CRE. LEY 25413"), "IMPUESTO_COMISION");
assert.strictEqual(categoriaDe("IMP. DEB. LEY 25413 GRAL."), "IMPUESTO_COMISION");
assert.strictEqual(categoriaDe("COMISION SERVICIO DE CUENTA"), "IMPUESTO_COMISION");
assert.strictEqual(categoriaDe("IVA"), "IMPUESTO_COMISION");
assert.strictEqual(categoriaDe("PERCEP. IVA"), "IMPUESTO_COMISION");
assert.strictEqual(categoriaDe("TRF INMED PROVEED"), "OTRO", "pago a proveedor, no venta");
assert.strictEqual(categoriaDe("PAGO DE SERVICIOS"), "OTRO");
assert.strictEqual(categoriaDe("DEB. AUTOM. DE SERV."), "OTRO");

// --- CSV con ';' (Excel es-AR) ---

const csvPuntoYComa = [
  "Fecha;Descripcion;Origen;Debito;Credito;Saldo",
  "03/08/26;NAVE PAGO CON TRANSFERENCIA;Operacion ILB8661878;;10.521,99;9.089.910,55",
  "03/08/26;IMP. CRE. LEY 25413;;8.283,52;;10.451.691,53",
  "04/08/26;CREDITO TRANSFERENCIA;COELSA;;25.507,00;10.383.640,53",
].join("\n");

const filas = parsearCsvBanco(csvPuntoYComa);
assert.strictEqual(filas.length, 3);

assert.deepStrictEqual(filas[0], {
  fecha: "2026-08-03",
  descripcion: "NAVE PAGO CON TRANSFERENCIA",
  referencia: "Operacion ILB8661878",
  categoria: "TRANSFERENCIA",
  credito: 10_521.99,
  debito: 0,
  saldo: 9_089_910.55,
});

// El débito se guarda en positivo: el signo lo da la columna, no el número.
assert.strictEqual(filas[1].debito, 8_283.52);
assert.strictEqual(filas[1].credito, 0);
assert.strictEqual(filas[1].categoria, "IMPUESTO_COMISION");

// --- CSV con ',' y sin columna Origen (otro banco, otro export) ---

const csvComa = [
  "Fecha,Concepto,Debe,Haber,Saldo",
  '31/07/2026,"NAVE PAGO CON TARJETA",,143377.52,11362506.45',
].join("\n");
const filasComa = parsearCsvBanco(csvComa);
assert.strictEqual(filasComa.length, 1);
assert.strictEqual(filasComa[0].fecha, "2026-07-31", "año de 4 dígitos");
assert.strictEqual(filasComa[0].referencia, null);
assert.strictEqual(filasComa[0].categoria, "TARJETA");

// --- Filas que no aportan nada financiero se descartan ---

const csvConRuido = [
  "Fecha;Descripcion;Debito;Credito;Saldo",
  "03/08/26;Resumen de Cuenta;;;", // línea informativa sin débito ni crédito
  "03/08/26;NAVE PAGO CON TARJETA;;591.114,01;10.310.109,12",
  "04/08/26;Operacion sin monto;;;9.999.999,00", // nada en débito ni crédito
].join("\n");
const filasRuido = parsearCsvBanco(csvConRuido);
assert.strictEqual(filasRuido.length, 1, "sólo la fila con plata real");

// --- Errores explícitos, no adivinar ---

assert.throws(() => parsearCsvBanco("sólo un encabezado sin filas"), ExtractoIlegible);
assert.throws(
  () => parsearCsvBanco("Columna1;Columna2\nvalor;valor"),
  ExtractoIlegible,
  "sin columna Fecha reconocible"
);

console.log("lib/compras/banco.test.ts: todos los checks pasaron");
