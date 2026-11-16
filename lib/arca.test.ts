import assert from "node:assert/strict";
import { alertaCertificado } from "./arca";

// Autofirmado de prueba (CN=prueba), vence el 6/12/2026 16:13:49 UTC.
const CERT = `-----BEGIN CERTIFICATE-----
MIIDAzCCAeugAwIBAgIUCF6KeRaIu/SyAmV0ZgiX7vcHNQEwDQYJKoZIhvcNAQEL
BQAwETEPMA0GA1UEAwwGcHJ1ZWJhMB4XDTI2MTExNjE2MTM0OVoXDTI2MTIwNjE2
MTM0OVowETEPMA0GA1UEAwwGcHJ1ZWJhMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A
MIIBCgKCAQEAzqPujmBnFV5Xd8kj2BF2FUNt9gnCYJn6Div/0I8jsms7ahj7rKx2
pJouT9w7YWTS/HRspga6RxmU5JsOYjsQx/UAy74/MNQ4Mz+vEo70KSxpCbNUnRXj
RWGKDT8aDlfT9pajzSD/0hx+gu3KpprzWygB6KFIISj9uGT1h6eKAEAQsUQVfUBT
3hZPVSxUDed4Td1S5D9j2Eq//TN/qOX+DKGS4VEvX60YcTv/xPo5skVRfwjarWol
oFcx0SxAFzpFAmZSSGERJVItgi7NhGAXyTw65Gp4Z6wLT7McCvm1Yhwl2QOhp0ai
6p3P/EfSkG0G0Aqq2ltfZAPwa4mt3rvvsQIDAQABo1MwUTAdBgNVHQ4EFgQUTmeZ
wey3bnjqDN7iYpBILEES6sYwHwYDVR0jBBgwFoAUTmeZwey3bnjqDN7iYpBILEES
6sYwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEABALlLCLPgMkS
PaFssHzN8aG2VXtddWx60po74qo6L5+0zieQhNp6euRW5RuUgCltNiknhvnacXok
+zrxo65lfxABru1mZj9ObEzOOlAwi5zCINleM+5dCtVq+4UX0GnmPiu4deL1P+9D
C35OLj7ASsnMpg9SxIVb0LL1JGqzOrDvbsiWIRq0JQTEPDhNO3elqOhceNv2CKsp
t8cMknZOnC3F+p324vyxeX3vmw56xOqxKQ1aFJUKt/LXD4+tnK22nMPABofcoZ6e
mrYFdQRGJySDK5HDE5BERT3+TFwR2ZxiRGckZ3KdI0AWdiqcgXo9FrvZ7PbsyPdy
kgioshaLxA==
-----END CERTIFICATE-----`;

const local = { id: "l1", nombre: "Las Cañas", arcaCertificado: CERT };
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

assert.equal(alertaCertificado({ ...local, arcaCertificado: null }), null, "sin certificado no avisa");
assert.equal(alertaCertificado(local, dia("2026-10-01")), null, "faltan más de 30 días");

const amarilla = alertaCertificado(local, dia("2026-11-16"));
assert.equal(amarilla?.tono, "amber");
assert.match(amarilla!.texto, /vence el 6\/12\/2026 \(en 21 días\)/);

assert.equal(alertaCertificado(local, dia("2026-12-02"))?.tono, "rose", "última semana");
assert.match(alertaCertificado(local, dia("2026-12-06"))!.texto, /en 1 día\)/);
assert.match(alertaCertificado(local, dia("2026-12-10"))!.texto, /venció el 6\/12\/2026/);
assert.match(alertaCertificado({ ...local, arcaCertificado: "basura" })!.texto, /no se puede leer/);

console.log("arca ok");

// ─── CUIT, QR, IVA ───
import { cuitValido, urlQrArca, desglosarIva } from "./arca";

assert.ok(cuitValido("30718808975"));
assert.ok(cuitValido("20-41795738-4"));
assert.ok(!cuitValido("30718808976"), "verificador mal");
assert.ok(!cuitValido("3071880897"), "le falta un dígito");

const { neto, iva } = desglosarIva(1210);
assert.deepEqual([neto, iva], [1000, 210]);
const d = desglosarIva(999.99);
assert.equal(Math.round((d.neto + d.iva) * 100) / 100, 999.99, "neto + IVA da el total exacto");

const url = urlQrArca({
  fecha: dia("2026-11-16"), cuit: "30-71880897-5", ptoVta: 1, tipo: 6, numero: 2, total: 1210,
  docTipo: 99, docNro: "0", cae: "86461069596264",
});
const qr = JSON.parse(Buffer.from(url.split("?p=")[1], "base64").toString());
assert.equal(qr.fecha, "2026-11-16");
assert.equal(qr.cuit, 30718808975);
assert.equal(qr.codAut, 86461069596264);
assert.equal(qr.tipoCodAut, "E");

console.log("arca cuit/qr/iva ok");
