# Resumen: construcción, arquitectura y plan maestro PDF 1:1

Documento para que un agente entienda la app y genere un plan de solución que garantice que **el PDF generado sea idéntico a lo que se visualiza en el preview/editor**.

---

## 1. Construcción y arquitectura de la app

### Stack
- **Frontend:** React, Vite. TypeScript. Estilos con Tailwind + CSS (variables de tema).
- **Backend:** Node.js, Express, TypeScript. Base de datos SQLite con Prisma.
- **Generación de PDF:** Puppeteer (Chrome headless). El HTML que se imprime se construye en el backend de dos formas posibles (ver más abajo).

### Estructura relevante para documentos/cotizaciones
- **Frontend**
  - `frontend/src/components/pages/DocsPage.tsx`: página principal de Documentos. Mantiene el estado del formulario de la cotización en `pdfFormDraft` (objeto con `cliente`, `fecha`, `total`, `customBoxes`, `customFieldValues`, `globalFontSize`, etc.).
  - **Preview (lo que ve el usuario):** se renderiza con **`PdfTemplateEditor`** (`frontend/src/components/pages/docs/PdfTemplateEditor.tsx`), recibiendo `value={pdfFormDraft}` y `templateConfig={effectiveTemplateConfigForPdf}`. Muestra la plantilla PDF de fondo (iframe) y encima los cuadros de texto/imagen editables (posiciones en 0–1, fuentes, colores, `backgroundColor` para barras negras, etc.).
  - Al hacer clic en **"Descargar PDF"**, se construye un objeto `contentToSend` a partir de `pdfFormDraft`, `parsed` (contenido guardado del doc) y la config de plantilla; se envía `POST /api/templates/:kind/generate` con `body: { content: contentToSend }`.
- **Backend**
  - `backend/src/index.ts`: ruta `POST /api/templates/:kind/generate` recibe `content` y llama a `generatePdfFromDocument({ content, format: 'Letter', templatePdfPath })`.
  - `backend/src/htmlPdfGenerator.ts`: `generatePdfFromDocument()`:
    1. Convierte la primera página del PDF de plantilla a imagen (data URL) para usarla de fondo.
    2. Resuelve `imageUrl` de las cajas a data URLs.
    3. **Decide cómo generar el HTML del cuerpo:**
       - **Si existe `backend/dist/documentViewBundle.cjs`:** usa **`renderDocumentHtml`** del bundle → en Node se ejecuta **`DocumentPageForPdf`** (React) con `renderToStaticMarkup()` y el HTML resultante se envuelve con **`buildDocumentWrapperHtml`** (mismo archivo que abajo).
       - **Si no existe el bundle:** usa **`buildDocumentHtml`** de `backend/src/documentHtmlBuilder.ts` (HTML string puro, sin React).
    4. Carga el HTML en Puppeteer (viewport 816×1056 px), `page.pdf({ format: 'Letter', printBackground: true, margin: 0 })` y devuelve el buffer del PDF.

### Tres implementaciones del “documento”
- **Preview en el navegador:** **PdfTemplateEditor** (React, interactivo, con arrastre de cuadros para admin). Usa `pdfFormDraft` y `effectiveTemplateConfigForPdf`.
- **PDF cuando hay bundle:** **DocumentPageForPdf** (React, renderizado en Node vía `renderDocumentToHtml.tsx` → bundle `documentViewBundle.cjs`). Recibe el mismo `content` que envía el frontend.
- **PDF cuando no hay bundle:** **documentHtmlBuilder.buildDocumentHtml()** (HTML string en backend). Misma idea de cajas y estilos pero otra implementación.

Por tanto, **el PDF real se genera con un componente distinto al del preview** (DocumentPageForPdf vs PdfTemplateEditor), lo que hace que cualquier diferencia de lógica (datos, estilos, unidades, cajas) se traduzca en **PDF ≠ preview**.

### Bundle del servidor
- Entrada: `frontend/src/renderDocumentToHtml.tsx` (exporta `renderDocumentHtml` que hace `renderToStaticMarkup(<DocumentPageForPdf ... />)`).
- Compilación: `node backend/scripts/build-document-view.js` (esbuild) → `backend/dist/documentViewBundle.cjs`.
- Cualquier cambio en **DocumentPageForPdf** o en lo que recibe (props/content) exige **recompilar el bundle** para que el PDF lo refleje.

### Tamaño de página
- Diseño: **US Letter 612×792 pt**. El wrapper HTML tiene `body` con `width: 612pt; height: 792pt` y `@page { size: 612pt 792pt }`. Puppeteer usa `format: 'Letter'`. Si el contenido interior usa otra unidad (p. ej. px) o otro tamaño, el resultado se ve desplazado o recortado.

---

## 2. Análisis de las capturas: errores actuales

### Captura 1 – PDF descargado (cotizacion (74).pdf)
- **Fecha:** "Fecha de emisión: **15/03/2026**".
- **Folio:** "0000" en la esquina superior derecha, fuente sans-serif estándar, negro.
- **Texto en blanco:** Solo se ve una barra negra con "Esta cotización no incluye I.V.A." en blanco. **No aparece el total** (p. ej. "Total: 555") en otra barra/cuadro negro.
- **Layout:** Contenido aparentemente completo pero márgenes inferiores muy justos; impresión de que podría estar ligeramente “cortado” o corrido respecto a un diseño ideal.

### Captura 2 – Preview en la app (editor)
- **Fecha:** "Fecha de emisión: **12/03/2020**" (valor que el usuario espera).
- **Folio:** "0000" con un estilo visual distinto (más marcado / tipografía distinta).
- **Texto en blanco:** Dos elementos claros:
  - A la izquierda: recuadro con borde negro y texto "Esta cotización no incluye I.V.A.".
  - A la derecha: **recuadro negro con "Total: 555" en texto blanco**.
- **Layout:** Todo dentro de un marco negro, bien proporcionado y alineado.

### Errores concretos a corregir
1. **Fecha incorrecta en el PDF (15/03/2026)**  
   En el PDF sale 15/03/2026 en lugar de la fecha del preview (12/03/2020). La fecha es **entrada manual** del usuario; no debe sustituirse por la fecha del día. Indica que el `content` que llega al backend (o la lógica que rellena `content.fecha`) aún introduce en algún momento la fecha actual, o que el draft no envía la misma fecha que se muestra en el preview.

2. **Total (texto blanco) no se ve correctamente en el PDF**  
   En el preview hay un cuadro negro con "Total: 555" en blanco. En el PDF ese cuadro no aparece o no se pinta: solo se ve la barra con "Esta cotización no incluye I.V.A.". Posibles causas: el cuadro "total" no tiene `backgroundColor` en el HTML que genera DocumentPageForPdf, o no se envía en `content.customBoxes`, o el orden/z-index hace que no se vea, o hay un solo cuadro en el diseño y en el preview se muestran dos (IVA + Total) por diferencia de implementación.

3. **Folio con otro estilo/fuente en el PDF**  
   En el preview el folio tiene un estilo diferenciado; en el PDF se ve como texto normal. El componente que genera el PDF (DocumentPageForPdf o documentHtmlBuilder) no está aplicando la misma `fontFamily`, `fontSize` o `fontBold` que la plantilla para el cuadro con `fieldKey === 'folio'` o `semantic === 'folio'`.

4. **PDF “cortado y corrido a la izquierda”**  
   Sensación de que el contenido no respeta bien US Letter o que está desplazado. Típico cuando el contenido interior usa **píxeles** (p. ej. `width: 612` sin unidad → 612px) mientras el wrapper y la impresión son en **pt** (612pt × 792pt), o cuando el viewport y el tamaño de página no están alineados con el mismo criterio (todo en pt y mismo tamaño lógico).

---

## 3. Flujo de datos hasta el PDF (resumen)

1. Usuario edita en **DocsPage** → estado en **`pdfFormDraft`** (y en el doc guardado, `content` en DB).
2. **Preview:** **PdfTemplateEditor** lee `value={pdfFormDraft}` y `templateConfig`; lo que se ve es la “verdad” que debe coincidir con el PDF.
3. Al **Descargar PDF:** se arma **contentToSend** (mezcla de `parsed`, `pdfFormDraft`, campos explícitos para fecha/folio/total, `customBoxes` de la config, etc.) y se envía a `POST /api/templates/:kind/generate`.
4. Backend recibe **content**; si existe el bundle, **DocumentPageForPdf** (con ese `content`) genera el HTML; si no, **buildDocumentHtml** (con ese `content`) genera el HTML.
5. Ese HTML se envuelve en **buildDocumentWrapperHtml** (body 612pt×792pt, fuentes, print-color-adjust).
6. Puppeteer carga el HTML, imprime a PDF Letter con márgenes 0.

Para que PDF = preview hace falta:
- Que **content** enviado al backend sea **exactamente** el que corresponde a lo mostrado en el preview (misma fecha, mismo total, mismos customBoxes con backgroundColor/fuente, etc.).
- Que **DocumentPageForPdf** (o buildDocumentHtml si se usa) aplique **la misma lógica** que PdfTemplateEditor para posiciones, tamaños, fuentes, colores y fondos (backgroundColor), y que use **las mismas unidades** (pt) y el mismo tamaño de página (612×792 pt).

---

## 4. Plan maestro sugerido (para que un agente lo desarrolle)

Objetivo: **una sola fuente de verdad** para “cómo se ve la hoja” y que el PDF sea 1:1 con el preview.

### 4.1 Unificar implementación (recomendado)
- **Opción A:** Hacer que el HTML del PDF lo genere **el mismo componente** que el preview (PdfTemplateEditor), exportando una “vista estática” (por ejemplo una variante o el mismo DocumentPageForPdf) que comparta **exactamente** la misma lógica de cajas, estilos y unidades que PdfTemplateEditor. Que DocumentPageForPdf no sea una réplica independiente sino que use las mismas constantes, la misma estructura de estilos (incl. `backgroundColor`, fuentes por cuadro) y las mismas unidades (pt).
- **Opción B:** Si se mantienen dos componentes (preview vs PDF), definir un **especificación única** (objeto de layout + estilos por tipo de caja) y que tanto PdfTemplateEditor como DocumentPageForPdf (y si aplica documentHtmlBuilder) la consuman. Cualquier detalle (folio, total, fecha, barras negras) debe derivarse de esa especificación.

### 4.2 Payload y fecha
- Asegurar que **nunca** se inyecte la fecha del sistema como valor por defecto al armar `content` para el PDF. La fecha debe ser siempre la que muestra el preview: `pdfFormDraft.fecha` o `customFieldValues[id del cuadro fecha]` o `parsed.fecha` del documento guardado. En `docTypes.ts`, los contenidos iniciales (p. ej. cotización) no deben poner `fecha: new Date().toISOString().slice(0, 10)`; usar `fecha: ''`.
- Revisar todo el flujo desde que el usuario abre el doc hasta que hace clic en Descargar: que `pdfFormDraft.fecha` (o el origen que use el preview) sea el mismo que se incluye en `contentToSend.fecha`.

### 4.3 Total y barras con texto blanco
- En el diseño hay al menos un cuadro con **Total** (texto blanco sobre fondo negro). Ese cuadro debe tener en `customBoxes` **`backgroundColor: '#000000'`** (o el valor que use la plantilla) y **`fontColor: '#ffffff'`**.
- En **DocumentPageForPdf** (y en documentHtmlBuilder si se usa), el estilo del contenedor de cada cuadro debe incluir **`backgroundColor`** tomado de `box.backgroundColor` y **`print-color-adjust: exact`** para que Puppeteer imprima el color. Comprobar que el cuadro “total” existe en `content.customBoxes` con esos campos y que el HTML generado pinta ese fondo.

### 4.4 Folio (estilo y fuente)
- En la plantilla (effectiveTemplateConfigForPdf) el cuadro de folio puede tener `fontSize`, `fontFamily`, `fontBold`. **DocumentPageForPdf** (y documentHtmlBuilder) deben aplicar esos mismos valores al cuadro con `fieldKey === 'folio'` o `semantic === 'folio'`, sin limitar el tamaño a un máximo fijo que anule el de la plantilla.

### 4.5 Unidades y tamaño US Letter
- En el HTML que Puppeteer imprime, **todo** el layout (página y cuadros) debe usar **puntos (pt)** y tamaño lógico 612×792. En **DocumentPageForPdf** (y donde se genere el div de la página), usar `width: '612pt'`, `height: '792pt'` y para cada cuadro `left`, `top`, `width`, `height` en `'Xpt'`. No usar números sin unidad (que en el navegador se interpretan como px). Así el contenido y el body del wrapper comparten el mismo sistema de medidas y no hay recorte ni desplazamiento por diferencia de escala.

### 4.6 Verificación y bundle
- Después de cada cambio en **DocumentPageForPdf**, en **documentHtmlBuilder** o en la construcción de **content** en DocsPage, **recompilar** `documentViewBundle.cjs` y reiniciar el backend para que el PDF use el código nuevo.
- Checklist de verificación: misma fecha que en el preview; Total visible en blanco sobre negro; folio con el mismo estilo que en el preview; página completa sin cortes ni desplazamiento raro (US Letter correcto).

---

## 5. Archivos clave (referencia rápida)

| Rol | Ruta |
|-----|------|
| Estado del formulario y descarga PDF | `frontend/src/components/pages/DocsPage.tsx` |
| Preview (editor visual) | `frontend/src/components/pages/docs/PdfTemplateEditor.tsx` |
| Componente que genera el HTML del PDF (bundle) | `frontend/src/components/pages/docs/DocumentPageForPdf.tsx` |
| Entrada del bundle SSR | `frontend/src/renderDocumentToHtml.tsx` |
| Generación PDF y elección HTML | `backend/src/htmlPdfGenerator.ts` |
| Wrapper HTML (body, @page, fuentes) | `backend/src/documentHtmlBuilder.ts` (buildDocumentWrapperHtml, buildDocumentHtml) |
| Contenido inicial por tipo de doc (fecha vacía, etc.) | `frontend/src/components/pages/docs/docTypes.ts` |
| Script para compilar bundle | `backend/scripts/build-document-view.js` → `backend/dist/documentViewBundle.cjs` |

---

Con este resumen y el análisis de las capturas, un agente puede generar un plan de solución maestro paso a paso (incluyendo cambios concretos por archivo) para que el PDF generado sea el mismo que se visualiza en el preview/editor.
