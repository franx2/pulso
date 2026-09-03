# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three tiers, all restaurant staff:

- **Admin** (dueño/gerencia general) — administra sucursales, empleados, categorías, configuración de cada local y reportes de todo el negocio. Usa la app tanto desde el celular como desde una PC/notebook.
- **Encargado** (jefe de turno por sucursal) — arma turnos, aprueba correcciones y ausencias, mira presencia en vivo de su local.
- **Empleado** (mozo, cocinero, cajero, repartidor, etc.) — ficha entrada/salida/descanso desde su propio celular al llegar y al irse de su turno.

## Product Purpose

Control de personal para Jumbo, un negocio gastronómico multi-sucursal en expansión. Reemplaza el fichaje en papel/planilla por marcado desde el celular propio de cada empleado, verificado con biometría del dispositivo (passkey), geolocalización y reconocimiento facial opcional por cámara. Centraliza turnos (con vista Gantt semanal de superposiciones), ausencias, correcciones de fichaje y reportes de horas listos para liquidar sueldos, todo desglosado por sucursal.

## Positioning

No es un reloj fichador genérico de SaaS por asiento: el login es biometría nativa del dispositivo (WebAuthn/passkey) más, opcionalmente, verificación en vivo por cámara y geocerca por GPS — sin PIN compartible ni tarjeta que se presta entre compañeros. Es software propio del negocio, no una suscripción por empleado, con reglas de cálculo de horas (extras, tope semanal, descuento de descanso) configurables sucursal por sucursal, pensado para una cadena que está activamente sumando locales.

## Operating Context

- El fichaje ocurre parado en o cerca de la cocina/salón, con el celular propio.
- Cocina real: vapor, guantes, gorros, luz variable — condición normal a diseñar, no caso límite (ya afecta la tolerancia del reconocimiento facial).
- Negocio en expansión: hoy 2 sucursales (Jumbo y Las Cañas), se esperan más en el corto/mediano plazo.
- Admin y encargados también usan pantallas más grandes (PC/notebook) para armar turnos y revisar reportes.
- Interfaz enteramente en español (Argentina).
- Ya en producción con datos reales: 5+ empleados activos fichando en las 2 sucursales.

## Capabilities and Constraints

- Multi-sucursal: cada local tiene su propio horario de atención semanal, geocerca, política de descanso, tope de horas extra y activación de reconocimiento facial.
- Login por passkey (Face ID/huella) o contraseña, a elección del empleado.
- Turnos con carga múltiple (varios empleados a la vez, horario editable por persona) y vista Gantt semanal de superposiciones.
- Ausencias y licencias con adjunto de certificado y aprobación del encargado.
- Correcciones de fichaje iniciadas por el empleado, aprobadas por el encargado, con auditoría de quién cambió qué.
- Categorías de puesto (mozo, cocinero, cajero...) libres por sucursal, sin lista fija.
- Reportes filtrables por sucursal y empleado, exportables a CSV, Excel y PDF, con cálculo de horas extra semanal.
- Stack ya establecido: Next.js (App Router) + Prisma + PostgreSQL, desplegado en Railway.
- Sin resolver todavía: si al sumar más sucursales va a hacer falta una vista consolidada de reportes multi-local además del filtro por sucursal actual.

## Brand Commitments

Nombre del software: **Pulso Operativo**. Es una herramienta para vender a negocios gastronómicos; cada cliente mantiene su propia identidad y sus sucursales, como Jumbo o Las Cañas. La identidad usa teal operativo (`#0F766E`) como color principal, menta de actividad (`#37E6B0`), fondo claro `#F6F8F5`, tinta `#17211E` y superficie oscura `#0B1412`. El logotipo es una P compacta con un punto menta de estado.

## Evidence on Hand

Sin materiales de marca (logo, fotos, cartelería) disponibles todavía. Sí hay una implementación en producción real y funcionando: https://web-production-e88dab.up.railway.app, con empleados reales fichando en ambas sucursales.

## Product Principles

1. Un fichaje nunca se bloquea: si falla la cámara, el GPS o el reconocimiento facial, el marcado igual se registra y queda señalado para que un encargado lo revise — nadie se queda sin poder fichar por un permiso denegado.
2. Se diseña para condiciones reales de cocina (vapor, guantes, luz mala), no para una oficina con buena luz.
3. Lo multi-sucursal es el caso normal, no un agregado posterior: cada política (horario, descanso, tope de horas, geocerca) vive por local, porque el negocio abre sucursales activamente.
4. Se prioriza biometría del dispositivo sobre secretos compartidos (PIN, contraseña) cuando es posible, porque el personal comparte turnos y celulares y olvida contraseñas.

## Accessibility & Inclusion

Todavía no hay un estándar de accesibilidad establecido para este proyecto.
