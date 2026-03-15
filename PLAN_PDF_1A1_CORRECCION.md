# Plan de corrección: PDF 1:1 con vista previa

## Resumen del análisis (sin cambios de código)

El PDF descargado se genera con **dos rutas posibles** en el backend:

1. **Si existe `backend/dist/documentViewBundle.cjs`**: se usa **`renderDocumentHtml`** → componente React **`DocumentPageForPdf`** (renderizado en Node con `react-dom/server`).
2. **Si no existe el bundle**: se usa **`buildDocumentHtml`** en `documentHtmlBuilder.ts` (HTML string puro).

En la práctica, si el bundle está compilado, **el PDF lo genera el componente React**, no `documentHtmlBuilder`. Por eso las correcciones hechas solo en `documentHtmlBuilder` (backgroundColor, folio fontSize) **no se aplican** cuando se usa el bundle.

---

## 1. Folio con otro estilo/fuente en el PDF

**Causa raíz**

- En **`DocumentPageForPdf.tsx`** (usado por el bundle para el PDF) el folio sigue con la lógica antigua:
  - `size = Math.min(size, FOLIO_MAX_FONT_SIZE_PT)` → siempre se limita a 11 pt y **no se usa `box.fontSize`** cuando el admin definió un tamaño mayor en la plantilla.
- En el **preview** (PdfTemplateEditor) sí se usa `box.fontSize` y `box.fontFamily` / `box.fontBold` del cuadro.
- Resultado: en el PDF el folio sale con 11 pt y posiblemente con la fuente por defecto; en la vista previa conserva el estilo de la plantilla.

**Plan de corrección**

- En **`DocumentPageForPdf.tsx`**, alinear la lógica del folio con `documentHtmlBuilder` y con el editor:
  - Si el cuadro tiene `box.fontSize`, usar ese valor para el folio.
  - Si no, usar `Math.min(size, FOLIO_MAX_FONT_SIZE_PT)` como tope.
- Asegurar que **`box.fontFamily`** y **`box.fontBold`** se apliquen siempre al cuadro folio (ya se usan en `ff` y `bold`, pero confirmar que no se sobrescriben para folio).

---

## 2. Texto en blanco de la parte inferior no se ve en el PDF

**Causa raíz**

- En **`DocumentPageForPdf.tsx`** el `boxStyle` del cuadro **no incluye `backgroundColor`**.
- El `innerStyle` tiene `backgroundColor: 'transparent'`.
- Por tanto, los cuadros de “Total” y “Esta cotización no incluye I.V.A.” (texto blanco sobre barra negra) se renderizan **sin fondo** en el HTML que Puppeteer convierte a PDF; el texto blanco queda sobre fondo blanco y no se ve.
- En `documentHtmlBuilder.ts` ya se aplica `box.backgroundColor` en el div del cuadro, pero ese código **no se usa** cuando el PDF se genera con el bundle React.

**Plan de corrección**

- En **`DocumentPageForPdf.tsx`**:
  - Añadir a `boxStyle` el `backgroundColor` del cuadro cuando exista:  
    `backgroundColor: (typeof box.backgroundColor === 'string' && box.backgroundColor.trim()) ? box.backgroundColor.trim() : 'transparent'`.
  - Mantener en el div interno `backgroundColor: 'transparent'` para no duplicar el fondo.
  - Añadir en el contenedor del cuadro (o en los estilos que se imprimen) `WebkitPrintColorAdjust: 'exact'` y `printColorAdjust: 'exact'` si no están ya, para que Chrome/Puppeteer imprima el color de fondo.

---

## 3. Fecha 15/03/2026 en el PDF en lugar de la del documento

**Nota:** La fecha es siempre entrada manual del usuario; puede ser cualquier texto (incluso no válido como fecha). No se valida ni se corrige: se muestra y se envía al PDF exactamente como el usuario la escribe.

**Causa raíz**

- En **`docTypes.ts`**, `COTIZACION_INITIAL`, `LEVANTAMIENTO_INITIAL` y `HOJA_TRABAJO_INITIAL` definen:
  - `fecha: new Date().toISOString().slice(0, 10)` (fecha del día en que se ejecuta el código).
- Al abrir un documento, el draft se rellena con:
  - `merged = { ...initial, ...parsed }` → `initial` = `getInitialContentForType(...)`, que devuelve ese objeto con **fecha = hoy**.
- Si el documento **no tiene `fecha` guardada** en `content` (documento antiguo o nunca guardado), `parsed.fecha` es `undefined`, así que `merged.fecha` queda con la fecha de **hoy** que trae `initial`.
- Esa fecha (p. ej. 15/03/2026) es la que se muestra en el preview y la que se envía al generar el PDF.

**Plan de corrección**

- En **`docTypes.ts`**:
  - Cambiar en `COTIZACION_INITIAL`, `LEVANTAMIENTO_INITIAL` y `HOJA_TRABAJO_INITIAL` la clave `fecha` a **cadena vacía**: `fecha: ''`.
  - Así, los documentos nuevos y los que no tienen fecha guardada no tendrán una “fecha de hoy” por defecto; la fecha solo aparecerá cuando el usuario la escriba o cuando venga guardada en `content`.
- Opcionalmente, en **`DocsPage.tsx`**, al montar el payload para el PDF, seguir garantizando que **nunca** se use `new Date()` como fallback para `contentFromDraft.fecha` (ya corregido en el análisis anterior: se usa solo `fechaStr` o `parsed.fecha`).

---

## 4. PDF cortado y corrido a la izquierda (tamaño US Letter)

**Causa raíz**

- En **`DocumentPageForPdf.tsx`** todas las dimensiones son **números sin unidad**:
  - `pageStyle`: `width: PAGE_W_PX` (612), `height: PAGE_H_PX` (792).
  - Posiciones y tamaños de los cuadros: `leftPx`, `topPx`, `widthPx`, `heightPx` (también números).
- En el DOM/CSS, un número en `style` en React se interpreta como **píxeles** (px).
- Por tanto, la “página” del documento en el HTML es **612px × 792px**, no 612pt × 792pt.
- El **wrapper** en `buildDocumentWrapperHtml` define `body` con `width: 612pt; height: 792pt` (correcto para US Letter). A 96 DPI, 612pt = 816px y 792pt = 1056px, así que el body ocupa 816×1056 px.
- El contenido interno (el div de la página) es 612×792 **px**, es decir, un rectángulo más pequeño que el body, que queda desplazado (p. ej. arriba/izquierda) y con espacio vacío a la derecha y abajo.
- Al generar el PDF con `page.pdf({ format: 'Letter' })`, la página es 612×792 **pt**, pero el contenido que Chrome pinta está en px y con ese desajuste de tamaño/posición, lo que se ve es el PDF “cortado” y “corrido” respecto a lo esperado.

**Plan de corrección**

- En **`DocumentPageForPdf.tsx`** usar **puntos (pt)** en todo el layout para que coincida con el wrapper y con US Letter:
  - `pageStyle`: `width: '612pt'`, `height: '792pt'`, `minWidth: '612pt'`, `minHeight: '792pt'`.
  - Para cada cuadro: `left`, `top`, `width`, `height` como strings con unidad `'pt'`, p. ej. `left: \`${leftPx}pt\`` (los valores numéricos 612/792 y los derivados de ellos son lógicamente “puntos” en el diseño; se pueden seguir calculando con `PAGE_W_PX`/`PAGE_H_PX` pero asignando la unidad `'pt'` al generar el estilo).
- Así la “hoja” en el HTML será 612pt × 792pt, igual que el body del wrapper y que el tamaño de página del PDF, y el resultado será 1:1 sin recortes ni desplazamientos por diferencia de unidades.

---

## 5. Orden recomendado de implementación

1. **Unidades en pt en `DocumentPageForPdf`** (punto 4) → corrige el tamaño y la posición del contenido en el PDF (base para que el resto se vea bien).
2. **`backgroundColor` en `DocumentPageForPdf`** (punto 2) → recupera el texto blanco sobre barra negra en la parte inferior.
3. **Folio: mismo estilo/fuente que el preview** (punto 1) → respetar `box.fontSize` (y opcionalmente `fontFamily`/`fontBold`) en el cuadro folio.
4. **Fecha: quitar valor por defecto “hoy”** en `docTypes.ts` (punto 3) y asegurar que el payload del PDF no inyecte nunca la fecha actual.

Después de cada cambio, recompilar el bundle si se modifica el frontend/bundle:

```bash
# Desde la raíz del repo
node backend/scripts/build-document-view.js
# o el comando que use el proyecto para generar backend/dist/documentViewBundle.cjs
```

Así el PDF generado con el bundle React será 1:1 con la vista previa en folio, texto blanco, fecha y tamaño US Letter.
