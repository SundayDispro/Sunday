# Auditoría — Sheets móvil (Sunday)

Fecha de referencia: marzo 2026.

## Objetivo

Alinear el editor de hojas (`ExcelLikeSheet`) con el nivel de pulido del módulo Docs en móvil, tomando como referencia de UX patrones tipo **hoja de cálculo en iOS** (chrome oscuro, rejilla clara, barra de fórmulas, pestañas inferiores), **sin** copiar assets ni marcas de terceros.

## Archivos relevantes

| Rol | Ruta |
|-----|------|
| Editor | [`frontend/src/components/pages/docs/ExcelLikeSheet.tsx`](../frontend/src/components/pages/docs/ExcelLikeSheet.tsx) |
| Tipos de estilo de celda | [`frontend/src/components/pages/docs/sheetCellTypes.ts`](../frontend/src/components/pages/docs/sheetCellTypes.ts) |
| Tema compartido (tokens) | [`frontend/src/components/mobile/docs/sheetExcelTheme.ts`](../frontend/src/components/mobile/docs/sheetExcelTheme.ts) |
| Miniatura tipo sheet | [`frontend/src/components/mobile/docs/DocTypeThumbnail.tsx`](../frontend/src/components/mobile/docs/DocTypeThumbnail.tsx) |
| Orquestación / dos rutas de uso | [`frontend/src/components/pages/DocsPage.tsx`](../frontend/src/components/pages/DocsPage.tsx) |
| Shell Docs móvil | [`frontend/src/components/mobile/docs/MobileDocsShell.tsx`](../frontend/src/components/mobile/docs/MobileDocsShell.tsx), [`MobileDocsHub.tsx`](../frontend/src/components/mobile/MobileDocsHub.tsx) |
| Layout app (nav inferior) | [`frontend/src/App.tsx`](../frontend/src/App.tsx) |

## Decisiones de diseño

1. **`layoutVariant: 'desktop' | 'mobile'`**  
   Escritorio conserva el layout histórico (barra clara, área tipo página 816px, mismos menús). Móvil usa rama de UI dedicada.

2. **Tokens centralizados (`SHEET_THEME`)**  
   Cabeceras de columna/fila, rejilla y acento de celda activa coinciden con la miniatura SVG de `DocTypeThumbnail` (grises `#e8eaef` / `#b8bec8`, rejilla `#d1d5db`, verde `#217346`).

3. **Visor móvil editable**  
   Antes la hoja en lista+visor era `readOnly`. En `isMobile` pasa a editable con `ensureTableSizeWithHistory`, `setCellStyles`, deshacer/rehacer y contenedor sin `overflow-auto` duplicado (scroll solo en la rejilla).

4. **Barra de fórmulas y foco**  
   - `focusedCell`: celda seleccionada (sincroniza barra y datos).  
   - `inlineEditKey`: única celda con `<input>` editable en rejilla.  
   - `formulaBarFocused`: al editar en la barra se muestra valor crudo de la celda seleccionada sin perder la selección.  
   - Al pulsar otra celda se hace blur de los inputs de la barra para evitar inconsistencias.

5. **Selección por arrastre (touch)**  
   `pointerdown` / `pointerenter` en celdas; fin de gesto con `pointerup` / `pointercancel` global. Durante arrastre, `touch-action: none` solo en celdas (`dragSelectActive`), no en todo el contenedor.

6. **Formato móvil**  
   Menú “Formato” agrupa negrita/cursiva (vía `fontWeight` / `fontStyle` en `CellStyleDef`), colores y tipografía. Escritorio no añade botones nuevos para B/I; los estilos se aplican igual si existen en datos guardados.

7. **Pestaña “Hoja1”**  
   Solo visual (una hoja lógica). Multi-hoja en datos/API queda para fase 2.

## Origen de tokens de color

Definidos en [`sheetExcelTheme.ts`](../frontend/src/components/mobile/docs/sheetExcelTheme.ts) y reutilizados en la miniatura `DocTypeThumbnail` (SVG) para coherencia feed ↔ editor.

| Token | Uso |
|-------|-----|
| `headerBg` / `headerBorder` | Cabeceras A,B,C… y 1,2,3… |
| `gridBorder` | Líneas de celda |
| `activeCellBorder` / `activeCellBg` | Celda activa / selección suave |
| `toolbarBg` / `formulaBarBg` | Chrome oscuro móvil |
| `cellMinWidthMobile` / `cellMinHeightMobile` / `touchTargetMin` | Tamaños táctiles |

## Fase 2 (pendiente)

- Barra de herramientas **so el teclado** (`visualViewport`), atajos tipo “fórmulas / 123” (patrón similar a `WordLikeEditor` / panel PDF en `DocsPage`).
- **Multi-hoja** real en modelo de contenido y UI de pestañas.
- **Búsqueda** y **compartir** como acciones reales (hoy no duplican el header global de la app).
- Mejora de **doble toque** vs **arrastre** (reducir conflictos con scroll en celdas muy pequeñas).
- Pruebas E2E específicas de sheets en WebKit móvil.

## Checklist QA manual (móvil)

- [ ] Crear hoja desde “Crear”; se abre el visor y se puede **editar celdas** y **guardar**.
- [ ] Barra de fórmulas: al enfocar, el valor crudo de la celda seleccionada coincide; editar en barra actualiza la celda.
- [ ] Al cambiar de celda, la selección no se “pierde” de forma errática al usar la barra.
- [ ] Arrastre con dedo extiende rango de selección; scroll horizontal/vertical de la rejilla sigue usable cuando no hay arrastre.
- [ ] Cabeceras sticky visibles al desplazar.
- [ ] Pestaña inferior “Hoja1” no queda cortada por el safe area (iOS).
- [ ] Sin franja vacía inferior por doble scroll (visor sheet: contenedor padre sin overflow redundante).
- [ ] Deshacer / rehacer desde barra móvil (si aplica) y atajos teclado en dispositivo con teclado físico.

## Referencias

- Contexto móvil general: [`docs/IA_CONTEXT_MOBILE.md`](IA_CONTEXT_MOBILE.md)
- Prompt histórico del agente: [`docs/PROMPT_AGENT_SHEETS_EXCEL_IOS.md`](PROMPT_AGENT_SHEETS_EXCEL_IOS.md)
- Docs móvil (Word-like): [`docs/AUDITORIA_DOCS_MOVIL.md`](AUDITORIA_DOCS_MOVIL.md)
