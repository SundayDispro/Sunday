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
| Sheets no alineado a Docs | Plan en `PROMPT_AGENT_SHEETS_EXCEL_IOS.md` |

## Checklist QA manual (móvil)

- [ ] Crear: todas las miniaturas muestran contenido (líneas / rejilla).
- [ ] Inicio: tabs Recientes / PDF / Texto filtran bien.
- [ ] Barra Inicio-Crear-Explorar no cortada; safe-area iOS.
- [ ] Abrir doc texto: editor y hoja carta visibles.
