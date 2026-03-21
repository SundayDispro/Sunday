# Contexto IA — Sunday (móvil Docs / Sheets)

Documento vivo para agentes: qué existe, decisiones recientes y enlaces a código.

## Stack

- **Frontend:** React, Vite, Tailwind, Radix, Framer Motion.
- **Backend:** Node (Express), Prisma, etc.
- **Docs móvil:** `MobileDocsHub` envuelve `DocsPage` con `mobileLayout`, `scrollListInParent`, `mobileWordShell`.

## Docs móvil (Word-like) — estado

| Área | Archivos clave |
|------|----------------|
| Hub contenedor | `frontend/src/components/mobile/MobileDocsHub.tsx` |
| Barra tabs inferior | `frontend/src/components/mobile/docs/MobileDocsShell.tsx` |
| Feed inicio | `frontend/src/components/mobile/docs/DocsHomeFeed.tsx` — pestañas: Recientes (10), Plantillas PDF, Texto y hojas |
| Galería crear | `frontend/src/components/mobile/docs/DocsCreateGallery.tsx` |
| Miniaturas | `frontend/src/components/mobile/docs/DocTypeThumbnail.tsx` — **SVG** (iOS/WebKit); texto/PDF con líneas + bloques; sheet estilo rejilla Excel |
| Layout app | `App.tsx` — `hideBottomNav` cuando `activePage === 'docs'`; sin `pb-[80px]` en `<main>` en Docs para no dejar franja vacía |

## Decisiones técnicas importantes

1. **No usar `div` vacío + `w-auto` + `aspect-ratio` solo** para previews: en Safari a veces colapsa. Preferir **SVG** con `viewBox` fijo.
2. **Previews “con contenido”:** hoja texto = líneas horizontales + margen; PDF = banda superior + líneas + bloques grises; sheet = cabeceras A–F, números de fila, rejilla, celda con borde verde tipo Excel.
3. **Barra global inferior:** oculta en Docs; Docs usa su propia shell. Padding inferior del `<main>` no debe reservar hueco para `MobileBottomNav` en Docs.
4. **WordLikeEditor / PDF / plantillas:** ver conversaciones previas en repo (`PdfTemplateEditor`, `DocumentPageForPdf`, `TextFormatBar`).

## Sheets (Excel-like)

- Editor: [`frontend/src/components/pages/docs/ExcelLikeSheet.tsx`](../frontend/src/components/pages/docs/ExcelLikeSheet.tsx) (importado por `DocsPage`).
- Tema / miniatura alineados: [`sheetExcelTheme.ts`](../frontend/src/components/mobile/docs/sheetExcelTheme.ts), [`DocTypeThumbnail.tsx`](../frontend/src/components/mobile/docs/DocTypeThumbnail.tsx).
- Móvil: `layoutVariant="mobile"` (chrome oscuro, barra de fórmulas, rejilla sticky, pestaña «Hoja1»); visor lista+móvil con hoja **editable** e historial como escritorio.
- Auditoría y pendientes fase 2: [`docs/AUDITORIA_SHEETS_MOVIL.md`](AUDITORIA_SHEETS_MOVIL.md). Prompt de referencia UX: [`docs/PROMPT_AGENT_SHEETS_EXCEL_IOS.md`](PROMPT_AGENT_SHEETS_EXCEL_IOS.md).

## Inicio móvil (landscape)

- **`MobileHomePage`**: en horizontal, dos columnas — banner con gradiente a la **izquierda a todo el alto** (sin `rounded-br` que dejaba ver `monday-bg` abajo) y **Acciones rápidas** en rejilla 2×2 a la derecha.
- **Shell `App.tsx`**: `mobileLandscapeChrome` (`isMobile && isLandscape`) oculta `MobileBottomNav`, quita `pb` del `<main>` y `pl`/`pr` del root para ancho útil; en **Inicio** horizontal el icono izquierdo del header abre el **menú** (drawer).
- **Calendario** horizontal inmersivo: ver lógica previa (`calendarImmersiveLandscape`, botón atrás flotante).

## Plantillas PDF / posiciones y Git

- Las cajas de **texto del master** y estilos viven en **Postgres** (`TemplateConfig`: `customBoxesJson`, `fieldPositionsJson`, `defaultContentJson`). **No** se versionan solas al hacer commit del código.
- Para que un entorno nuevo reproduzca tu diseño: **exportar** esos JSON (admin/API) y añadirlos al **seed** o a un **script/migración de datos**; o documentar `PUT /api/templates/:docType/config`.
- Los **PDF generados** y el layout de **imágenes por documento** están en el contenido del doc / `pdfImageBoxes` — tampoco van al repo salvo backup explícito.
- **Commit recomendado:** `frontend/src/**`, `backend/src/**`, `prisma/schema.prisma` + **migrations**; evitar subir `**/dist/**` y `tsc-errors.txt` (generar build en CI o local).

## Reglas Cursor

- Reinicio de servidores: ver `.cursor/rules/restart-servers.mdc`.
