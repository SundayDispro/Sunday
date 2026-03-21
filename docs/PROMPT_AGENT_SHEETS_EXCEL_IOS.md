# Prompt para agente nuevo — Sheets Sunday (paridad con Docs + Excel iOS)

Copia el bloque siguiente en un chat nuevo con el agente.

---

Eres un agente de código en el repo **Sunday** (React + Vite + Tailwind). Ya se mejoró el **módulo Docs en móvil** (Word-like: `MobileDocsHub`, `MobileDocsShell`, `DocsHomeFeed`, `DocsCreateGallery`, miniaturas SVG en `DocTypeThumbnail`, ocultar `MobileBottomNav` en Docs, etc.). Lee `docs/IA_CONTEXT_MOBILE.md` y `docs/AUDITORIA_DOCS_MOVIL.md` para contexto.

## Objetivo

Llevar el **módulo Sheets / ExcelLikeSheet** al **mismo nivel de pulido móvil** que Docs, con referencia visual **Microsoft Excel en iOS** (capturas que el usuario proporcionó en el chat: barra superior oscura con título verde, iconos deshacer / formato / búsqueda / compartir / más; rejilla blanca con cabeceras **A, B, C…** y números de fila; **barra de fórmulas** oscura con `fx`, texto “Escribe aquí texto o fórmula”, chevron; **pestañas de hojas** abajo con hoja activa resaltada; teclado contextual / barra de herramientas sobre el teclado cuando aplica).

## Alcance técnico (orientativo)

1. **Auditar** `ExcelLikeSheet` y cualquier ruta móvil en `DocsPage` que abra hojas.
2. **UI móvil dedicada** o variantes responsive: chrome oscuro + grid claro, tipografía y espaciado similares a la referencia; **no** limitarse a escalar el layout de escritorio.
3. **Safe area** y **barra inferior**: si Sheets vive dentro de Docs móvil, coordinar con `MobileDocsShell` y con el `main` de `App.tsx` (mismos criterios que Docs: sin franjas muertas, sin recortar controles).
4. **Miniatura** de tipo `sheet` en `DocTypeThumbnail.tsx` ya tiene un SVG estilo Excel; alinear el **editor real** con esa estética (cabeceras, líneas finas, acento verde opcional coherente con la referencia).
5. **Fórmulas / edición de celda**: si hoy es mínimo, planificar barra tipo Excel (aunque sea fase 1 visual + placeholder de fórmula).
6. **Accesibilidad y touch**: targets ≥ 44px donde aplique; scroll horizontal de columnas usable con el pulgar.

## Restricciones

- Respuestas y comentarios de código en **español** si el usuario lo pide.
- Tras cambios en backend o bundle PDF, seguir reglas del repo (reinicio servidores, etc.).
- No romper flujos de escritorio existentes sin feature flag o breakpoints claros.

## Entregables

- Lista de archivos tocados + breve nota en `docs/AUDITORIA_DOCS_MOVIL.md` o nuevo `docs/AUDITORIA_SHEETS_MOVIL.md` con decisiones.
- Capturas o notas de qué quedó alineado con Excel iOS vs pendiente (fase 2).

## Referencia visual

Usa las **capturas adjuntas por el usuario** en la conversación (Excel iOS: fórmula `=SUMA`, teclado numérico, pestañas “materiales” / “ALUMINIO”, barra `fx`, etc.) como **fuente de verdad de UX**, no como assets a incrustar si hay licencia dudosa: **replica el patrón** (layout, jerarquía, colores aproximados) con CSS/Tailwind del proyecto.

---

Fin del prompt.
