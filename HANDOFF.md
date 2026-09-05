# Handoff — Pulso Operativo

**Proyecto:** `C:\Users\andmar1\controlpersonal`
**GitHub:** https://github.com/franx2/pulso (público — nunca commitear secretos acá)
**Rama:** `master`, sincronizada con `origin/master`. El deploy a Vercel es manual (§10)
**Producción:** https://pulso-t572.vercel.app — Vercel (`pulso-t572`, scope `franx2s-projects`) + Neon Postgres
**Producción vieja:** https://web-production-e88dab.up.railway.app — Railway, ya no recibe escrituras, pendiente de apagar

Última actualización: 2026-09-05.

---

## 1. Lo primero que hay que arreglar

### 🔴 `lib/fechas.ts` depende del timezone del proceso, y Vercel corre en UTC

Es el problema más grave abierto y **está afectando producción ahora**. Medido el 2026-09-05 a
las 02:27 UTC (23:27 en Argentina, todavía día 4):

```
inicioDelDia() devuelve   2026-09-05T00:00:00Z
debería devolver          2026-09-04T03:00:00Z   (00:00 hora argentina)
desfasaje                 21 horas
```

`inicioDelDia`, `finDelDia`, `desdeISO`, `claveDia` y `claveSemana` usan los getters locales de
`Date` (`getFullYear`/`getMonth`/`getDate`), así que asumen que el proceso corre en
`America/Argentina/Buenos_Aires`. **Vercel rechaza `TZ` como nombre de variable de entorno**, así
que no se arregla seteando la variable: hay que reescribir esas funciones con aritmética de
offset explícita.

Qué toca: los fichajes del día en `/fichar`, los rangos de reportes y la asignación de turnos —
o sea el corazón de la app original.

Qué NO toca: nada del dashboard ni del pronóstico. Ese código usa aritmética UTC explícita a
propósito (`claveDiaAR` en `lib/resumenDiario.ts`, `hoyAR` y `slotDesdeISO` en `lib/forecast/`).
Cuando arregles `lib/fechas.ts`, copiá ese patrón.

`comoFechaSql` y `formatearFechaSql` ya son UTC explícito y están bien.

### 🟡 Antes de apagar Railway

1. Que el usuario confirme login y fichaje reales desde su celular en `pulso-t572.vercel.app`
   (passkey, cámara y GPS no se pueden probar desde un navegador de sandbox).
2. Arreglar el `TZ` de arriba.
3. **Rotar la contraseña del Postgres de Railway**: durante la migración quedó impresa en texto
   plano en una conversación.

### 🟡 Passkeys atadas al dominio

WebAuthn vincula la credencial al `RP_ID`. Los empleados que registraron su huella en Railway
**tienen que volver a registrarla** en `pulso-t572.vercel.app`. Si después se pone un dominio
propio, hay un tercer re-registro. Conviene decidir el dominio final antes de que se registren
más passkeys.

---

## 2. Qué es la app

Control de personal para vender a negocios gastronómicos. **Jumbo, Las Cañas, Chacras y
QuickPoint son las sucursales del cliente, no el nombre del producto.**

- Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- Prisma 6.19.3 + PostgreSQL (Neon). No actualizar Prisma sin mirar la config del datasource.
- Login con passkey (WebAuthn) o contraseña; sesión con `iron-session`.
- Roles: `EMPLEADO < ENCARGADO < ADMIN`.

Contexto de producto completo: [`PRODUCT.md`](PRODUCT.md).

Creció en tres módulos que conviene entender por separado:

| Módulo | Para qué | De dónde saca los datos |
|---|---|---|
| **Asistencia** | fichaje, turnos, ausencias, correcciones, reportes de horas y liquidación | la propia app |
| **Dashboard** | centro de comando: facturación, tickets, resultado, excepciones y comparación por local | Fudo → tablas locales |
| **Pronóstico** | demanda a 7/15/30 días, intervalo, backtest y evidencia del modelo | Fudo + clima → modelo propio |

---

## 3. Estado de los datos (verificado 2026-09-05)

Los cuatro locales tienen Fudo configurado y un año de historia cargada:

| Local | Tipo | Ventana de perfil | WAPE día |
|---|---|---:|---:|
| Chacras | `OPEN_AIR` | 45 d | 12,7% |
| Jumbo | `INDOOR_MALL` | 90 d | 8,9% |
| Las cañas | `OPEN_AIR` | 45 d | 8,7% |
| QuickPoint | `OPEN_AIR` | 180 d | 8,8% |

La "ventana de perfil" no se elige a dedo: la calibra el backtest (ver §6).

**Lo que sí está medido**: demanda, ventas, tickets, mix por canal/categoría/medio de pago,
descuentos por caja, sensibilidad al clima.

**Lo que todavía es un supuesto declarado, no una medición** (y la app lo dice en pantalla):

- **Capacidad por empleado** → toda la recomendación de dotación cuelga de esto. Se aprende de
  los fichajes y hoy hay ~34 en total, con dos locales sin empleados cargados.
  `aprenderCapacidad()` devuelve `null` por debajo de 30 observaciones en vez de inventar.
- **Food cost** → Fudo tiene el campo de costo por producto pero está casi todo en `null`. Da
  ~11-20%, que para gastronomía es imposible. Se marca con `*`.
- **Stock** → el módulo de stock de Fudo no se usa: descuenta con las ventas pero nadie carga
  la mercadería que entra, de ahí stocks negativos grandes (TÉ DILMAH −482). `StockDiario` mide
  "movimiento no explicado por las ventas", que sí sirve hoy; el día que carguen compras se
  vuelve un "debería haber vs. hay" de verdad.

---

## 4. Mapa del código

```text
prisma/schema.prisma          modelo completo
lib/
  fechas.ts                   ⚠️ ver §1
  horas.ts jornada.ts pago.ts cálculo de horas, jornadas y liquidación
  session.ts webauthn.ts      auth
  geo.ts rostro.ts            geocerca y reconocimiento facial
  fudo.ts                     cliente de la API de Fudo (token, ventas, pagos, cajas, gastos)
  fudoSync.ts                 mapa de calor de demanda
  fudoResumen.ts              sync diario → ResumenDiario + ProductoDiario
  resumenDiario.ts            agregación diaria (pura, testeada)
  fudoStock.ts                foto diaria de stock
  forecast/
    categorias.ts             normaliza las categorías crudas de Fudo (110 → 53)
    slots.ts                  franjas de 30 min en hora argentina
    dataset.ts                Fudo → DemandaSlot (serie de 30 min)
    perfil.ts                 patrón por local × día × franja, K_trend
    k.ts                      motor de Factor K (composición, recorte, explicación)
    carga.ts                  SectorLoadScore
    dotacion.ts               carga → personas, aprendizaje de capacidad
    clima.ts                  Open-Meteo + sensibilidad por tipo de local
    tendencia.ts              tendencia de ventas semanal y proyección
    analitica.ts              correlaciones históricas y resumen explicable de factores
    backtest.ts               MAE / RMSE / WAPE, intervalos
    evaluacion.ts             backtesting y calibración de ventana
    motor.ts                  orquestación del pronóstico
    configuracion.ts          siembra de matrices editables
app/
  fichar/                     fichaje del empleado (móvil)
  admin/dashboard/            comando, comparación local, productos y control
  admin/pronostico/           proyección, modelo, correlaciones y tendencia por local
  admin/pronostico/ajustes/   K manual, capacidades, matriz sector, clima
  admin/{turnos,presencia,reportes,empleados,arqueos,configuracion}/
  api/                        rutas API
```

`components/AnalyticsCharts.tsx` contiene los gráficos comparativos del comando y la transición
historia → pronóstico con intervalo. No hay una dependencia externa de gráficos.

### Estado de la interfaz analítica (rediseño 2026-09-05)

El dashboard dejó de ser una mezcla de reportes. Un único contexto de **cadena/local + período**
gobierna cada cifra. Los períodos disponibles son 7 días, 30 días, mes en curso, mes calendario,
año calendario y rango personalizado de hasta 730 días. Siempre se muestra el rango exacto, su
referencia y la cobertura de datos.

Las vistas del centro de comando son:

1. **Rendimiento**: facturación, tickets, ticket promedio, resultado, curva contra el período
   anterior y excepciones accionables.
2. **Locales**: tabla comparativa y apertura de canal, medio de pago y categoría sin perder el
   período elegido.
3. **Productos y control**: rankings y stock separados de las métricas de negocio.

El pronóstico quedó dividido en **Proyección** y **Modelo y evidencia**. La primera conecta datos
reales con el escenario central y su intervalo, resume por semana y compara locales con la misma
regla. La segunda muestra `Base × tendencia × clima × calendario × ajuste`, el WAPE y sesgo de
15 días reservados para prueba, correlaciones de Pearson y sensibilidad climática medida. Las
correlaciones son descriptivas y la UI dice explícitamente que no demuestran causalidad.

Se retiraron de la vista principal la lista diaria de chips de dotación y el detalle de 30 minutos.
La conversión demanda → personas sigue en el motor y en Ajustes, pero no se presenta como una
recomendación confiable hasta tener suficientes fichajes reales. Las viejas tarjetas de sparklines
por local también se reemplazaron por una comparación tabular con semanas incompletas declaradas.

En móvil, las tablas decisivas se convierten en filas verticales completas; no se esconden columnas
detrás de scroll horizontal. El sistema visual quedó documentado en `DESIGN.md` y
`.impeccable/design.json`. Las capturas de revisión quedan en `.impeccable/review/`, **fuera de
git**: son pantallas con la facturación real del cliente y el repo es público.

Tests: `npm test` corre los archivos `*.test.ts` de `lib/`. La lógica pura del pronóstico,
correlaciones y resumen de factores está cubierta en `lib/forecast/forecast.test.ts`.

---

## 5. Crons

Todos con `Authorization: Bearer $CRON_SECRET`. **Scheduler externo** — este proyecto no usa
Vercel Cron y no hay `vercel.json`.

| Endpoint | Cuándo | Tiempo medido | Qué hace |
|---|---|---|---|
| `/api/cron/resumen?dias=7` | cada hora | ~40 s | refresca el dashboard |
| `/api/cron/resumen?dias=90&local=<nombre>` | semanal, **una llamada por local** | ~1,5 min c/u | recupera días viejos corregidos en Fudo |
| `/api/cron/semanal` | semanal | **106 s** | refresca franjas, **recalibra la ventana de cada local** y remide el clima |
| `/api/cron/stock` | diario, **hora fija post-cierre** | ~2 min | foto de stock |
| `/api/cron/demanda` | semanal | ~1 min | mapa de calor de Turnos → Semana |
| `/api/cron/alertas` | cada hora | rápido | tardanzas, faltas, salidas olvidadas |

**El resync largo va por local a propósito**: los cuatro juntos tardan 5:26 y la función corta a
los 300 s, así que nunca terminaba. Con `?local=<nombre>` entra holgado.

**La foto de stock tiene que correr siempre a la misma hora**: Fudo devuelve el stock de ese
instante, así que dos corridas a horas distintas no son comparables entre sí.

`CRON_SECRET` está seteado en Vercel (Production + Preview) pero **no se puede leer** —
`vercel env pull` devuelve `[SENSITIVE]`. Se le mostró al usuario una sola vez y no quedó en
ningún archivo. Si se perdió: `vercel env rm CRON_SECRET production` y crear uno nuevo,
después actualizar el scheduler.

---

## 6. Cómo funciona el pronóstico

```
FinalDemand = BaseDemand × K_auto × K_manual
K_auto = K_calendar × K_weather × K_location × K_event × K_promotion × K_trend
         recortado a [0.60, 1.60]
```

Tres decisiones que cambian el resultado y no son obvias:

**El día de la semana NO va en `K_calendar`.** El perfil base ya es día × franja, así que
aplicar "+21% porque es viernes" contaría el viernes dos veces. `K_calendar` sólo toma lo que el
perfil no captura: feriados, vísperas, posición en el mes.

**La ventana de historia se calibra por local, y un año pierde.** Medido:

```
           45d     90d    180d    365d
Chacras   12.7%*  13.4%  13.7%   13.4%
Jumbo     10.9%    8.9%* 10.1%   19.1%
Las cañas  8.7%*  10.9%  12.3%   14.6%
QuickPnt  13.5%   11.7%   8.8%*   8.9%
```

Un año arrastra estacionalidad vieja que corre el nivel actual — a Jumbo lo empeora de 8,9% a
19,1%. `calibrarVentana()` mide las candidatas contra lo que pasó y guarda la ganadora en
`Local.ventanaForecastDias`; el cron semanal la recalcula. **El año igual hace falta** para la
tendencia, el interanual y el clima.

**El día se pronostica bien; una franja de 30 minutos no.** WAPE ~9-13% a nivel día contra
~37-48% a nivel franja (una franja promedia 2-4 tickets, y el MAE es ~1,3). Por eso la pantalla
muestra el escenario central junto con su intervalo, nunca el punto aislado.

La UI calcula además un holdout reciente: aparta 15 días, no los usa para entrenar y reporta
WAPE diario y sesgo. Ese valor puede diferir del WAPE de calibración de ventana de la tabla de §3
porque responden preguntas distintas.

**La matriz carga → dotación se deriva de la capacidad, no se guarda aparte.** Son la misma
afirmación escrita dos veces y dos copias se contradicen. Se calibra un número por sector y la
tabla se actualiza sola (`matrizDesdeCapacidad`).

### Clima

Medido con un año contra el mismo día de semana (si no, "llueve más los sábados" se leería como
efecto de la lluvia):

| | Lluvia | Calor ≥32° | Frío ≤14° |
|---|---:|---:|---:|
| A la calle | ×1,10 | **×0,86** | ×1,02 |
| En shopping | ×1,07 | **×1,22** | ×0,86 |

Ojo con esto: **contradice el supuesto habitual** de que la lluvia hunde a los locales a la
calle. Lo que aparece fuerte es la temperatura — con más de 32° el shopping gana 22% y la calle
pierde 14%. El factor aprendido se atenúa por su confianza, así que una medición hecha con seis
días de lluvia no puede pegar un volantazo.

---

## 7. La API de Fudo: lo que costó descubrir

- `item.price` es el **total de la línea**, no el unitario. "CORTADO x2 @9200" cierra en 9200.
  `product.cost` sí es unitario. Multiplicar `price` por `quantity` duplica la facturación.
- `sale.total` ya viene **neto de descuentos**.
- La **"Caja" (`cashRegister`) en esta cuenta es una persona**, no un canal fijo. Por eso sirve
  para atribuir arqueos y descuentos a alguien. No todos los mozos tienen caja, ni toda caja
  es mozo.
- `/payments` **no** expone la caja de origen; hay que ir por `/sales` → `payments`.
- `/discounts` no tiene filtro por fecha; se llega incluyéndolos desde `/sales`.
- `/expenses` sí filtra por `cashRegisterId` y trae `useInCashCount` → es lo que permite
  descontar del arqueo la plata que salió del cajón.
- Las categorías vienen escritas distinto en cada cuenta (`2.Cafetería` / `CAFETERIA` /
  `Cafeteria PYA`): 110 nombres crudos para 53 conceptos. Siempre pasar por
  `categoriaCanonica()`.
- El token vence a las 24 h. Se pide uno nuevo en cada sync y nunca se guarda.
- Cada sucursal es una **cuenta de Fudo separada**, con sus propias credenciales. Requiere Plan
  Pro.

### ⚠️ La trampa de la paginación (mordió dos veces)

`/sales` pagina **por id ascendente**, o sea de la venta más vieja a la más nueva. Al pasarse del
tope de páginas, lo que se pierde son **las ventas MÁS NUEVAS**.

Las dos veces terminó destruyendo datos reales:

1. En el sync diario: los días a grabar salían también de gastos y anulaciones, que sí llegaban
   completos, así que los días recientes se escribieron **con ventas en cero encima de datos
   reales** (Jumbo: 31 de sus últimos 35 días).
2. En la serie de 30 minutos: como las franjas se borran y se reinsertan, los días que no
   llegaban quedaron **directamente sin datos** (Jumbo perdió 4 meses y el pronóstico estaba
   aprendiendo de un histórico mutilado).

Jumbo tiene 54.377 ventas en un año contra un techo de 40.000. Ahora los dos recorridos van en
tramos de 45 días y **lanzan error en vez de devolver un resultado incompleto**. Si aparece
`el recorrido de ventas se truncó`, achicar `TRAMO_DIAS`.

---

## 8. Un patrón de bug que ya apareció tres veces

**Comparar contra un período incompleto inventa variaciones.** Pasó tres veces, en tres lugares:

- Un local con 6 días sin sincronizar reportó **+922%** de crecimiento, e infló la variación de
  toda la cadena de +2,4% real a +27,7%.
- Una semana con 3 de 7 días reportó **−10,1% por semana** cuando el local venía plano.
- El mismo riesgo existe en cualquier cosa nueva que compare dos ventanas.

La regla que quedó: **si la base no está completa, no se muestra la variación** — un guion y un
aviso, nunca un número que nadie puede creer. Está implementado en `baseComparable`
(`app/api/dashboard/route.ts`) y `MIN_DIAS_SEMANA` (`lib/forecast/tendencia.ts`), y hay un test
de regresión en `forecast.test.ts`.

---

## 9. Seguridad y datos

- El repo es **público**. Ningún secreto acá adentro, nunca.
- `.env.local` (gitignoreado) tiene lo que baja `vercel env pull`, incluida la URL de Neon. No
  commitear ni imprimir.
- `.env` local todavía apunta por túnel SSH a la base vieja de Railway. **No es producción.**
- Las credenciales de Fudo se guardan en `Local.fudoApiKey`/`fudoApiSecret` y **nunca salen por
  la API**: `/api/locales` y `/api/locales/[id]` usan `omit` de Prisma y exponen
  `fudoConfigurado` (bool) en su lugar.
- Los scripts de diagnóstico que tocan credenciales se borran apenas se usan y no se commitean.
- No correr migraciones ni scripts destructivos sin mirar a qué base apuntan.

---

## 10. Cómo trabajar acá

```bash
npx tsc --noEmit
npm run lint
npm test
node <ruta-skill-impeccable>/scripts/detect.mjs --json <archivos cambiados>
npm run build
npx --yes vercel deploy --prod --yes
```

Migraciones: escribir el SQL a mano en `prisma/migrations/<timestamp>_<nombre>/migration.sql` y
aplicar con `npx --yes dotenv-cli -e .env.local -- npx prisma migrate deploy`. **Usa la conexión
directa** (`DATABASE_URL_UNPOOLED`); la pooled no soporta el estado de sesión que Prisma Migrate
necesita.

Notas de entorno que ahorran tiempo:

- `AGENTS.md` exige leer la doc de `node_modules/next/dist/docs/` antes de tocar código de
  Next.js 16 — esta versión tiene breaking changes.
- `prisma generate` puede tirar `EPERM` si hay un `next dev` corriendo (el binario nativo queda
  bloqueado). No es un error real: los tipos igual se regeneran. Verificar con `npm run build`.
- Si otra sesión tiene el dev server abierto, ese proceso puede tener el Prisma Client viejo en
  memoria. No lo mates sin avisar.
- El deploy es **manual**: el repo de GitHub no está conectado al proyecto Vercel para
  auto-deploy (la cuenta no tenía la GitHub App con acceso a esa org).
- En PowerShell, usar `npm.cmd` si la política bloquea `npm.ps1`.
- Los heredocs de bash rompen los template literals de JS (`${...}` se sustituye). Para editar
  código, usar el editor, no `cat > archivo <<EOF`.

---

## 11. Pendientes

**Bloqueantes para cerrar la migración**

- Arreglar `lib/fechas.ts` (§1).
- Probar en celular real: passkey, cámara, GPS.
- Rotar la password de Postgres de Railway y apagar el servicio.

**Del negocio, no del código** — son los que más moverían la aguja

- **Que el personal fiche.** Desbloquea el aprendizaje de capacidad y con eso toda la mitad de
  dotación del pronóstico, que hoy es un supuesto.
- **Cargar los costos por producto en Fudo.** Sin eso el food cost y el margen no sirven.
- **Cargar las compras en Fudo con detalle de producto.** Convierte la serie de stock en un
  control de faltantes real.
- **QuickPoint tiene días que Fudo no registra** (3 de 7 en una semana de agosto). No es el
  modelo, es la fuente: ver si el local cerró o si su cuenta tiene un problema.

**Mejoras**

- Interanual real: hay exactamente 365 días, y comparar 4 semanas contra el año pasado necesita
  13 meses. En un mes sale solo.
- Feriados trasladables de 2026 (Carnaval, Semana Santa, puentes): cargarlos en Ajustes cuando
  se confirmen. El seed sólo trae los de fecha fija.
- `K_event` y `K_promotion` existen en la fórmula pero no tienen fuente de datos; quedan en 1.
- Conectar GitHub a Vercel para auto-deploy.
- Decidir el dominio propio antes de que se registren más passkeys.
