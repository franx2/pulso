import assert from "node:assert";
import { pareceFactura, parsearFactura, verificarFactura } from "./factura";
import { RemitoIlegible } from "./remito";

// Factura inventada con la misma forma que la del proveedor (texto tal como
// sale de lib/compras/pdf.ts). Nombres, CUIT y precios son de ejemplo: el
// repo es público.
const FACTURA = `                                                A         Fecha: 10/11/2026          FVA id: 1
                                               COD. 01
                                                       FACTURA 00016-00000123
                                                  Condición de IVA: Inscripto
                                                  CUIT: 30111111110
  Razón Social: Proveedor de Ejemplo SRL
   Nombre:  CLIENTE DE EJEMPLO SAS (SUCURSAL CENTRO)      (Nro: 3
   Dirección: - Mendoza                                     CUIT: 30222222220
   Cond. IVA: Inscripto                                     Cond. Vta.: Cuenta Corriente
                  Producto                   Cant.     P. Unitario Subtotal  Alicuota Subtotal C/IVA
  CAFE DE PRUEBA x kg                         2,00     $10.000,00  $20.000,00  21%     $24.200,00
  PAN DE PRUEBA                               3,00     $1.000,00   $3.000,00   10,5%    $3.315,00
  PRESENTACION LARGA DE PRUEBA CHOCOLATE      1,00     $5.000,00   $5.000,00   21%      $6.050,00
  CON LECHE
  Observaciones:
  REMITO 07/11
                                                 Impuestos
                                                            Importe Neto Gravado       $28.000,00
                                                                      IVA 21%          $ 5.565,00
                                                                    Desc./Rec.         $ -1.473,68
                                                               Importe Total         $ 33.565,00
                                                                  CAE Nº: 1
                                              Página 1 de 1`;

assert.ok(pareceFactura(FACTURA));
const f = parsearFactura(FACTURA);
assert.strictEqual(f.numero, "FA 16-123");
assert.strictEqual(f.puntoVenta, 16);
assert.strictEqual(f.fecha, "2026-11-10");
// El nombre sin el número de cliente, y el CUIT del cliente, no el del proveedor.
assert.strictEqual(f.cliente, "CLIENTE DE EJEMPLO SAS (SUCURSAL CENTRO)");
assert.strictEqual(f.cuit, "30222222220");
assert.strictEqual(f.lineas.length, 3);
// El detalle que sigue en el renglón de abajo se une a su línea.
assert.strictEqual(f.lineas[2].detalle, "PRESENTACION LARGA DE PRUEBA CHOCOLATE CON LECHE");
assert.strictEqual(f.lineas[1].alicuota, 10.5);
assert.strictEqual(f.lineas[0].unidad, "Kilogramos");
assert.strictEqual(f.sumaLineas, 28000);
assert.strictEqual(f.netoGravado, 28000);
assert.strictEqual(f.iva, 5565);
// El subtotal es lo que se debe: el total con IVA. El descuento del pie ya
// está en los precios y no se resta otra vez.
assert.strictEqual(f.subtotal, 33565);
assert.strictEqual(f.remitoReferido, "2026-11-07");
assert.deepStrictEqual(verificarFactura(f), { ok: true, problemas: [] });

// Una línea que no se leyó tiene que saltar en la verificación, no pasar.
const sinUnaLinea = parsearFactura(FACTURA.replace(/^\s*PAN DE PRUEBA.*$/m, ""));
assert.ok(!verificarFactura(sinUnaLinea).ok);

// Un concepto en el pie que no se lee (percepción) también salta.
const conPercepcion = parsearFactura(FACTURA.replace("$ 33.565,00", "$ 34.000,00"));
assert.ok(verificarFactura(conPercepcion).problemas.some((p) => p.includes("percepciones")));

// Remito de diciembre facturado en enero: el año es el anterior.
const enero = parsearFactura(FACTURA.replace("10/11/2026", "05/01/2027").replace("REMITO 07/11", "REMITO 30/12"));
assert.strictEqual(enero.remitoReferido, "2026-12-30");

// Una factura B no se lee con este formato: ilegible, no mal leída.
assert.throws(() => parsearFactura(FACTURA.replace("COD. 01", "COD. 06")), RemitoIlegible);

console.log("lib/compras/factura.test.ts: todos los checks pasaron");
