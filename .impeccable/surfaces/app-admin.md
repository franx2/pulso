---
version: 1
slug: "app-admin"
primary_target: "app/admin"
related_targets: []
---

## Scope

Desktop (≥1024px) surface for `/admin/*` (roles ADMIN, ENCARGADO): Equipo, Turnos, Presencia, Reportes, Configuración. Mode: Operate. `/fichar` (rol EMPLEADO, mobile) is explicitly out of scope — stays exactly as it is, current card-stack + bottom-nav.

## Audience, job, action, proof, constraints

Admin/encargado planificando turnos, revisando presencia y reportes desde una notebook/PC, no sólo el celular. Job: escanear estado operativo (quién trabaja, qué falta aprobar, cómo van las horas) y actuar rápido, sin scroll de tarjetas sueltas pensadas para dedo pulgar. Constraint: preservar cada función existente (nada de contenido/copy/lógica se toca, sólo el armazón y la densidad visual). Constraint de marca: paleta ya fijada en PRODUCT.md (teal `#0F766E`, menta `#37E6B0`, fondo `#F6F8F5`, tinta `#17211E`, oscuro `#0B1412`) — no se adopta la paleta roja/bordó de la referencia, sólo su estructura.

## Direction contract

THESIS: El escritorio de admin/encargado deja de ser el mismo stack de tarjetas centradas que usa un empleado en el celular — pasa a ser una consola operativa real: sidebar fijo agrupado por sección + barra de contexto superior densa, refusing the mobile-card-shell-on-a-wide-screen default.

OWN-WORLD: Paleta ya fijada de Pulso Operativo (teal `#0F766E` primario, menta `#37E6B0` para estado activo/foco, fondo `#F6F8F5`, tinta `#17211E`, superficie oscura `#0B1412`), llevada a la densidad operativa de la referencia: sidebar con grupos rotulados en mayúscula chica, filas de nav compactas, barra de contexto pegajosa bajo el header con título de página + filtros/acciones primarias + pills de estado (reusando los tonos existentes de `Badge`), filas de datos densas en vez de grids de tarjetas sueltas donde el contenido es tabular.

STORY: El admin/encargado ve de un vistazo en qué sección está (sidebar agrupado), qué necesita atención ahora (pills de conteo en la barra de contexto) y puede actuar sobre datos densos sin scroll de tarjetas con mucho padding.

FIRST VIEWPORT: En escritorio (≥1024px) para rol ADMIN/ENCARGADO: sidebar fijo ~240px (marca arriba, grupos de nav rotulados, usuario/cerrar sesión abajo) + región principal con barra de contexto pegajosa (título + filtros/acciones de esa pantalla) + contenido en filas/tablas densas donde antes había grids de `Card`. Mobile y `/fichar` sin cambios: columna centrada + bottom-nav como está hoy.

FORM: Dirección fijada por el propio usuario (captura de pantalla de un panel operativo tipo logística/planificación, más un repo de referencia que no resolvió — 404). Sin concept-seed: brief totalmente pinneado, corresponde saltar el roll de conceptos según la propia regla de new-work.md para un pedido precisamente especificado. Seed key: n/a (pinned).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions

Ninguna — alcance y color confirmados por el usuario vía preguntas dirigidas antes de este brief.
