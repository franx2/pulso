import assert from "node:assert/strict";
import {
  esHeladoComprado,
  esVentaRelacionadaConHelado,
  reglaParaVentaHelado,
  resumirHelado,
} from "./consumoHelado";

assert.equal(reglaParaVentaHelado("CUCURUCHO 1 SABOR")?.gramos, 90);
assert.equal(reglaParaVentaHelado("CUCURUCHO 2 SABORES")?.gramos, 180);
assert.equal(reglaParaVentaHelado("CUCURUCHON 3 SABORES")?.gramos, 270);
assert.equal(reglaParaVentaHelado("1/4KG HELADO CHOCOTORTA DELIVERY")?.gramos, 270);
assert.equal(reglaParaVentaHelado("HELADO 1/2 KG PYA")?.gramos, 550);
assert.equal(reglaParaVentaHelado("HELADO 1 KG PROMOCION")?.gramos, 1070);
assert.equal(reglaParaVentaHelado("EXTRA BOCHA DE HELADO")?.gramos, 90);
assert.equal(reglaParaVentaHelado("LICUADO DE HELADO Y LECHE"), null);

assert.equal(esHeladoComprado("HELADO DE PISTACHO"), true);
assert.equal(esHeladoComprado("POTE DE HELADO 1 KG 25UN"), false);
assert.equal(esHeladoComprado("CUCHARA HELADO DE PLASTICO"), false);
assert.equal(esVentaRelacionadaConHelado("CUCURUCHO X1"), false);
assert.equal(esVentaRelacionadaConHelado("LICUADO DE HELADO Y LECHE"), true);

const resumen = resumirHelado(
  [
    { detalle: "HELADO DE CHOCOLATE", cantidadKg: 7.265, costo: 100 },
    { detalle: "HELADO DE PISTACHO", cantidadKg: 5, costo: 50 },
    { detalle: "POTE DE HELADO 1 KG 25UN", cantidadKg: 1, costo: 20 },
  ],
  [
    { producto: "CUCURUCHO 1 SABOR", cantidad: 10 },
    { producto: "CUCURUCHO 2 SABORES", cantidad: 5 },
    { producto: "CUCURUCHON 3 SABORES", cantidad: 2 },
    { producto: "HELADO 1/4KG DELIVERY", cantidad: 4 },
    { producto: "HELADO 1/2KG", cantidad: 2 },
    { producto: "HELADO 1KG", cantidad: 1 },
    { producto: "ADICIONAL BOCHA DE HELADO", cantidad: 2 },
    { producto: "LICUADO DE HELADO Y LECHE", cantidad: 3 },
    { producto: "WAFFLE HELADO / BROWNIE", cantidad: 1 },
    { producto: "ADICIONAL CUCURUCHO", cantidad: 10 },
  ]
);

assert.ok(Math.abs(resumen.compradoKg - 12.265) < 0.0001);
assert.ok(Math.abs(resumen.vendidoKgEstimado - 5.77) < 0.0001);
assert.ok(Math.abs((resumen.balanceKg ?? 0) - 6.495) < 0.0001);
assert.equal(resumen.unidadesConRegla, 26);
assert.equal(resumen.unidadesSinRegla, 4);
assert.ok(Math.abs((resumen.coberturaPct ?? 0) - 86.6666667) < 0.0001);
assert.equal(resumen.formatos.length, 6);
assert.equal(resumen.sabores.length, 2);
assert.deepEqual(
  resumen.sinRegla.map((fila) => fila.producto),
  ["LICUADO DE HELADO Y LECHE", "WAFFLE HELADO / BROWNIE"]
);

const sinCompras = resumirHelado([], [{ producto: "HELADO 1KG", cantidad: 2 }]);
assert.equal(sinCompras.balanceKg, null);
assert.equal(sinCompras.ratioVendidoCompradoPct, null);

console.log("lib/compras/consumoHelado.test.ts: todos los checks pasaron");
