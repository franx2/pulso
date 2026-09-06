import assert from "node:assert";
import {
  fechaCompleta,
  fechaCorta,
  fechaLarga,
  kilos,
  mesLargo,
  numero,
  numeroCompacto,
  plata,
  plataCompacta,
  porcentaje,
  rango,
} from "./formato";

// EL BUG QUE ESTO ARREGLA: cinco pantallas escribían "$-629.415". El signo va
// antes del símbolo, como fija la regla de alineación numérica de DESIGN.md, y
// el error se veía en la tabla de sectores.
assert.strictEqual(plata(-629415), "-$629.415");
assert.strictEqual(plata(629415), "$629.415");
assert.strictEqual(plata(0), "$0");
// Redondea a peso entero: los centavos no deciden nada acá.
assert.strictEqual(plata(1234.56), "$1.235");
assert.strictEqual(plata(-0.4), "$0", "menos de medio peso no muestra un signo que confunde");

assert.strictEqual(plataCompacta(1_500_000), "$1,5M");
assert.strictEqual(plataCompacta(-1_500_000), "-$1,5M");
assert.strictEqual(plataCompacta(340_000), "$340k");
assert.strictEqual(plataCompacta(-340_000), "-$340k");
assert.strictEqual(plataCompacta(850), "$850");

assert.strictEqual(numero(1234), "1.234");
assert.strictEqual(numero(1234.56, 1), "1.234,6");
assert.strictEqual(kilos(7.265), "7,3 kg");
// Compacto para ejes y tarjetas, donde el ancho manda.
// El locale usa espacio duro entre cifra y sufijo, que es lo correcto: evita
// que "1,5" y "K" queden en renglones distintos.
assert.strictEqual(numeroCompacto(1500).replace(/ /g, " "), "1,5 K");

// Un porcentaje que no se puede calcular NO es cero. Confundir "no cambió" con
// "no se puede comparar" es el bug que ya apareció tres veces en el proyecto.
assert.strictEqual(porcentaje(null), "—");
assert.strictEqual(porcentaje(undefined), "—");
assert.strictEqual(porcentaje(Number.NaN), "—");
assert.strictEqual(porcentaje(0), "0.0%".replace(".", "."));
assert.strictEqual(porcentaje(12.34), "12.3%");
assert.strictEqual(porcentaje(12.34, { signo: true }), "+12.3%");
assert.strictEqual(porcentaje(-4.5, { signo: true }), "-4.5%");
assert.strictEqual(porcentaje(31.6, { decimales: 0 }), "32%");

// Las fechas se formatean al mediodía UTC para que ningún huso las corra un
// día. Sin eso, "2026-08-28" se muestra como 27 en Argentina.
assert.match(fechaCorta("2026-08-28"), /^28 ago/);
assert.match(fechaLarga("2026-08-28"), /2026$/);
assert.match(fechaCompleta("2026-08-28"), /^viernes/);
assert.match(mesLargo("2026-08"), /^agosto/);
// Y el 1 de enero no puede caer en diciembre del año anterior.
assert.match(fechaLarga("2026-01-01"), /^01 ene.*2026$/);

// Acepta también un ISO completo, que es como llega un @db.Date serializado.
assert.strictEqual(fechaCorta("2026-08-28T00:00:00.000Z"), fechaCorta("2026-08-28"));

// Un rango dentro del mismo mes no repite el mes: "28 – 31 ago".
assert.match(rango("2026-08-28", "2026-08-31"), /^28 – 31 ago/);
assert.match(rango("2026-08-28", "2026-09-05"), /^28 ago – 05 sep/);

console.log("lib/formato.test.ts: todos los checks pasaron");
