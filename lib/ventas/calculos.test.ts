import assert from "node:assert";
import { resumenDeCaja, saldoDeVenta, totalesDeVenta } from "./calculos";
import { permisosDe } from "./permisos";
import { tipoDeMedio } from "./importarFudo";

// Lo anulado no suma.
const items = [
  { precio: 5000, cantidad: 2, anulado: false },
  { precio: 1900, cantidad: 1, anulado: false },
  { precio: 9000, cantidad: 1, anulado: true },
];
assert.deepStrictEqual(totalesDeVenta(items), { subtotal: 11900, descuento: 0, total: 11900 });

// El porcentaje gana sobre el monto, y ningún descuento deja el total negativo.
assert.deepStrictEqual(totalesDeVenta(items, { pct: 10, monto: 5000 }), { subtotal: 11900, descuento: 1190, total: 10710 });
assert.deepStrictEqual(totalesDeVenta(items, { monto: 50000 }), { subtotal: 11900, descuento: 11900, total: 0 });
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

// Los medios de Fudo se reconocen por el nombre.
assert.strictEqual(tipoDeMedio("Tarj. Débito"), "DEBITO");
assert.strictEqual(tipoDeMedio("Efectivo Uber Eats"), "APP_DELIVERY", "el efectivo de la app no es el del cajón");
assert.strictEqual(tipoDeMedio("Cta. Cte."), "CUENTA_CORRIENTE");

console.log("lib/ventas/calculos.test.ts: todos los checks pasaron");
