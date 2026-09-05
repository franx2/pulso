---
name: "Pulso Operativo"
description: "Centro de control claro y verificable para operaciones gastronómicas."
colors:
  pulse-teal: "#0F766E"
  pulse-teal-deep: "#115E59"
  pulse-mint: "#37E6B0"
  pulse-paper: "#F6F8F5"
  pulse-ink: "#17211E"
  surface: "#FFFFFF"
  line: "#E2E8F0"
  muted: "#64748B"
  dark-ground: "#0B1412"
  dark-surface: "#101C19"
  dark-line: "#29403B"
  dark-muted: "#94A19C"
  warning: "#B45309"
  danger: "#E11D48"
typography:
  headline:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  headline-wide:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0"
  body:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  data:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
rounded:
  control: "8px"
  field: "12px"
  modal: "16px"
  pill: "9999px"
spacing:
  compact: "4px"
  tight: "8px"
  control: "12px"
  content: "16px"
  section: "20px"
  gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.pulse-teal}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.pulse-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.pulse-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    height: "44px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.pulse-ink}"
    rounded: "{rounded.control}"
    padding: "16px"
  badge:
    backgroundColor: "#D1FAE5"
    textColor: "{colors.pulse-teal}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Pulso Operativo

## Overview

**Creative North Star: "El pulso de la operación"**

Pulso es una consola de trabajo serena y precisa. La interfaz prioriza contexto, lectura comparativa y acción: primero se define local y período; después aparecen cifras, evidencia y excepciones. La marca se reconoce por el teal operativo, el menta reservado para actividad o proyección y una composición de reglas finas sobre papel cálido.

La densidad es deliberada, pero nunca amontonada. Las pantallas de administración usan bandas métricas, tablas y gráficos con referencias visibles; en móvil, las tablas se convierten en filas verticales completas. La incertidumbre, los datos parciales y las estimaciones se nombran en pantalla.

**Key Characteristics:**
- Teal escaso y funcional para acciones, selección y lectura positiva.
- Números tabulares, jerarquía compacta y comparaciones con base explícita.
- Paneles planos de borde fino; profundidad sólo para navegación flotante y modales.
- Desktop denso con rail fijo; móvil vertical con navegación inferior desplazable.

## Colors

La paleta mezcla un teal sobrio con menta activa, papel apenas cálido y señales semánticas que no compiten con los datos.

### Primary
- **Teal Pulso** (`pulse-teal`): acción primaria, navegación activa, serie actual y selección.
- **Teal Profundo** (`pulse-teal-deep`): hover y estados activos con mayor contraste.

### Secondary
- **Menta de Actividad** (`pulse-mint`): pronóstico, estado vivo y acento sobre superficies oscuras; no reemplaza al color principal en grandes áreas.

### Tertiary
- **Ámbar de Revisión** (`warning`): datos parciales, cobertura insuficiente y condiciones que requieren revisión.
- **Rosa de Excepción** (`danger`): caídas, pérdidas y errores; nunca se usa como decoración.

### Neutral
- **Papel Operativo** (`pulse-paper`): fondo claro general.
- **Tinta Pulso** (`pulse-ink`): texto principal y cifras.
- **Superficie** (`surface`): controles y paneles.
- **Línea y Texto Secundario** (`line`, `muted`): estructura, ejes y explicación.
- **Noche Operativa** (`dark-ground`, `dark-surface`, `dark-line`, `dark-muted`): equivalentes oscuros, activados por clase y no por categoría de pantalla.

**The Semantic Restraint Rule.** Teal indica acción o selección; menta indica actividad o pronóstico; ámbar y rosa sólo aparecen cuando existe una condición verificable.

## Typography

**Display Font:** Geist, con fallback sans-serif.
**Body Font:** Geist, con fallback sans-serif.

**Character:** Una sola familia de dibujo limpio mantiene la consola directa. La personalidad nace del contraste de peso y de cifras alineadas, no de mezclar tipografías ni espaciar letras.

### Hierarchy
- **Headline** (700, 20px; 24px desde tablet, 1.2): título único de pantalla.
- **Title** (600, 16px, 1.4): paneles, lecturas y grupos de decisión.
- **Body** (400, 14px, 1.5): explicación y contenido operativo; limitar párrafos a unos 70 caracteres.
- **Label** (600, 12px, 1.35): pestañas, encabezados de tabla y metadatos.
- **Data** (700, hasta 24px, 1.2): KPI y resultados; siempre con cifras tabulares.

**The Numeric Alignment Rule.** Montos, porcentajes, conteos y fechas comparables usan cifras tabulares y alineación consistente; el signo va antes del símbolo monetario.

## Layout

La administración usa un rail fijo de 240px en escritorio y un lienzo de hasta 1440px. Los gutters crecen de 16px a 24px y 32px; el ritmo vertical principal es de 20px. El encabezado de página y la barra de contexto permanecen visibles donde el espacio lo permite.

Los tableros siguen un orden estable: contexto compartido, modos, banda de cuatro métricas, evidencia principal y excepciones. En pantallas angostas, las métricas pasan a una cuadrícula 2×2, los selectores se desplazan horizontalmente y toda tabla decisiva se reexpresa como filas verticales; no se encogen columnas hasta volverlas ilegibles.

**The One Context Rule.** Un único alcance y período gobiernan todas las cifras de una vista; la referencia comparativa debe mostrarse junto al rango activo.

## Elevation & Depth

El sistema es plano por defecto. Paneles, tablas y barras se separan con fondo y línea de 1px, sin sombra. La sombra suave se reserva para navegación móvil flotante, modales y estados que realmente se elevan sobre el contenido.

### Shadow Vocabulary
- **Control Bajo** (`0 1px 2px rgba(15, 23, 42, 0.05)`): controles seleccionados y tarjetas heredadas de contenido.
- **Navegación Flotante** (`0 12px 35px rgba(15, 23, 42, 0.22)`): barra inferior móvil sobre el lienzo.

**The Flat by Default Rule.** Si un bloque ya tiene borde, no sumar sombra salvo que cambie de plano o flote sobre contenido desplazable.

## Shapes

Los paneles analíticos y botones usan esquinas discretas de 8px. Campos y controles táctiles heredados usan 12px; modales y navegación móvil pueden llegar a 16px. La forma píldora queda reservada a badges breves y estados, nunca a contenedores de página.

## Components

### Buttons
- **Shape:** control compacto de 8px y altura táctil mínima de 44px.
- **Primary:** teal con texto blanco; en oscuro, menta con tinta profunda.
- **Hover / Focus:** oscurecimiento o aclarado de superficie y anillo de 2px con offset; transición breve de estado.
- **Ghost / Danger:** superficie blanca con borde fino; el peligro conserva el fondo neutro y usa texto rosa.

### Chips
- **Style:** píldoras pequeñas para estado o señal; las opciones de modo son controles segmentados rectangulares.
- **State:** selección sobre superficie blanca con sombra baja; opción inactiva en texto secundario.

### Cards / Containers
- **Corner Style:** 8px en paneles de comando; 12px sólo en la tarjeta compartida heredada.
- **Background:** blanco sobre papel cálido; superficie verde-negra sobre fondo nocturno.
- **Shadow Strategy:** plano por defecto.
- **Border:** línea neutra de 1px.
- **Internal Padding:** 16px, con encabezado y cuerpo separados por regla cuando hay jerarquía interna.

### Inputs / Fields
- **Style:** superficie sólida, borde de 1px, radio de 12px y texto de 16px en móvil para evitar zoom del navegador.
- **Focus:** borde teal y anillo claro de 2px; equivalente menta en modo oscuro.
- **Error / Disabled:** señal semántica en texto; opacidad reducida y cursor no disponible.

### Navigation
- **Desktop:** rail fijo agrupado por Operación, Análisis y Gestión; activo como bloque teal con icono Lucide.
- **Mobile:** barra inferior flotante y desplazable; el elemento activo se centra automáticamente y mantiene icono más etiqueta.

### Command Context
La firma analítica combina selector de alcance y selector temporal en una sola barra. Debajo muestra el rango exacto, la referencia y la cobertura antes de cualquier KPI.

### Analytical Charts
Las series siempre llevan ejes, leyenda y referencia. El período anterior usa trazo discontinuo; el pronóstico conecta historia y futuro, y su área menta representa intervalo, no una segunda línea. Hover y teclado revelan fecha y valor sin alterar el tamaño del gráfico.

## Do's and Don'ts

### Do:
- **Do** mantener alcance, período, referencia y cobertura visibles antes de interpretar una variación.
- **Do** separar rendimiento, comparación por local y control de productos en modos claros.
- **Do** nombrar estimaciones, datos parciales, WAPE, sesgo e intervalos en lenguaje de negocio.
- **Do** usar iconos Lucide consistentes, foco visible y controles táctiles de al menos 44px.
- **Do** transformar tablas anchas en filas móviles completas cuando sus columnas deciden una acción.

### Don't:
- **Don't** usar sparklines sin ejes, tarjetas repetidas o mini-gráficos como sustituto de una comparación explicada.
- **Don't** presentar correlación como causa ni el intervalo de pronóstico como certeza.
- **Don't** mezclar locales o ventanas temporales dentro de una misma banda de métricas.
- **Don't** usar gradientes, texto con tracking decorativo, sombras duras, iconos de texto o color semántico ornamental.
- **Don't** mostrar dotación sugerida hasta que la capacidad por empleado tenga suficientes fichajes reales.
