# Auditoría — Docs móvil (Sunday)

Fecha referencia: marzo 2026.

## Objetivo cumplido

- Experiencia tipo “Word iOS”: inicio / crear / explorar, feed de tarjetas, galería de tipos.
- Convivencia con barra inferior global: **oculta en Docs** + padding del `main` ajustado.
- Miniaturas fiables en **iOS** mediante **SVG** (no solo `div` + `aspect-ratio`).
- Contenido visual en previews: líneas de texto, plantilla PDF esquemática, sheet tipo Excel.

## Riesgos / deuda

| Riesgo | Mitigación |
|--------|------------|
| PDF real en thumbnail | Hoy es ilustración SVG; rasterizar 1ª página con pdf.js sería mejora opcional |
| `documentViewBundle` | Tras cambios en `DocumentPageForPdf`, recompilar bundle para PDF servidor |
| Sheets no alineado a Docs | Ver plan y checklist en [`docs/AUDITORIA_SHEETS_MOVIL.md`](AUDITORIA_SHEETS_MOVIL.md) |

## Plantillas PDF y control de versiones (GitHub)

| Qué | Dónde está | ¿Commit al repo? |
|-----|------------|------------------|
| Código editor PDF / merge master+imágenes | `frontend/src/.../DocsPage.tsx`, `pdfTemplateConfig.ts`, `buildPdfContent.ts` | Sí (`src` únicamente) |
| Posiciones de cajas **master** (texto) | Tabla `TemplateConfig` en BD | No automático: hay que **exportar** y opcionalmente **sembrar** (`prisma/seed` o script) si se quieren defaults compartidos |
| Imágenes por **documento** | `content.pdfImageBoxes` / merge en `customBoxes` al guardar | No en Git; viven en BD por documento |
| Artefactos compilados | `frontend/dist`, `backend/dist` | No (build en despliegue o local) |

**Resumen:** Puedes hacer commit del **código** que define la lógica; las **posiciones actuales** en tu servidor solo van a GitHub si las incorporas a un seed/migración de datos o a un JSON de referencia en `docs/` / `backend/scripts/`.

## Checklist QA manual (móvil)

- [ ] Crear: todas las miniaturas muestran contenido (líneas / rejilla).
- [ ] Inicio: tabs Recientes / PDF / Texto filtran bien.
- [ ] Barra Inicio-Crear-Explorar no cortada; safe-area iOS.
- [ ] Abrir doc texto: editor y hoja carta visibles.
- [ ] Inicio landscape: banner sin franja oscura debajo; menú accesible; acciones en 2×2.
