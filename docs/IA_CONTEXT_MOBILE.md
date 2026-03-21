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

- Editor principal histórico: `ExcelLikeSheet` en `DocsPage` y componentes relacionados.
- **Pendiente de parity móvil/UI** con el nivel Docs + referencia **Excel iOS** (ver `docs/PROMPT_AGENT_SHEETS_EXCEL_IOS.md`).

## Reglas Cursor

- Reinicio de servidores: ver `.cursor/rules/restart-servers.mdc`.
