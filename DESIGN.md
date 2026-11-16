---
name: "Pulso Operativo"
description: "Consola de operación de Bianco & Nero: papel cálido, tinta casi negra, arena dorada y salvia."
colors:
  tinta: "#161311"
  tinta-calida: "#2D2A26"
  papel: "#F5F3EE"
  surface: "#FDFDFC"
  piedra: "#E3E0D8"
  muted: "#706B60"
  arena: "#D6C69B"
  arena-oscura: "#A08F5C"
  arena-texto: "#6E6038"
  salvia: "#74926B"
  salvia-profunda: "#4A6244"
  scrim: "rgba(22,19,17,0.5)"
  warning: "#B45309"
  danger: "#E11D48"
typography:
  headline:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
    textTransform: "uppercase"
  headline-wide:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
    textTransform: "uppercase"
  title:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.06em"
    textTransform: "uppercase"
  body:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.08em"
    textTransform: "uppercase"
  data:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  micro:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
rounded:
  control: "4px"
  field: "6px"
  modal: "10px"
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
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.tinta-calida}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  field:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.tinta}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    height: "44px"
  panel:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.tinta}"
    rounded: "{rounded.control}"
    padding: "16px"
  badge:
    backgroundColor: "#E2E9DD"
    textColor: "{colors.salvia-profunda}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---
# Design System: Pulso Operativo

## Overview

**Creative North Star: "La caja de bombones"**

Pulso es la consola de los locales de Bianco & Nero y se viste como la marca: papel cálido, tinta casi negra, un dorado arena de caja de regalo y un verde salvia apagado. Nada de teal de plantilla ni grises azulados: los neutros son piedra cálida, y el negro es el negro de la casa. La interfaz prioriza contexto, lectura comparativa y acción; la marca vive en los detalles precisos (títulos condensados en mayúsculas, esquinas de papelería, el cuadrado partido del logo), no en decoración.

**Key Characteristics:**
- Tinta para la acción principal y lo seleccionado; salvia para "bien / activo / a favor"; arena como acento escaso.
- Roboto Condensed en toda la app: entra más cifra por fila y los títulos en mayúsculas con aire repiten la web de la marca.
- Paneles planos de borde fino y esquinas de 4px; profundidad sólo para hojas, modales y la barra inferior.
- Sólo modo claro: se trabaja en el salón y en la caja, con luz.

## Colors

La implementación redefine las escalas de Tailwind que ya usaba toda la app: `slate` es la piedra cálida y `emerald` es la salvia. `arena-*` es la escala nueva del dorado. Así 1.400 clases cambiaron de mundo sin tocarse una por una.

### Primary
- **Tinta** (`tinta`, `slate-950`): botón primario, navegación activa, mesa ocupada, encabezados de hoja y comanda.
- **Tinta cálida** (`tinta-calida`, `slate-800`): hover del primario, la barra inferior, la serie actual de los gráficos.

### Secondary
- **Salvia** (`salvia`, `emerald-500..800`): positivo, presente, listo, mesa libre al abrirla, el botón de fichar.
- **Arena** (`arena`, `arena-300`): selección del plano, cobro parcial, resaltado de fila elegida. Como texto sólo `arena-700` (contraste 6:1).

### Tertiary
- **Ámbar de revisión** (`warning`): pendiente, sin enviar, datos parciales.
- **Rosa de excepción** (`danger`): errores, demoras, deuda. Nunca decorativo.

### Neutral
- **Papel** (`papel`): fondo general. **Superficie** (`surface`, `#FDFDFC`): barras, hojas y botones fantasma; los paneles son blancos.
- **Piedra** (`slate-200`): líneas. **Texto secundario** (`slate-500`, 5:1 sobre papel).
- **Velo** (`scrim`): detrás de modales y hojas.

**The Semantic Restraint Rule.** Tinta es acción o selección; salvia es estado bueno; arena es acento; ámbar y rosa sólo aparecen cuando hay una condición verificable.

**Gráficos.** La serie actual va en tinta y la referencia en arena oscura (se separan por luminosidad). Las categóricas de Ventas (`--cat-1..7`) siguen siendo las validadas contra daltonismo.

## Typography

**Familia única:** Roboto Condensed (400/500/600/700), servida con `next/font`.

**Character:** condensada y firme, como la web de Bianco & Nero. La personalidad sale de los títulos en mayúsculas con tracking (`.titulo-marca`, 0.06em) y del contraste de peso; el cuerpo va en minúsculas y sin tracking.

### Hierarchy
- **Headline** (700, 20px; 24px desde tablet, mayúsculas): título de pantalla.
- **Title** (700, 14px, mayúsculas): encabezado de panel, de hoja, de modal.
- **Body** (400, 14px, 1.5): contenido operativo; párrafos de unos 70 caracteres.
- **Label** (600, 11px, mayúsculas, 0.08em): encabezados de tabla, rótulos de métrica y de grupo.
- **Data** (700, hasta 24px): KPI y montos, con cifras tabulares.
- **Micro** (600, 11px): anotaciones dentro de gráficos y del plano.

**The Numeric Alignment Rule.** Montos, porcentajes, conteos y horas comparables usan cifras tabulares; el signo va antes del símbolo monetario.

## Layout

La administración usa un rail fijo de 72px en escritorio que se expande a 240px con hover o foco. La expansión flota sobre el lienzo para no mover los datos mientras se navega. Los gutters crecen de 16px a 24px y 32px; el ritmo vertical principal es de 20px. El encabezado de página y la barra de contexto permanecen visibles donde el espacio lo permite.

Los tableros siguen un orden estable: contexto compartido, modos, banda de cuatro métricas, evidencia principal y excepciones. En pantallas angostas, las métricas pasan a una cuadrícula 2×2, los selectores se desplazan horizontalmente y toda tabla decisiva se reexpresa como filas verticales; no se encogen columnas hasta volverlas ilegibles.

**The One Context Rule.** Un único alcance y período gobiernan todas las cifras de una vista; la referencia comparativa debe mostrarse junto al rango activo.

## Elevation & Depth

El sistema es plano por defecto. Paneles, tablas y barras se separan con fondo y línea de 1px, sin sombra. La sombra suave se reserva para navegación móvil flotante, modales y estados que realmente se elevan sobre el contenido.

### Shadow Vocabulary
- **Barra inferior** (`0 10px 30px rgba(22,19,17,0.3)`): la barra de tinta flotando sobre el lienzo en el celular.
- **Hoja** (`0 -12px 32px rgba(22,19,17,0.18)`): el panel de mesa o de venta cuando sube desde abajo.

**The Flat by Default Rule.** Si un bloque ya tiene borde, no sumar sombra salvo que cambie de plano o flote sobre contenido desplazable.

## Shapes

Esquinas de papelería: 4px en paneles y botones, 6px en campos, 10px en modales y hojas. Las mesas cuadradas del plano llevan 3px; las redondas, círculo. La píldora queda para badges breves.

## Components

### Buttons
- **Shape:** control compacto de 4px y altura táctil mínima de 44px.
- **Primary:** tinta con texto papel.
- **Hover / Focus:** oscurecimiento o aclarado de superficie y anillo de 2px con offset; transición breve de estado.
- **Ghost / Danger:** superficie papel con borde de piedra; el peligro conserva el fondo neutro y usa texto rosa.

### Chips
- **Style:** píldoras pequeñas para estado o señal; las opciones de modo son controles segmentados rectangulares.
- **State:** el segmento activo se rellena de tinta; la opción inactiva va en texto secundario.

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** blanco sobre papel cálido.
- **Shadow Strategy:** plano por defecto.
- **Border:** línea neutra de 1px.
- **Internal Padding:** 16px, con encabezado y cuerpo separados por regla cuando hay jerarquía interna.

### Inputs / Fields
- **Style:** superficie sólida, borde de 1px, radio de 6px y texto de 16px en móvil para evitar zoom del navegador.
- **Focus:** borde de tinta y anillo arena de 2px.
- **Error / Disabled:** señal semántica en texto; opacidad reducida y cursor no disponible.

### Navigation
- **Desktop:** rail fijo de iconos agrupado por Operación, Análisis y Gestión, con los rótulos de grupo en arena; se expande con hover o foco. El activo es un bloque de tinta.
- **Mobile:** barra inferior de tinta, flotante y desplazable; el activo es una ficha papel con etiqueta en mayúsculas.

### Panel lateral (estilo Fudo)
Elegir una mesa en el salón o una venta en el listado abre un panel a la derecha (`xl` / `2xl`); en pantallas menores es una hoja que sube desde abajo sobre un velo. Encabezado de tinta (ocupada) o salvia (libre) con el número en mayúsculas.

### Command Context
La firma analítica combina selector de alcance y selector temporal en una sola barra. Debajo muestra el rango exacto, la referencia y la cobertura antes de cualquier KPI.

### Analytical Charts
Las series siempre llevan ejes, leyenda y referencia. El período anterior usa trazo discontinuo; el pronóstico conecta historia y futuro, y su banda translúcida representa intervalo, no una segunda línea. Hover y teclado revelan fecha y valor sin alterar el tamaño del gráfico.

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
- **Don't** usar gradientes, tracking fuera de los títulos en mayúsculas, sombras duras, iconos de texto o color semántico ornamental.
- **Don't** mostrar dotación sugerida hasta que la capacidad por empleado tenga suficientes fichajes reales.
