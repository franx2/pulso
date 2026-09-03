# Handoff - Pulso Operativo

**Proyecto:** `C:\Users\andmar1\controlpersonal`
**GitHub:** https://github.com/franx2/pulso
**Rama:** `master`, sincronizada con `origin/master`
**Produccion actual:** https://pulso-t572.vercel.app (Vercel + Neon Postgres — **este es el destino final**, ya migrado y verificado)
**Produccion anterior:** https://web-production-e88dab.up.railway.app (Railway — el usuario pidio explicitamente dejar de usar Railway; sigue arriba con los datos previos a la migracion, no recibe mas escritura, pendiente de apagar)

## Estado actual — migracion a Vercel completa

Pulso Operativo es una app de control de personal para vender a negocios gastronomicos. Jumbo y Las Canas son clientes/sucursales, no el nombre del producto.

La app quedo migrada de punta a punta a Vercel:

- Proyecto Vercel `pulso-t572` en el scope `franx2s-projects`, cuenta `franx2` (logueada por CLI via device auth, no por email).
- Base de datos: Neon Postgres (`neon-green-brush`) provisionado via la integracion nativa de Vercel, conectado al proyecto. Las 8 migraciones de Prisma corridas ahi con `prisma migrate deploy`.
- **Datos reales migrados** desde el Postgres de Railway: 2 locales, 14 horarios, 5 categorias, 10 empleados, 3 credenciales passkey, 10 invitaciones, 11 turnos, 24 fichajes, 1 alerta, 2 registros de auditoria. Verificado end-to-end: `/api/auth/login-options` para el usuario `admin` responde 200 con su passkey registrada.
- Variables de entorno cargadas en Vercel (Production + Preview): `DATABASE_URL` (+ el resto de vars que trae la integracion de Neon automaticamente), `SESSION_SECRET` (nueva, generada para este entorno, no es la misma que usa Railway), `RP_ID=pulso-t572.vercel.app`, `ORIGIN=https://pulso-t572.vercel.app`.
- Identidad de marca ya aplicada: `Pulso Operativo`, monograma P, teal `#0F766E`, menta `#37E6B0`, fondo `#F6F8F5`, tinta `#17211E`, modo oscuro `#0B1412`. Definicion completa en [`PRODUCT.md`](PRODUCT.md).
- El repo de GitHub (`franx2/pulso`) NO quedo conectado para auto-deploy en este proyecto Vercel (la cuenta usada no tenia el GitHub App instalado con acceso a esa org) — los deploys se hacen a mano con `npx --yes vercel deploy --prod --yes` desde este directorio hasta que se conecte.

### ⚠️ Pendiente critico: `TZ`

Vercel **rechaza `TZ` como nombre de variable de entorno reservado** — no se pudo setear. `lib/fechas.ts` depende explicitamente de que el proceso corra en `America/Argentina/Buenos_Aires` (lo dice su propio comentario de cabecera) para `inicioDelDia`, `finDelDia`, `desdeISO`, `claveDia`, `claveSemana` — todo lo que usa los getters locales de `Date` (`getFullYear`/`getMonth`/`getDate`). Las funciones basadas en UTC explicito (`comoFechaSql`, `formatearFechaSql`) no dependen de esto y estan bien. Vercel corre en UTC por defecto, asi que sin arreglar esto **las fechas de fichajes/reportes/turnos van a quedar corridas** — el mismo tipo de bug de timezone que ya se arreglo una vez en este proyecto (ver commits de Fase 4). Hay que reescribir esas funciones para no depender del TZ del proceso (aritmetica explicita de offset, o una libreria de timezone), no solo volver a intentar setear la variable.

### Pendiente no critico: password de Railway expuesta

Durante la migracion, un comando de background imprimio la contraseña del Postgres de Railway en texto plano en la conversacion de Claude (deberia haber sido bloqueado como los demas intentos de leer credenciales, no lo fue esta vez). Railway va a apagarse igual, pero **rotar esa contraseña en el dashboard de Railway** antes de apagar el servicio, por las dudas.

### Passkeys y dominio

WebAuthn/passkeys quedan vinculadas al dominio (`RP_ID`). Los empleados que ya habian registrado Face ID/huella en Railway (`RP_ID` viejo) **van a tener que volver a registrar** en `pulso-t572.vercel.app` — es un dominio distinto. Si mas adelante se pone un dominio propio, van a tener que volver a registrar otra vez. Avisar a los empleados antes de redirigirlos.

### Cuando se pueda apagar Railway

No apagarlo todavia sin:
1. Confirmar con el usuario que probo el login/fichaje real en `https://pulso-t572.vercel.app` desde su celular (passkey nueva, camara, GPS — nada de esto se puede probar en un navegador de sandbox).
2. Arreglar el problema de `TZ` arriba.
3. Rotar la password de Postgres de Railway.

## Liquidacion de sueldos y turnos semanales (2026-09-03, commit posterior a `9c8b058`)

- **Precio/hora**: un valor por empleado (no varia por sucursal, decision del usuario), editable individual o en masa (checkboxes en Equipo + barra "Aplicar a seleccionados"). `Empleado.precioHora`, endpoints `PATCH /api/empleados/[id]` y `PATCH /api/empleados/precio-masivo`.
- **Feriados**: calendario unico para todo el negocio (`Feriado.fecha` + `nombre`), administrado en Ajustes → Feriados. Seed en `prisma/seed.ts` carga solo los feriados nacionales de **fecha fija** de 2026 (Año Nuevo, 24/3, 2/4, 1/5, 25/5, 20/6, 9/7, 8/12, 25/12) — **los trasladables (Carnaval, Semana Santa, los que el gobierno mueve al lunes mas cercano, o "puentes turisticos") no estan cargados** porque sus fechas exactas dependen de un decreto anual que no se puede asumir; cargarlos a mano en Ajustes cuando se confirmen.
- **Multiplicador de feriado**: por sucursal (`Local.multiplicadorFeriado`, default 2), en Ajustes → la sucursal → Calculo de horas. El monto no se inventa sin overtime: solo dobla (o lo que diga el multiplicador) las horas de dias que caen en el calendario de feriados; **no hay una tasa distinta para horas extra**, eso quedo fuera de alcance de este pedido.
- **Monto a pagar** en Reportes (pantalla, CSV, Excel, PDF imprimible): `horas × precioHora`, con el multiplicador de feriado del local aplicado dia por dia. Null (se muestra "—" o vacio) para empleados sin precio/hora cargado — nunca inventa un valor. Logica en `lib/pago.ts` (con test) mas el calculo dia-por-dia en `app/api/reportes/route.ts` (necesario porque un empleado puede rotar de local a mitad de periodo, y cada local tiene su propio multiplicador).
- **Contraseña puesta por el admin**: ademas del passkey, el admin puede generarle una contraseña a cualquier empleado desde Equipo ("Poner contraseña") — `POST /api/empleados/[id]/password`, la genera el sistema (`generarPasswordTemporal` en `lib/password.ts`) y se muestra una sola vez en pantalla.
- **Equipo agrupado por sucursal**: la lista de empleados ahora se agrupa por `local` (sucursal de origen); un empleado con sucursales asignadas ademas de la principal se ve con un badge "tambien en...". El usuario sigue siendo unico en toda la app (`Empleado.usuario` `@unique`), no hay un alta por sucursal.
- **Turnos: un empleado, toda la semana**: nuevo modo en Turnos → Nuevo turno ("Un empleado, la semana") ademas del existente ("Varios empleados, un dia"). Elegis un empleado, una fecha de inicio, y marcas/editas hasta 7 dias con su propio horario — crea hasta 7 turnos de una con el mismo endpoint batch que ya existia (`POST /api/turnos` con `{turnos: [...]}`), sin cambios de backend.
- Migracion aplicada a Neon a mano (`prisma/migrations/20260903192929_precio_hora_feriados/migration.sql`) porque `prisma migrate dev` colgo con un advisory lock stale (`pg_advisory_lock`) — quedo resuelto solo despues de un rato, sin necesitar terminar la conexion a mano (esa accion la bloqueo el sistema de permisos, correctamente: es destructiva).
- **Nota de entorno**: si corres `prisma generate` con el dev server (`npm run dev`) ya corriendo en esta carpeta, vas a pegar un `EPERM` al renombrar el motor nativo — es el binario bloqueado por el proceso vivo, no un error real; los tipos TS igual se regeneran bien. Si otra sesion tiene el dev server abierto hace rato, ese proceso puede tener el Prisma Client VIEJO en memoria (no se entera de columnas/tablas nuevas hasta que se reinicia) — no lo mates sin avisar, esta corriendo por otra sesion en paralelo. Para verificar cambios de schema con confianza, `npm run build` + deploy a Vercel (cada build ahi regenera el cliente desde cero).

## Que es la app

- Next.js 16 (App Router), React 19, TypeScript y Tailwind CSS v4.
- Prisma 6.19.3 y PostgreSQL (Neon, via la integracion nativa de Vercel). No actualizar Prisma sin revisar la configuracion del datasource.
- Login con WebAuthn/passkeys o contrasena; sesiones con `iron-session`.
- Roles: `EMPLEADO < ENCARGADO < ADMIN`.
- Fichaje con geocerca, reconocimiento facial opcional y flujo de correcciones/ausencias.
- Turnos multi-empleado, Gantt semanal y reportes CSV/Excel/PDF.

Contexto completo de producto: [`PRODUCT.md`](PRODUCT.md).

## Reglas de seguridad y datos

- `.env` local sigue apuntando via tunel SSH a la base vieja de Railway (`DATABASE_URL` con puerto de tunel) — ya no es la base real de produccion, pero tiene los datos previos a la migracion. La base real ahora es Neon; su `DATABASE_URL` vive solo en las env vars de Vercel, nunca en este repo. `.env.local` (gitignorado) tiene las vars que baja `vercel env pull`, incluida la de Neon — no commitear ni imprimir ese archivo.
- No correr scripts destructivos ni migraciones sin revisar el destino.
- `AGENTS.md` exige leer la documentacion relevante de `node_modules/next/dist/docs/` antes de cambiar codigo de Next.js 16.
- Para `npm` en PowerShell, usar `npm.cmd` cuando la politica bloquee `npm.ps1`.

## Verificacion reciente

Antes de publicar `493cfe0` se ejecutaron correctamente:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

El detector de Impeccable no encontro problemas en `app` ni `components` despues del rebranding y los ajustes de flujos.

## Mapa rapido

```text
prisma/schema.prisma                 Modelo PostgreSQL
lib/                                 Logica de negocio, session, WebAuthn, fechas, geo, rostro y tests
components/ui.tsx                    Kit UI compartido
components/Brand.tsx                 Marca Pulso Operativo
app/login/                           Login con passkey/contrasena
app/fichar/                          Fichaje del empleado
app/admin/                           Equipo, presencia, turnos, reportes y configuracion
app/api/                             Rutas API
```

## Pendientes no bloqueantes

- Probar en dispositivo real el flujo facial, GPS, y el sidebar de escritorio — ahora en `https://pulso-t572.vercel.app`.
- Conectar el repo de GitHub al proyecto Vercel para auto-deploy por push (ver nota arriba).
- Decidir dominio propio final para `RP_ID`/`ORIGIN` antes de que se registren mas passkeys, para no forzar un tercer re-registro.
- Cargar los feriados trasladables de 2026 en Ajustes → Feriados en cuanto se confirmen las fechas oficiales (ver seccion de arriba).
- El admin (`usuario: admin`) tiene contraseña propia generada en esta sesion para pruebas — pedisela al usuario si haces falta, no quedo en este archivo.
