import assert from "node:assert";
import { esDelProveedor } from "./correo";

// Direcciones de ejemplo: las reales viven en REMITOS_REMITENTE, nunca en el
// repo, que es público.
const viejo = '"Proveedor" <ventas@123.envios-ejemplo.com>';
const nuevo = "Proveedor <info@sistema-ejemplo.net>";

// Un solo remitente: como estaba configurado hasta septiembre.
assert.ok(esDelProveedor(viejo, "envios-ejemplo.com"));
assert.ok(!esDelProveedor(nuevo, "envios-ejemplo.com"));

// Varios, separados por coma, con o sin "@" y con espacios.
const filtro = "@envios-ejemplo.com, info@sistema-ejemplo.net";
assert.ok(esDelProveedor(viejo, filtro));
assert.ok(esDelProveedor(nuevo, filtro));
assert.ok(esDelProveedor("INFO@SISTEMA-EJEMPLO.NET", filtro));
assert.ok(!esDelProveedor("alguien@gmail.com", filtro));

// Sin filtro pasa todo; una coma suelta no deja pasar todo.
assert.ok(esDelProveedor("alguien@gmail.com", null));
assert.ok(!esDelProveedor("alguien@gmail.com", " , "));

console.log("lib/compras/correo.test.ts: todos los checks pasaron");
