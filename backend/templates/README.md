## Plantillas PDF vectoriales para Sunday

Este directorio contiene las **plantillas base en PDF** para los documentos vectoriales de Sunday (`cotizacion`, `levantamiento`, `hoja_trabajo`).

- Coloca aquí los archivos:
  - `cotizacion.pdf`
  - `levantamiento.pdf`
  - `hoja_trabajo.pdf`
- El backend las carga mediante `getTemplatePathIfExists(kind)` en `templatePdfGenerator.ts`.
- La generación de PDFs se hace con:
  - `buildPdfContent` (frontend) → construye `contentToSend` con `customBoxes`, `fieldPositions` y `globalFont*`.
  - `POST /api/templates/:kind/generate` → **ruta principal**: flujo rasterizado a **300 dpi** vía worker (`generatePdfFromDocument` + `pdfWorker.ts`): render HTML del documento, captura PNG a escala 300/96 y empaquetado en PDF US Letter con `createPdfFromScreenshotPng`. **Fallback**: si el worker falla, se usa el PDF vectorial (`generatePdfFromTemplate`).
- Si **no existe** la plantilla PDF para un tipo concreto:
  - El backend intenta usar una imagen (`kind.jpg` / `kind.png`) como fondo en el flujo rasterizado.
  - Si tampoco está, el fallback vectorial sigue devolviendo un PDF funcional.

### Cómo actualizar la plantilla de cotización

1. Edita el diseño en Illustrator/Corel (mismo tamaño: carta US Letter).
2. Exporta el PDF como `cotizacion.pdf`.
3. Copia el archivo a `backend/templates/cotizacion.pdf`.
4. En la UI de Sunday:
   - Ajusta las cajas en el editor de plantilla (`PdfTemplateEditor`) hasta que el preview coincida con el PDF.
   - Guarda la configuración; se almacenará en `TemplateConfig` (`fieldPositionsJson`, `customBoxesJson`).

El preview estático (`DocumentPageForPdf`) y el motor PDF (tanto el raster del worker como el vectorial `generatePdfFromTemplate`) comparten la misma geometría y usan `customBoxes` como fuente de verdad.

**Exportación descargada a 300 dpi**: La descarga prioriza el flujo rasterizado (worker + `renderDocumentToHtml` / bundle CJS) para producir un PDF de una página con imagen a 300 dpi efectivos, sin depender del frontend en tiempo de generación. El fallback vectorial garantiza una salida funcional si la captura falla.

