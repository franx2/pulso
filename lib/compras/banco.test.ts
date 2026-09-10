import assert from "node:assert";
import { categoriaDe, parsearCsvBanco, parsearPdfBanco, ExtractoIlegible } from "./banco";

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

// --- PDF (Banco Galicia): texto ya reconstruido por lib/compras/pdf.ts ---
//
// Los fragmentos son del formato real de un extracto de 33 páginas: cabecera
// de cuenta en la página 1, movimientos con uno o más renglones de
// referencia abajo, un corte de página en medio de la lista, y el resumen de
// cierre (retenciones, aclaraciones legales) al final sin ninguna fecha.

const pdfExtracto = `
                            R esumen de Cuenta Corriente en Pesos
          CUMBRES Y PLACERES S. A. S.         CUIT del Responsable Impositivo : 30-71880897-5
          Datos de la cuenta             Período de movimientos         Saldos
          Cuenta Corriente en Pesos
      Movimientos
      Fecha   Descripción            Origen        Crédito             Débito             Saldo
      03/08/26 NAVE PAGO CON TRANSFERENCIA           10.521,99                          9.089.910,55
              Operaciìn ILB8661878
      03/08/26 IMP. CRE. LEY 25413                                     -8.283,52       10.451.691,53
      Resumen de Cuenta Corriente en Pesos                                             Página 1 / 33
      20260831047001347H
                            Resumen de Cuenta Corriente en Pesos
      Fecha   Descripción            Origen        Crédito             Débito             Saldo
      04/08/26 NAVE PAGO CON TARJETA                641.116,25                         11.024.756,78
              Grupo de acreditaciì
      04/08/26 CREDITO TRANSFERENCIA                25.507,00                          10.383.640,53
              COELSA
              EBANX SA
              30715313886
      07/08/26 TRF INMED PROVEED                                     -6.500.000,00       6.004.994,14
              BIANCO Y NERO SRL
              VARIOS
              BANCO BBVA ARGENTINA
      Resumen de Cuenta Corriente en Pesos                                             Página 2 / 33
      31/08/26 IMP. CRE. LEY 25413                                        -319,71       6.055.842,82
      Total                                 $ 16.005.765,45    -$ 19.029.311,19   $ 6.055.842,82
      Consolidado de retención de impuestos
      Consolidado                                                                           Importe
      PERIODO COMPRENDIDO ENTRE EL 31-07-2026 Y EL 31-08-2026                              18.210,00
      TOTAL IMPUESTO I.V.A. SOBRE DEBITOS
      Canales de atención
      Ingresá a "Ayudas para tus dudas" desde bancogalicia.com
`;

const filasPdf = parsearPdfBanco(pdfExtracto);

// La cabecera de cuenta (página 1, sin fecha al principio) no generó ningún
// movimiento fantasma.
assert.strictEqual(filasPdf.length, 6);

assert.deepStrictEqual(filasPdf[0], {
  fecha: "2026-08-03",
  descripcion: "NAVE PAGO CON TRANSFERENCIA",
  referencia: "Operaciìn ILB8661878",
  categoria: "TRANSFERENCIA",
  credito: 10_521.99,
  debito: 0,
  saldo: 9_089_910.55,
});

// El importe negativo es débito, sin comerse el signo.
assert.strictEqual(filasPdf[1].debito, 8_283.52);
assert.strictEqual(filasPdf[1].credito, 0);
assert.strictEqual(filasPdf[1].categoria, "IMPUESTO_COMISION");
// Y el corte de página que sigue no quedó pegado como si fuera su referencia.
assert.strictEqual(filasPdf[1].referencia, null);

// El corte de página tampoco contaminó el primer movimiento de la página 2.
assert.strictEqual(filasPdf[2].descripcion, "NAVE PAGO CON TARJETA");
assert.strictEqual(filasPdf[2].categoria, "TARJETA");
assert.strictEqual(filasPdf[2].referencia, "Grupo de acreditaciì");

// Tres renglones de referencia seguidos se concatenan en uno solo.
assert.strictEqual(filasPdf[3].descripcion, "CREDITO TRANSFERENCIA");
assert.strictEqual(filasPdf[3].categoria, "TRANSFERENCIA", "transferencia sin pasar por Nave");
assert.strictEqual(filasPdf[3].referencia, "COELSA · EBANX SA · 30715313886");

// Un pago a proveedor es "Otro", no una venta — y trae su propia referencia.
assert.strictEqual(filasPdf[4].descripcion, "TRF INMED PROVEED");
assert.strictEqual(filasPdf[4].categoria, "OTRO");
assert.strictEqual(filasPdf[4].debito, 6_500_000);
assert.strictEqual(filasPdf[4].referencia, "BIANCO Y NERO SRL · VARIOS · BANCO BBVA ARGENTINA");

// El resumen de cierre —sin una sola fecha— no generó movimientos, y sobre
// todo no se le pegó entero como referencia al último movimiento real.
assert.strictEqual(filasPdf[5].descripcion, "IMP. CRE. LEY 25413");
assert.strictEqual(filasPdf[5].saldo, 6_055_842.82);
assert.strictEqual(filasPdf[5].referencia, null, "el resumen de cierre no es la referencia de este movimiento");

// Un PDF sin ningún renglón con fecha e importe es ilegible, no una lista vacía.
assert.throws(() => parsearPdfBanco("Esto no es un extracto bancario, es otra cosa"), ExtractoIlegible);

console.log("lib/compras/banco.test.ts: todos los checks pasaron");
