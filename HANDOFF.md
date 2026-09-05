# Handoff — Pulso Operativo

**Proyecto:** `C:\Users\andmar1\controlpersonal`
**GitHub:** https://github.com/franx2/pulso (público — nunca commitear secretos acá)
**Rama:** `master`, sincronizada con `origin/master`. El deploy a Vercel es manual (§10)
**Producción:** https://pulso-t572.vercel.app — Vercel (`pulso-t572`, scope `franx2s-projects`) + Neon Postgres
**Producción vieja:** https://web-production-e88dab.up.railway.app — Railway, ya no recibe escrituras, pendiente de apagar

Última actualización: 2026-09-05.

---

## 1. Lo primero que hay que arreglar

### ✅ El desfasaje de 21 horas ya está arreglado (2026-09-05)

Se deja escrito porque explica cómo está armado el manejo de fechas y por qué no hay que
volver atrás. `lib/fechas.ts` usaba los getters locales de `Date`
(`getFullYear`/`getMonth`/`getDate`), o sea que asumía que el proceso corría en
`America/Argentina/Buenos_Aires`. Vercel corre en UTC y **rechaza `TZ` como nombre de variable
de entorno**, así que entre las 21:00 y las 24:00 argentinas el proceso ya estaba en el día
siguiente. Medido antes de arreglarlo, el 2026-09-05 a las 02:27 UTC:

```
inicioDelDia() devolvía   2026-09-05T00:00:00Z
debía devolver            2026-09-04T03:00:00Z   (00:00 hora argentina)
desfasaje                 21 horas
```

Tocaba los fichajes del día en `/fichar`, los rangos de reportes y la asignación de turnos.

**Cómo quedó:** el offset argentino vive en **un solo lugar, `lib/fechaAR.ts`**, y todo lo demás
lo importa de ahí — `lib/fechas.ts`, `lib/resumenDiario.ts`, `lib/periodo.ts`, `lib/forecast/*`,
las rutas de API y el cliente del dashboard. Antes estaba copiado en siete archivos, y eso fue
justamente lo que dejó pasar el bug: no había un lugar al que converger. **No vuelvas a escribir
`3 * 60 * 60 * 1000` en otro archivo.**

`lib/fechas.test.ts` ahora afirma sobre instantes absolutos (`"...Z"`) y no sobre getters
locales. La versión vieja construía fechas con `new Date(2026, 7, 28)` y las verificaba con
`.getDate()`: pasaba en cualquier zona horaria, incluso mientras producción estaba corrida 21
horas. Corré los tests en UTC si tocás esto:

```bash
TZ=UTC npm test
```

### 🟡 Antes de apagar Railway

1. Que el usuario confirme login y fichaje reales desde su celular en `pulso-t572.vercel.app`
   (passkey, cámara y GPS no se pueden probar desde un navegador de sandbox).
2. **Rotar la contraseña del Postgres de Railway**: durante la migración quedó impresa en texto
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
| **Compras** | remitos del proveedor, costo por producto y control del royalty | PDF por mail → parser propio |

---

## 3. Estado de los datos (verificado 2026-09-05)

Los cuatro locales tienen Fudo configurado. En `ResumenDiario` hay **desde enero de 2025**, o
sea 18-20 meses según el local:

| Local | Tipo | Historia diaria | Ventana de perfil | WAPE día |
|---|---|---|---:|---:|
| Chacras | `OPEN_AIR` | 2025-03-04 → hoy (548 d) | 45 d | 12,3% |
| Jumbo | `INDOOR_MALL` | 2025-01-02 → hoy (605 d) | 90 d | 9,2% |
| Las cañas | `OPEN_AIR` | 2025-01-29 → hoy (579 d) | 45 d | 7,8% |
| QuickPoint | `OPEN_AIR` | 2025-01-02 → hoy (599 d) | 180 d | 7,4% |

**Chacras y Las cañas no existían a principios de 2025** — abren el 4 de marzo y el 29 de enero
respectivamente. No es un hueco de sincronización: Fudo no tiene ventas antes de eso. Cualquier
comparación interanual de esos dos locales arranca recién ahí.

La "ventana de perfil" no se elige a dedo: la calibra el backtest (ver §6), y desde 2026-09-05
el resultado queda guardado en `Local.ventanaCalibracion` en vez de recalcularse por pantalla.

**Ojo con qué serie tiene qué.** La recarga de 2025 llenó `ResumenDiario` y `ProductoDiario` —
que es lo que usan el dashboard, la tendencia y la temporada. **`DemandaSlot` (la serie de 30
minutos) sigue teniendo ~un año**, que es lo que usa el pronóstico intradiario. No hace falta
extenderla: la calibración ya mostró que para ese modelo un año pierde contra 45-180 días.

Para recargar más historia: `sincronizarResumenLocal(localId, { desde, hasta })` acepta un
intervalo explícito. Hay que llamarlo por tramos de ~45 días desde un script local — un pedido
de un año entero acumula cientos de miles de ventas en memoria antes de agregarlas, y no entra
en los 300 s de una función serverless.

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
  fechaAR.ts                  ⭐ el offset argentino vive acá y sólo acá (§1)
  fechas.ts                   días calendario y semanas ISO, sobre fechaAR
  periodo.ts                  qué período se mira y contra qué se compara
  horas.ts jornada.ts pago.ts cálculo de horas, jornadas y liquidación
  session.ts webauthn.ts      auth
  geo.ts rostro.ts            geocerca y reconocimiento facial
  fudo.ts                     cliente de la API de Fudo (token, ventas, pagos, cajas, gastos)
  fudoSync.ts                 mapa de calor de demanda
  fudoResumen.ts              sync diario → ResumenDiario + ProductoDiario
  resumenDiario.ts            agregación diaria (pura, testeada)
  fudoStock.ts                foto diaria de stock
  compras/
    remito.ts                 parser del remito (puro, testeado con 4 reales)
    pdf.ts                    PDF → texto con columnas, sin binarios externos
    correo.ts                 IMAP: trae los adjuntos del proveedor
    ingesta.ts                asigna local, clasifica y guarda
    royalty.ts                control del 5% sobre la venta neta
  forecast/
    categorias.ts             normaliza las categorías crudas de Fudo (110 → 53)
    slots.ts                  franjas de 30 min en hora argentina
    dataset.ts                Fudo → DemandaSlot (serie de 30 min)
    perfil.ts                 patrón por local × día × franja, K_trend
    k.ts                      motor de Factor K (composición, recorte, explicación)
    carga.ts                  SectorLoadScore
    dotacion.ts               carga → personas, aprendizaje de capacidad
    clima.ts                  Open-Meteo + sensibilidad por tipo de local
    tendencia.ts              tendencia de ventas semanal y proyección a 30 días
    estacionalidad.ts         índice por mes, proyección por temporada (§6)
    analitica.ts              correlaciones históricas y resumen explicable de factores
    backtest.ts               MAE / RMSE / WAPE, intervalos
    evaluacion.ts             backtesting y calibración de ventana
    motor.ts                  orquestación del pronóstico
    configuracion.ts          siembra de matrices editables
app/
  fichar/                     fichaje del empleado (móvil)
  admin/dashboard/            comando, comparación local, productos y control
  admin/pronostico/           proyección, temporada, modelo y correlaciones por local
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

Todos con `Authorization: Bearer $CRON_SECRET`, y los dispara **GitHub Actions**:
[`.github/workflows/crons.yml`](.github/workflows/crons.yml). El archivo es la única fuente de
verdad de qué corre y cuándo — antes había un scheduler externo del que se perdió el rastro,
y con él el secreto.

No se usa Vercel Cron porque el plan es **Hobby**: permite 2 jobs una vez por día, y acá hay 10,
dos de ellos cada hora. GitHub Actions es gratis e ilimitado en repos públicos, que es el caso.

El secreto vive en GitHub → Settings → Secrets and variables → Actions → `CRON_SECRET`, y tiene
que ser **el mismo** que la variable `CRON_SECRET` de Vercel. Para dispararlos a mano: pestaña
Actions → Crons → Run workflow, poniendo la ruta.

⚠️ **GitHub apaga los workflows programados de un repo público tras 60 días sin commits.** Avisa
por mail antes. Si el proyecto queda quieto un par de meses, hay que reactivarlos desde Actions.

| Endpoint | Cuándo | Tiempo medido | Qué hace |
|---|---|---|---|
| `/api/cron/resumen?dias=7` | cada hora | ~40 s | refresca el dashboard |
| `/api/cron/resumen?dias=90&local=<nombre>` | semanal, **una llamada por local** | ~1,5 min c/u | recupera días viejos corregidos en Fudo |
| `/api/cron/semanal` | semanal | **106 s** | refresca franjas, **recalibra la ventana de cada local**, guarda lo que midió y remide el clima |
| `/api/cron/stock` | diario, **hora fija post-cierre** | ~2 min | foto de stock |
| `/api/cron/demanda` | semanal | ~1 min | mapa de calor de Turnos → Semana |
| `/api/cron/alertas` | cada hora | rápido | tardanzas, faltas, salidas olvidadas |
| `/api/cron/remitos` | cada 2 h | ~5 s por remito | lee la casilla y carga los remitos de compra (§7b) |

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

### Temporada (`lib/forecast/estacionalidad.ts`)

Es la otra mitad de "cuánto se va a vender", y responde a un horizonte distinto: el pronóstico
de arriba mira 7-30 días, esto mira 3-12 meses. Vive aparte porque la pregunta es otra —
enero en Mendoza no se parece a junio, y eso no se ve en una ventana de 45 días.

```
venta ≈ nivel × tendencia(t) × índice del mes × perfil del día de semana
```

Dos decisiones que cambian el resultado:

**El índice del mes se calcula sobre la serie DESTENDENCIADA.** Con inflación alta, la venta
nominal de diciembre es más grande que la de enero por dos razones distintas: porque diciembre
vende más y porque diciembre llega once meses después. Sacar la tendencia primero es lo único
que separa "temporada" de "los precios subieron". Es lo que verifica el test sintético: se
genera una serie con estacionalidad y crecimiento conocidos y se comprueba que el módulo
recupera los dos por separado.

**La tendencia se ajusta en logaritmos**, porque el crecimiento acá es multiplicativo. Una recta
sobre pesos nominales subestima el arranque y se dispara al final.

El nivel de arranque de la proyección **no** sale del ajuste largo: es el promedio de los
últimos 28 días desestacionalizado. Del ajuste largo se toma la forma (cuánto crece por día),
no el punto de partida — anclarlo a un año entero lo ata a precios viejos. Y el crecimiento se
aplica a la mitad, igual que en la proyección simple.

La pantalla (pestaña **Temporada**) siempre muestra al lado la alternativa boba —repetir el
promedio de los últimos 28 días— medida sobre los mismos 45 días reservados. Si el ajuste por
temporada no le gana, hay que decirlo en vez de mostrar el modelo lindo.

Un mes con menos de 20 días observados en toda la historia queda neutro (índice 1) y marcado
como "poca historia": no se inventa una temporada que no se vio. Y hay una segunda advertencia
distinta: **`repetido`** dice si ese mes se vio en más de un año. Hoy octubre, noviembre y
diciembre tienen 30 días observados cada uno y son **un solo** octubre, noviembre y diciembre;
el índice no puede distinguir "así es diciembre" de "así fue diciembre de 2025". La pantalla lo
marca como "un solo año". En enero de 2027 esto se arregla solo.

**Se mide sobre cuatro ventanas de 45 días, no sobre una.** Esto no es prolijidad: la primera
versión medía una sola ventana y daba mejoras del 41-51%, que es el mejor caso y no el modelo.
Con cuatro ventanas, medido el 2026-09-05:

| Local | Con temporada (mediana) | Repitiendo 28 días | Mejora mediana | Gana en | Peor ventana |
|---|---:|---:|---:|:-:|---:|
| Las cañas | 25,7% | 34,4% | **−31%** | 4/4 | +15,5% |
| Jumbo | 20,4% | 27,7% | **−27%** | 4/4 | +20,5% |
| Chacras | 36,3% | 42,1% | **−15%** | 3/4 | −4,5% |
| QuickPoint | 19,3% | 22,7% | **−12%** | 3/4 | −3,3% |

Ajustar por temporada gana en 14 de las 16 ventanas medidas, pero **el rango va de +45% a −5%**
según dónde caiga el corte. Cualquier número suelto de esta tabla, sin el resto, exagera.

### Cierres largos

`ultimoCierre()` detecta tres o más días seguidos sin una sola venta y, si caen dentro de la
ventana que fija el nivel de arranque, la proyección se apoya **sólo en los días posteriores a
la reapertura**.

Existe por un caso real: **QuickPoint cerró por reformas del 23 al 28 de agosto de 2026** y
reabrió un 15% abajo. Promediar los dos lados del cierre describía un local que no existe — su
proyección a 120 días bajó de $147,0M a $129,8M al anclarla bien. Y la ventana de backtest que
contenía ese cierre era justamente la que decía que la estacionalidad no le servía a QuickPoint:
medido en las otras tres ventanas, le sirve.

Tres días y no dos porque los feriados de esta cadena son de un día (1 de mayo, 25 de diciembre,
1 de enero) y a veces caen fines de semana largos. Y hacen falta al menos 5 días de reapertura
para cambiar el nivel: con menos, el escalón todavía es un rumor. La pantalla avisa el cierre,
las fechas y sobre cuántos días se apoya.

**QuickPoint hoy proyecta sobre 7 días.** Es poco y está declarado; se vuelve normal solo.

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

## 7b. Los remitos de compra (`lib/compras/`)

Casi todo el costo viene de **un solo proveedor** que vende de todo, desde café
hasta helado. Manda los remitos en PDF por mail, varios adjuntos por mensaje.

**El parser es determinístico, no un modelo de lenguaje.** Son precios que se
convierten en costo de mercadería: un parser o entiende la línea o falla
ruidosamente, y un modelo devuelve un número plausible y equivocado que nadie
detecta mirando un total. Los cuatro remitos reales de agosto de 2026 están
como fixtures en `lib/compras/fixtures/`.

Tres cosas del documento que habrían ensuciado los números en silencio:

1. **El campo "Desc. aplicado (%) 10,50" SUMA, no resta.** En los cuatro
   remitos el subtotal es la suma de las líneas × 1,105. Tomar el precio
   unitario como costo deja todo un 10,5% barato. Se guardan las dos lecturas
   (`total` y `totalConAjuste`) porque todavía no está decidido si ese recargo
   es costo de mercadería o costo financiero.
2. **No todo remito es mercadería.** El de "USO DE MARCA" es el royalty y salió
   $1.124.160 en agosto, más que una semana de compras. Va como `SERVICIO` y
   queda fuera del food cost. Ver el control abajo.
3. **El proveedor imprime cantidades con 2 decimales y factura con 3.** Un
   helado que figura 7,27 kg y cierra en $66.111,50 a $9.100 pesaba 7,265. La
   tolerancia por línea es lo que ese redondeo permite (`0,005 × unitario`) y
   no un peso fijo; `cantidadExacta` guarda la real.

**Se verifica contra los totales del propio remito.** Si una línea no se leyó,
la suma no da y el remito queda marcado en vez de entrar con costo incompleto.

**Los remitos que no se pueden asignar quedan sin local**, en la bandeja de
`/admin/compras`. No se adivina: dos locales del mismo dueño tienen razones
sociales casi idénticas y errarle ensucia el costo de los dos a la vez. Cuando
se asigna a mano, el CUIT queda guardado en el local y el próximo entra solo.
Hoy sólo **Las Cañas** está mapeada: `CUMBRES Y PLACERES SAS (BIANCONERO
GUAYMALLEN)`, CUIT 30718808975.

### El control del royalty

La regla, según el dueño: **(venta del local ÷ 1,21) × 0,05** — el 5% de la
venta neta de IVA, y las ventas de Fudo vienen con IVA. El remito llega
fechado antes de que el mes termine (para el cuadro fiscal del proveedor), así
que el mes que se compara sale del texto ("USO DE MARCA AGOSTO"), no de la
fecha de emisión.

Sobre agosto de 2026 en Las Cañas: corresponden $988.969 y cobraron
$1.017.340, o sea **$28.372 de más (2,87%)**. **No está confirmado que sea un
error**: una ventana móvil de 30/07 a 30/08 suma $24.614.359, a 0,02% de la
base que implica lo cobrado, así que podrían facturar un período que cierra el
día del remito. Con un solo remito no se distingue. Si la regla del mes
calendario es la buena, la diferencia va a variar mes a mes; si es la ventana
móvil, va a quedar clavada.

### La casilla

IMAP y no un webhook porque un webhook necesita dominio propio y servicio de
mail entrante, y el proyecto todavía no tiene dominio. Variables en Vercel:

| Variable | Ejemplo | |
|---|---|---|
| `REMITOS_IMAP_HOST` | `imap.gmail.com` | |
| `REMITOS_IMAP_USER` | la casilla | |
| `REMITOS_IMAP_PASSWORD` | contraseña **de aplicación**, no la de la cuenta | Gmail exige 2FA |
| `REMITOS_REMITENTE` | `@proveedor.com.ar` | **obligatorio en una casilla personal** |
| `REMITOS_IMAP_CARPETA` | `Remitos` | opcional, por defecto INBOX |

**`REMITOS_REMITENTE` no es un lujo:** los mensajes procesados se marcan como
leídos, así que sin filtro y apuntando a INBOX el cron le marca leída la
casilla entera al dueño. El filtro va en la búsqueda IMAP, así que los mails
de otros ni se bajan. La respuesta del cron avisa si está leyendo INBOX sin
filtro.

Google ya no permite apagar IMAP en las cuentas de Gmail: no hay interruptor
que activar, sólo POP lo tiene todavía.

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

- Probar en celular real: passkey, cámara, GPS.
- Rotar la password de Postgres de Railway y apagar el servicio.

**Del negocio, no del código** — son los que más moverían la aguja

- **Que el personal fiche.** Desbloquea el aprendizaje de capacidad y con eso toda la mitad de
  dotación del pronóstico, que hoy es un supuesto.
- **Cargar los costos por producto en Fudo.** Sin eso el food cost y el margen no sirven.
- **Cargar las compras en Fudo con detalle de producto.** Convierte la serie de stock en un
  control de faltantes real.
- ~~QuickPoint tiene días que Fudo no registra~~ **Resuelto: cerró por reformas del 23 al 28 de
  agosto de 2026.** No era un problema de sincronización. Los otros huecos de los cuatro locales
  son feriados de un día (1 de mayo, 25 de diciembre, 1 de enero). El modelo ahora lo detecta
  solo, pero **no hay forma de declarar un cierre a mano**: si el próximo dura menos de 3 días,
  o si se quiere marcar una reforma que igual mantuvo el local abierto a media máquina, hay que
  cargarlo. Sería una tabla `CierreLocal` (localId, desde, hasta, motivo) que el modelo excluya.

**Mejoras**

- La comparación interanual de `tendencia.ts` sigue leyendo una ventana de 400 días. Con 2025
  entero cargado ya hay historia para ampliarla; el módulo de temporada sí usa todo.
- Feriados trasladables de 2026 (Carnaval, Semana Santa, puentes): cargarlos en Ajustes cuando
  se confirmen. El seed sólo trae los de fecha fija.
- `K_event` y `K_promotion` existen en la fórmula pero no tienen fuente de datos; quedan en 1.
- Conectar GitHub a Vercel para auto-deploy.
- Decidir el dominio propio antes de que se registren más passkeys.
