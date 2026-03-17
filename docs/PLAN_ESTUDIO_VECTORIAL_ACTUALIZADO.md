# Plan actualizado: Página Estudio con motor lo más parecido a Illustrator

## Decisión de alcance

- **Ubicación:** Solo **página** "Estudio" / "Diseño" (no vista dentro del tablero).
- **Motor:** La opción **más potente posible** — lo más parecido a Illustrator que se pueda implementar.

---

## Motor recomendado: SVG-Edit integrado

**SVG-Edit** es un editor vectorial open source (MIT) para el navegador (+15 años de desarrollo). Incluye ya:

- **Herramienta pluma** y edición de paths (Bézier cúbico y cuadrático: M, L, C, Q, A, Z).
- **Capas** y orden z.
- **Formas** (rectángulo, elipse, línea, polígono, estrella).
- **Texto** con fuentes y estilos.
- **Imágenes** (insertar, escalar, recortar).
- **Gradientes** y rellenos.
- **Guías, reglas, alineación.**
- **Export** SVG y PNG (y en algunos builds PDF).
- Arquitectura: **svgcanvas** (motor) + **editor** (UI); se puede usar el editor completo o solo el canvas.

### Integración en Sunday

- **npm:** `svgedit` (oficial) o **svg-edit-react** (wrapper React). Se monta en un contenedor (iframe o div) dentro de la página "Estudio".
- **Persistencia:** Contenido en **SVG** (texto). Guardar/cargar en modelo `Design` (`content`/`contentJson` o `svgContent`). API envía/recibe SVG; al abrir un diseño se inyecta en SVG-Edit.
- **Esfuerzo:** Integrar editor en el layout de Sunday, selector de workspace, listado de diseños (nombre + miniatura desde SVG), CRUD en backend. No hay que construir herramientas de dibujo.

**Ventaja:** Es lo más parecido a Illustrator que se puede tener con el menor esfuerzo: editor completo y maduro.

### Alternativa más potente a largo plazo: Fabric.js + fabric-pen-tool + UI propia

- Fabric.js + fabric-pen-tool permiten pluma (Bézier), formas, texto, imágenes, serialización JSON, export SVG/PNG.
- Hay que construir: panel de capas, barra de herramientas, panel de propiedades, menús. Más desarrollo pero control total y UX 100% integrada con Sunday.

### Opción no práctica: Graphite

- Muy potente pero Rust/WebAssembly, sin API de embebido; no viable como "una página más" de Sunday.

---

## Persistencia (sin cambio)

- **Modelo `Design`:** `id`, `workspaceId`, `name`, `content` (string: SVG), `contentJson` (Json? si se quiere indexar), `thumbnailUrl?`, `boardId?`, `itemId?`, `createdAt`, `updatedAt`.
- Rutas: `GET/POST /api/workspaces/:workspaceId/designs`, `GET/PATCH /api/designs/:id` (auth existente).

---

## Fases de implementación (ajustadas a SVG-Edit)

**Fase 1 — Integración mínima**
- Añadir página "Estudio" en App.tsx (activePage, navegación, icono).
- DesignPage: listado de diseños del workspace + "Nuevo diseño".
- Modelo Prisma `Design` + migración + rutas REST.
- Integrar SVG-Edit (svgedit o svg-edit-react) en una ruta "Estudio": abrir editor vacío o cargar SVG al abrir diseño; guardar: leer SVG del editor y PATCH al backend.

**Fase 2 — UX y miniaturas**
- Miniatura: generar desde SVG (canvas offscreen o backend) y guardar en `Design.thumbnailUrl` o en storage.
- Selector de workspace coherente con Docs/Board.
- Ajustes de tema/layout para que el editor se vea integrado (título, botón volver, guardar).

**Fase 3 — Integración opcional**
- Vincular diseño a ítem o documento (`Design.itemId` / `docId`).
- Export desde el editor (SVG/PNG) y descarga desde Sunday.

---

## Resumen

1. **Solo página** "Estudio"/"Diseño".
2. **Motor más potente viable:** **SVG-Edit** integrado (pluma, capas, formas, texto, imágenes, gradientes, export).
3. **Persistencia:** Modelo **Design** con contenido SVG.
4. **Fases:** Integración mínima (listado + editor + CRUD) → miniaturas y UX → vinculación y export.
