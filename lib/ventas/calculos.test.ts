import assert from "node:assert";
import { montoDescuento, resumenDeCaja, saldoDeVenta, totalesDeVenta } from "./calculos";
import { permisosDe } from "./permisos";
import { tipoDeMedio } from "./importarFudo";

// Lo anulado no suma.
const items = [
  { precio: 5000, cantidad: 2, anulado: false },
  { precio: 1900, cantidad: 1, anulado: false },
  { precio: 9000, cantidad: 1, anulado: true },
];
assert.deepStrictEqual(totalesDeVenta(items), { bruto: 11900, descuentoItems: 0, subtotal: 11900, descuento: 0, total: 11900 });

// Con porcentaje, el monto es el tope; ningún descuento deja el total negativo.
assert.strictEqual(totalesDeVenta(items, { pct: 10, monto: 5000 }).descuento, 1190, "10% no llega al tope de 5.000");
assert.strictEqual(totalesDeVenta(items, { pct: 50, monto: 5000 }).descuento, 5000, "50% se corta en el tope");
assert.strictEqual(totalesDeVenta(items, { monto: 50000 }).total, 0);

// Descuento por producto ("Empleado 50%" en un cortado) y después el de la venta sobre lo que queda.
const conItem = totalesDeVenta(
  [
    { precio: 5000, cantidad: 2, anulado: false, descuentoPct: 50 },
    { precio: 2000, cantidad: 1, anulado: false, descuentoMonto: 500 },
  ],
  { pct: 10 }
);
assert.deepStrictEqual(conItem, { bruto: 12000, descuentoItems: 5500, subtotal: 6500, descuento: 650, total: 5850 });
assert.strictEqual(totalesDeVenta(items, { pct: 150 }).total, 0);

// Pago dividido y vuelto; la propina no cuenta como pago de la venta.
assert.deepStrictEqual(
  saldoDeVenta(10710, [
    { monto: 5000, propina: 0, anulado: false },
    { monto: 6000, propina: 1000, anulado: false },
    { monto: 9999, propina: 0, anulado: true },
  ]),
  { pagado: 11000, propinas: 1000, falta: 0, vuelto: 290 }
);
assert.strictEqual(saldoDeVenta(10000, [{ monto: 4000, propina: 0, anulado: false }]).falta, 6000);

// Caja: el efectivo esperado es fondo + efectivo cobrado (con su propina) + ingresos − retiros.
const caja = resumenDeCaja(
  20000,
  [
    { monto: 10000, propina: 500, anulado: false, efectivo: true, medio: "Efectivo" },
    { monto: 8000, propina: 1000, anulado: false, efectivo: false, medio: "Débito" },
    { monto: 3000, propina: 0, anulado: true, efectivo: true, medio: "Efectivo" },
  ],
  [
    { tipo: "EGRESO", monto: 4000 },
    { tipo: "INGRESO", monto: 1000 },
  ]
);
assert.strictEqual(caja.efectivoEsperado, 20000 + 10500 + 1000 - 4000);
assert.strictEqual(caja.vendido, 18000);
assert.deepStrictEqual(caja.porMedio, [
  { medio: "Efectivo", monto: 10000 },
  { medio: "Débito", monto: 8000 },
]);

// Permisos con los códigos de Fudo: un "cannot_" niega aunque el permiso esté.
const roles = new Map([["Camarero", { permisos: ["create_additions", "close_sales", "cannot_close_sale"] }]]);
const mozo = permisosDe("EMPLEADO", null, roles);
assert.strictEqual(mozo.create_additions, true, "sin rol asignado, el empleado usa el rol Camarero");
assert.strictEqual(mozo.close_sales, false, "cannot_close_sale gana");
assert.strictEqual(permisosDe("ADMIN", { permisos: [] }, roles).close_sales, true, "el admin de Pulso puede todo");
assert.strictEqual(permisosDe("EMPLEADO", null, new Map()).create_additions, true, "sin roles importados, lo básico");
assert.strictEqual(permisosDe("EMPLEADO", null, new Map()).create_payments, false);
const cajero = permisosDe("EMPLEADO", { permisos: ["list_discounts"] }, new Map());
assert.strictEqual(cajero.apply_discounts, true, "quien ve la lista de descuentos de Fudo puede aplicarlos");
assert.strictEqual(cajero.create_discounts, false, "pero no inventar uno libre");
assert.strictEqual(permisosDe("EMPLEADO", { permisos: ["create_discounts", "cannot_apply_discount"] }, new Map()).apply_discounts, false);

// Los medios de Fudo se reconocen por el nombre.
assert.strictEqual(tipoDeMedio("Tarj. Débito"), "DEBITO");
assert.strictEqual(tipoDeMedio("Efectivo Uber Eats"), "APP_DELIVERY", "el efectivo de la app no es el del cajón");
assert.strictEqual(tipoDeMedio("Cta. Cte."), "CUENTA_CORRIENTE");

assert.strictEqual(montoDescuento(1000, { pct: 100 }), 1000, "cortesía 100%");
assert.strictEqual(montoDescuento(1000, { monto: 5000 }), 1000, "un monto fijo no descuenta más que la base");

console.log("lib/ventas/calculos.test.ts: todos los checks pasaron");
