## Plantillas PDF vectoriales para Sunday

Este directorio contiene las **plantillas base en PDF** para los documentos vectoriales de Sunday (`cotizacion`, `levantamiento`, `hoja_trabajo`).

- Coloca aquí los archivos:
  - `cotizacion.pdf`
  - `levantamiento.pdf`
  - `hoja_trabajo.pdf`
- El backend las carga mediante `getTemplatePathIfExists(kind)` en `templatePdfGenerator.ts`.
- La generación de PDFs se hace con:
  - `buildPdfContent` (frontend) → construye `contentToSend` con `customBoxes`, `fieldPositions` y `globalFont*`.
  - `POST /api/templates/:kind/generate` → llama a `generatePdfFromTemplate(kind, content)` como flujo principal.
- Si **no existe** la plantilla PDF para un tipo concreto:
  - El backend intenta usar una imagen (`kind.jpg` / `kind.png`) como fondo.
  - Si tampoco está, cae al flujo HTML (`html-worker`) y marca el header `X-PDF-Method: html-worker`.

### Cómo actualizar la plantilla de cotización

1. Edita el diseño en Illustrator/Corel (mismo tamaño: carta US Letter).
2. Exporta el PDF como `cotizacion.pdf`.
3. Copia el archivo a `backend/templates/cotizacion.pdf`.
4. En la UI de Sunday:
   - Ajusta las cajas en el editor de plantilla (`PdfTemplateEditor`) hasta que el preview coincida con el PDF.
   - Guarda la configuración; se almacenará en `TemplateConfig` (`fieldPositionsJson`, `customBoxesJson`).

El preview estático (`DocumentPageForPdf`) y el motor PDF (`generatePdfFromTemplate`) comparten la misma geometría y usan `customBoxes` como fuente de verdad, por lo que cualquier cambio de cajas/fuentes en la UI se refleja en el PDF final.

