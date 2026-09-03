# Handoff — Control de personal (Jumbo)

**Ubicación del proyecto:** `C:\Users\andmar1\controlpersonal`
**Repo git:** local, branch `master`, **sin remoto configurado** (`git remote -v` vacío). No hay GitHub/GitLab detrás — todo vive en este directorio y en Railway.
**App en producción:** https://web-production-e88dab.up.railway.app (Railway, real, con empleados fichando ya)

## Estado de git

Ya hay un primer commit real (`8eb17d7`, después del scaffold inicial de `create-next-app`) con todo el código de la app. Working tree limpio al momento de escribir esto. Seguía sin remoto configurado (`git remote -v` vacío) — sólo local, nada en GitHub/GitLab. Si Codex y Claude van a trabajar sobre el mismo directorio en paralelo, tenerlo en cuenta: sin remoto no hay forma de sincronizar entre sesiones más que compartiendo el mismo filesystem.

## Qué es esto

App de control de personal para un restaurante ("Jumbo", 2 sucursales activas: Jumbo y Las Cañas, en expansión). Fichaje desde el celular propio de cada empleado con verificación biométrica (passkey/Face ID/huella o contraseña), reconocimiento facial opcional por cámara al fichar, geocerca por GPS, turnos multi-empleado con vista semanal de superposiciones, ausencias/correcciones con aprobación, y reportes de horas exportables (CSV/Excel/PDF). Todo en español (Argentina), mobile-first para empleados, también usado desde desktop por admin/encargados.

Contexto de producto completo en [`PRODUCT.md`](PRODUCT.md) (generado con la skill Impeccable — léelo primero, tiene usuarios, positioning, contexto de operación y principios de producto).

## Stack

- **Next.js 16 (App Router) + TypeScript**, React 19, Tailwind CSS v4 — un solo proyecto sirve frontend y API routes.
- **Prisma 6.19.3 + PostgreSQL** en Railway — **deliberadamente fijado por debajo de Prisma 7/8** (evita el config de datasource sólo-por-adapter que rompía el build). No actualizar Prisma sin revisar esto.
- **WebAuthn/Passkeys**: `@simplewebauthn/server` + `@simplewebauthn/browser` (challenge en memoria, `lib/webauthn.ts`). Login alternativo por contraseña (`crypto.scryptSync`, sin bcrypt) en `lib/password.ts`.
- **iron-session** para la cookie de sesión (`lib/session.ts`), jerarquía de rol `EMPLEADO < ENCARGADO < ADMIN` vía `alMenos()`.
- **Reconocimiento facial**: `@vladmandic/face-api` corriendo client-side (modelos en `public/models/`, ~6.5MB). La comparación real (distancia euclidiana) es server-side — nunca confiar en el "match" del cliente.
- **Geocerca**: Haversine en `lib/geo.ts`.
- **`lib/fechas.ts`**: módulo central para fechas — existe específicamente por bugs reales de timezone (UTC vs. local en campos `@db.Date` y filtros por rango). Cualquier código nuevo que toque fechas debe pasar por acá, no reinventar.
- Lógica de negocio no trivial vive en funciones puras con tests (`lib/*.test.ts`, sin framework — `tsx` + `node:assert`, encadenados en `npm test`). Cada uno de estos módulos encontró al menos un bug real antes de producción: `lib/horas.ts`, `lib/jornada.ts`, `lib/geo.ts`, `lib/fechas.ts`, `lib/alertas.ts`, `lib/rostro.ts`, `lib/password.ts`, `lib/rateLimit.ts`, `lib/ganttBarra.ts`.

## ⚠️ Instrucción de proyecto que Codex debe leer

`AGENTS.md` (raíz del proyecto) dice que este Next.js tiene breaking changes respecto al conocimiento de entrenamiento de cualquier modelo, y que hay que leer `node_modules/next/dist/docs/` antes de escribir código. Esto se re-genera solo (`next dev` lo reescribe), así que no lo edites — pero **sí hacé que Codex lo lea** antes de tocar rutas/config de Next, porque APIs y convenciones pueden diferir de lo que "sabe" de memoria.

## Cómo correr esto

```bash
npm install
npm run dev          # Next dev server, puerto 3000
npm test             # los 9 suites de lib/*.test.ts
npm run lint          # eslint
npx tsc --noEmit      # typecheck
npm run build         # build de producción (usar antes de deployar)
```

### Base de datos local

`.env` apunta a `DATABASE_URL="postgresql://...@127.0.0.1:<puerto>/railway"` — es un túnel SSH a la Postgres de Railway, **no hay Postgres local**. El puerto cambia cada vez que se reabre el túnel:

```bash
railway connect postgres --tunnel-only --ssh
# imprime el puerto nuevo — actualizar DATABASE_URL en .env con ese puerto
```

No hay Postgres de desarrollo separada: el túnel apunta a la base real de producción. Cuidado con scripts que borren/modifiquen datos — hay empleados reales fichando ahí.

### Railway CLI

El comando global `railway` **no está en el PATH de esta sesión/máquina** (probado, exit 127). Usar vía `npx`:

```bash
npx --yes @railway/cli <comando>
# ej: npx --yes @railway/cli up --service web --detach --json -m "mensaje"
# ej: npx --yes @railway/cli deployment list --service web --json
```

No hay credenciales de Railway en variables de entorno visibles — si `npx @railway/cli whoami` falla, hay que loguear (`railway login`) antes de poder deployar.

## Estructura de archivos (mapa rápido)

```
prisma/schema.prisma, seed.ts       — modelo de datos completo, seed del admin inicial
lib/                                 — lógica pura + tests, session, webauthn, password, fechas, rostro, geo
components/ui.tsx                    — kit de UI compartido (Button, Card, Input, Modal, useConfirm, Badge, etc.) — TODO pasa por acá
components/Brand.tsx, Header.tsx, BottomNav.tsx, Sidebar.tsx, PageShell.tsx — chrome de la app
app/page.tsx                         — redirect según sesión
app/login/page.tsx                   — login (passkey o contraseña)
app/registro/[token]/page.tsx        — alta de passkey por invitación
app/fichar/                          — pantalla del empleado: FicharBoton, VerificarRostroModal, RegistrarRostro, MisSolicitudes
app/admin/empleados/                 — alta/gestión de personal
app/admin/turnos/                    — turnos + vista semanal (SemanaGantt.tsx)
app/admin/presencia/                 — presencia en vivo, aprobaciones de correcciones/ausencias
app/admin/reportes/                  — reportes + export CSV/Excel/PDF (imprimir/)
app/admin/configuracion/             — multi-sucursal: horarios, geocerca, categorías, tolerancia facial
app/api/                             — todas las rutas API
```

`/admin/*` protegido server-side por `requireEncargado()`/`requireAdmin()` en `lib/session.ts`; `/fichar` por `getSession()`.

## Qué se hizo en la última sesión (2026-09-03)

Corrida `/impeccable critique` (skill de diseño) sobre toda la app con dos sub-agentes independientes (revisor de diseño + detector/evidencia de navegador). Reporte completo guardado en [`.impeccable/critique/2026-09-03T15-42-17Z__app.md`](.impeccable/critique/2026-09-03T15-42-17Z__app.md). Score: 21/40 (Aceptable).

El usuario pidió arreglar **todo** lo encontrado. Se implementó y ya está **deployado en producción**:

- **P0** Confirmación al borrar un turno (`app/admin/turnos/TurnosClient.tsx`, usando `useConfirm()` del kit).
- **P0** Botón "Reintentar" en el modal de verificación facial en vez de un único intento con auto-cierre (`app/fichar/VerificarRostroModal.tsx`).
- **P1** Contraste WCAG AA del botón primario (`components/ui.tsx`: `bg-emerald-600`→`bg-emerald-700`).
- **P1** Vista "Semana" de turnos: de 7 tarjetas separadas a una sola tarjeta continua (`app/admin/turnos/SemanaGantt.tsx`).
- **P1** Sidebar de escritorio para admin/encargado en vez del bottom-nav mobile (`components/Sidebar.tsx`, nuevo; cambios en `components/PageShell.tsx`, `components/BottomNav.tsx` para exportar `ITEMS`/`RANGO`).
- Rebranding "Control de personal" → "Jumbo" (`components/Brand.tsx`, `app/layout.tsx`, `app/admin/reportes/imprimir/ImprimirClient.tsx`).
- Target táctil del botón secundario de login a 44px (`app/login/page.tsx`).
- Nuevo tono `rose` en `Badge` (`components/ui.tsx`) para diferenciar "días sin fichar" de "horas extra" (antes ambos ámbar).
- Motivo de rechazo visible al empleado en correcciones/ausencias (`app/admin/presencia/PresenciaClient.tsx` usa `window.prompt` — deliberadamente simple, ver nota abajo — y `app/fichar/MisSolicitudes.tsx` lo muestra).

Todo verificado con `tsc`, `lint`, los 9 test suites y `next build` antes de deployar. Verificación visual en navegador limitada al login (contraste, target táctil, marca) — cámara/GPS no se pueden probar en el navegador en sandbox, y las pantallas de admin no se probaron visualmente porque no hay credenciales de prueba con contraseña cargadas (ver abajo).

## Pendiente / a tener en cuenta

- **Verificar en dispositivo real**: el modal de reintento facial y el sidebar de admin en desktop nunca se probaron en un dispositivo/navegador real, sólo por código + build limpio. Pedirle al usuario que lo pruebe.
- **`window.prompt()` para el motivo de rechazo** es una solución deliberadamente mínima (nativa del navegador, no un modal propio) — si se quiere una UI más pulida, es candidato a mejorar.
- **No hay empleados con `passwordHash`** en la base real (verificado con una query directa) — para probar el login por contraseña o las pantallas de admin en un navegador automatizado hace falta o bien setear una contraseña de prueba a mano, o usar las credenciales reales del usuario (no las tengo).
- El reporte de crítica completo tiene más observaciones menores no listadas acá — leer el archivo en `.impeccable/critique/` si se quiere seguir iterando con `/impeccable polish` o comandos puntuales (`bolder`, `clarify`, etc.).
- Sin remoto git — considerar si conviene crear uno (GitHub/GitLab) para que Codex y Claude no diverjan trabajando sobre el mismo directorio local sin historial compartido.
