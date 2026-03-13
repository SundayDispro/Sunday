# Columnas Docs y Excel: vista general y crear documento desde Excel

Usa este texto como instrucción en una **nueva ventana de chat con un nuevo agente** para implementar los cambios en las columnas de tipo "docs" y "excel" del tablero.

---

## Contexto

- En el tablero hay columnas de tipo **docs** (Documentos) y de tipo **excel** (Sheets/Excel).
- Al hacer clic en "Crear documento" desde una celda de la columna **docs** (por ejemplo, crear levantamiento, cotización o hoja de trabajo), se dispara el evento `sunday:create-doc-from-board` y la app abre la página de Documentos.
- Actualmente, al abrir Documentos por ese evento, se cambia la vista a la pestaña **"Documentos"** (lista de documentos). Se pide que en su lugar se abra en **Vista general**.
- Además, se pide añadir en la columna **excel** una opción para **crear un documento de tipo hoja (sheet)** que funcione igual: abrir Documentos en Vista general y crear/abrir ese documento.

## Objetivos

1. **Columnas docs – abrir en Vista general**  
   Cuando el usuario crea un documento desde una columna docs (levantamiento, cotización, hoja de trabajo), la página de Documentos debe abrirse en **Vista general** (pestaña "Vista general"), no en la pestaña "Documentos".

2. **Columnas excel – opción "Crear documento de Excel/hoja"**  
   En las celdas de columnas de tipo **excel** (Sheets), añadir una opción (por ejemplo, botón o enlace) **"Crear documento de Excel"** o **"Crear hoja"** que:
   - Dispare el mismo flujo que en docs: evento `sunday:create-doc-from-board` con tipo adecuado para una hoja (sheet).
   - Abra la página de Documentos en **Vista general** y cree o abra un documento de tipo hoja, igual que cuando se crea desde la columna docs.

## Detalles técnicos útiles

- **Evento desde el tablero:**  
  `window.dispatchEvent(new CustomEvent('sunday:create-doc-from-board', { detail: { type, boardId, itemId } }));`  
  El `type` puede ser `'text' | 'sheet' | 'cotizacion' | 'levantamiento' | 'hoja_trabajo'` (según `DocType` en la app).

- **App.tsx:**  
  - Estado `pendingDocFromBoard` con `type: 'cotizacion' | 'levantamiento' | 'hoja_trabajo' | 'text'`.  
  - Hay que incluir **`'sheet'`** en ese tipo para permitir "crear documento de Excel" desde la columna excel.  
  - El listener de `sunday:create-doc-from-board` pone `setPendingDocFromBoard(ev.detail)` y `setActivePage('docs')`.

- **DocsPage.tsx:**  
  - Recibe `initialCreateFromBoard` (tipo, boardId, itemId).  
  - En un `useEffect` que depende de `initialCreateFromBoard` se hace `setViewMode('docs')` y luego `handleCreate(type)`.  
  - Para cumplir el objetivo 1: **no** llamar a `setViewMode('docs')` (o usar `setViewMode('overview')`) para que al llegar desde el tablero se quede en **Vista general**.  
  - Asegurarse de que si `initialCreateFromBoard.type === 'sheet'` se cree/abra la hoja correctamente (igual que los otros tipos).

- **Columna docs:**  
  - `frontend/src/components/Board/DocsCellRenderer.tsx`: tiene `openDocs(type)` con `'levantamiento' | 'cotizacion' | 'hoja_trabajo'` y dispara el evento con ese `type`.  
  - No hace falta cambiar el tipo aquí para vista general; el cambio es solo en DocsPage (no cambiar a pestaña "Documentos").

- **Columna excel:**  
  - `frontend/src/components/Board/ExcelCellRenderer.tsx`: actualmente permite subir/ver archivos Excel.  
  - Añadir un botón/enlace tipo **"Crear documento de Excel"** o **"Crear hoja"** que dispare:  
    `window.dispatchEvent(new CustomEvent('sunday:create-doc-from-board', { detail: { type: 'sheet', boardId: column.boardId, itemId: item.id } }));`  
  - Así el flujo será el mismo que en docs (ir a Documentos en Vista general y crear/abrir la hoja).

- **Tipos en tipos/index.ts:**  
  - `DocType = 'text' | 'sheet' | 'cotizacion' | 'levantamiento' | 'hoja_trabajo'`.  
  - En App, extender el tipo de `pendingDocFromBoard.type` para que incluya `'sheet'`.

## Resumen de tareas

- [ ] En **DocsPage.tsx**: al tener `initialCreateFromBoard`, no cambiar a pestaña "Documentos"; dejar (o forzar) **Vista general** (`viewMode === 'overview'`).
- [ ] En **App.tsx**: extender el tipo de `pendingDocFromBoard` para que `type` incluya `'sheet'`.
- [ ] En **ExcelCellRenderer.tsx**: añadir opción "Crear documento de Excel" / "Crear hoja" que dispare `sunday:create-doc-from-board` con `type: 'sheet'`, `boardId` e `itemId`.
- [ ] Comprobar que, desde docs y desde excel, al crear documento se abre Documentos en Vista general y el documento se crea/abre correctamente (incluido tipo `sheet`).

---

**Cómo usarlo:** copia todo este contenido y pégalo en un nuevo chat con un agente para que implemente los cambios.
