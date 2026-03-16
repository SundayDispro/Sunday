# AI Context Manifest — Sunday

Documento para migrar el proyecto a otro entorno de desarrollo agentic. Resume el contexto invisible que un agente ha aprendido del codebase: arquitectura, stack, convenciones, estado actual, decisiones no obvias y próximos pasos.

---

## 1. Arquitectura Core: Cómo se conectan front y back

- **Estructura**: Dos aplicaciones en la misma raíz: `frontend/` (Vite + React) y `backend/` (Express + Socket.IO). No hay monorepo con workspaces; cada una tiene su propio `package.json` y se ejecutan por separado.

- **Comunicación HTTP**:
  - En desarrollo el frontend se sirve en `localhost:5173` (Vite). Todas las llamadas API usan **rutas relativas** (`/api/...`, `/uploads/...`).
  - **Vite proxy** (`vite.config.ts`) redirige `/api`, `/uploads` y `/socket.io` a `http://localhost:3001`. Así, `API_BASE` en el front puede ser **cadena vacía** y todo va al mismo origen desde el punto de vista del navegador.
  - Esto permite usar la app desde el móvil en la red local (`192.168.x.x:5173`) sin CORS: el proxy sigue siendo el mismo origen.
  - Si existe `VITE_API_URL`, el frontend usa esa URL como base (producción o backend en otra máquina). El cliente Socket.IO también usa esa URL cuando está definida (`frontend/src/store/socket.ts`).

- **Autenticación**: No hay JWT ni cookies de sesión. El login (`POST /api/login`) devuelve el objeto usuario (sin password); el frontend lo guarda en **localStorage** bajo la clave `sunday_user`. Las rutas que requieren identificación reciben `userId` o `adminId` en **body** o **query** (no en headers). El backend no valida un token en cada request; confía en que el cliente envía el id correcto.

- **Tiempo real**: **Socket.IO** (servidor en el mismo `httpServer` que Express). El frontend importa `socket` desde `store/socket.ts` y suscribe listeners (`item_added`, `column_value_updated`, `board_renamed`, etc.). Las mutaciones se hacen por socket o por REST; el backend emite eventos `io.emit(...)` para que todos los clientes actualicen estado local. No hay sala por board: todos reciben todos los eventos.

- **Subida de archivos**: `POST /api/upload` (multipart, campo `file`). Respuesta: `{ url: '/uploads/nombre.jpg' }`. Los archivos se sirven estáticos en `/uploads` desde la carpeta `backend/uploads`.

- **PDF**: La generación de PDF (cotización, levantamiento, hoja de trabajo) usa **Puppeteer** en el backend. El HTML se construye para que sea idéntico a la previsualización del editor (WYSIWYG). Existe un bundle construido con **esbuild** desde el frontend (`renderDocumentToHtml.tsx` → `DocumentPageForPdf`) que el backend puede usar para renderizar React a HTML estático; el script `build:document-view` genera `backend/dist/documentViewBundle.cjs`.

---

## 2. Stack Tecnológico: Versiones y librerías críticas

### Backend (`backend/package.json`)

| Dependencia      | Versión  | Uso principal                          |
|------------------|----------|----------------------------------------|
| express          | ^5.2.1   | Servidor HTTP y rutas REST             |
| socket.io        | ^4.8.3   | Tiempo real (items, columnas, etc.)   |
| @prisma/client   | ^5.21.1  | ORM, SQLite                            |
| prisma           | ^5.21.1  | CLI, migraciones, seed                 |
| multer           | ^2.1.1   | Upload de archivos                     |
| pdf-lib          | ^1.17.1  | Manipulación PDF (plantillas)          |
| puppeteer        | ^24.39.0 | Generación PDF desde HTML              |
| web-push         | ^3.6.7   | Notificaciones push (VAPID)            |
| cors             | ^2.8.6   | CORS (ALLOWED_ORIGINS)                 |
| ts-node          | ^10.9.2  | Ejecutar TS en dev (--transpile-only)  |
| typescript       | ^5.9.3   |                                        |
| dotenv           | ^17.3.1  | Variables de entorno                   |
| esbuild          | ^0.24.0  | Build del bundle document view         |

- **Base de datos**: SQLite. `DATABASE_URL="file:./dev.db"` (Prisma en `backend/prisma/`). No hay PostgreSQL/MySQL en el setup por defecto.

### Frontend (`frontend/package.json`)

| Dependencia           | Versión   | Uso principal                              |
|-----------------------|-----------|--------------------------------------------|
| react                 | ^19.2.4   |                                            |
| react-dom             | ^19.2.4   |                                            |
| vite                  | ^7.3.1    | Build y dev server + proxy                |
| @vitejs/plugin-react  | ^5.1.4    |                                            |
| typescript            | ^5.9.3    |                                            |
| tailwindcss           | ^3.4.19   | Estilos; tema con variables CSS           |
| framer-motion         | ^12.36.0  | Animaciones y AnimatePresence              |
| @dnd-kit/core         | ^6.3.1    | Drag and drop (tablero, grupos, ítems)     |
| @dnd-kit/sortable     | ^10.0.0   | Listas ordenables                         |
| @radix-ui/react-dialog| ^1.1.15   | Modales                                   |
| @radix-ui/react-popover | ^1.1.15 | Menús y popovers                          |
| @tanstack/react-table | ^8.21.3   | Tabla de la vista tabla del board         |
| socket.io-client      | ^4.8.3    | Mismo major que el servidor               |
| lucide-react          | ^0.577.0  | Iconos                                    |
| simplebar-react       | ^3.2.6    | Scrollbars custom (cross-browser)          |
| pdfjs-dist            | ^4.8.69   | Visualización de PDF en el cliente         |
| xlsx                  | ^0.18.5   | Import/export Excel en hojas              |
| clsx                  | ^2.1.1    | Clases condicionales (si se usa)          |
| tailwind-merge        | ^3.5.0    | Merge de clases Tailwind (si se usa)      |

- **Entorno**: `"type": "module"` en frontend. Variables de entorno con prefijo `VITE_` (p. ej. `VITE_API_URL`).

### Infra y herramientas

- **Node**: Implícito; ts-node y Vite asumen un Node reciente.
- **Windows**: El proyecto se ha desarrollado en Windows; la regla de Cursor pide usar `;` en PowerShell para encadenar comandos (no `&&`). Backend en puerto **3001**, frontend en **5173** (o 5174 si está ocupado).

---

## 3. Convenciones de Código

### Nombrado y estructura

- **TypeScript**: camelCase para variables y funciones; PascalCase para componentes e interfaces/types. Tipos centralizados en `frontend/src/types/index.ts` (Board, Group, Item, BoardColumn, ColumnValue, User, Doc, Update, Notification, etc.).
- **Componentes**: Carpetas por dominio: `components/Board/` (tablero y vistas), `components/pages/` (páginas de la app), `components/pages/docs/` (documentos y formularios PDF). Nombres de archivo en PascalCase cuando son componentes (e.g. `BoardContainer.tsx`, `ItemDetailsPanel.tsx`).
- **Hooks**: Prefijo `use` (e.g. `useUser`, `useToast`, `useHideOnScroll`). Definidos en `store/` (contextos) o `hooks/`.
- **API y store**: Un solo módulo de API en `api.ts` (API_BASE, parseResponse). Socket en `store/socket.ts` (singleton). Estado de usuario en `store/UserContext.tsx`; toasts en `components/Toast.tsx` (ToastProvider + useToast).

### Estilos (Tailwind + CSS)

- **Prefijo semántico "monday"**: Inspiración en Monday.com. Colores y sombras vía variables CSS (`--monday-bg`, `--monday-text`, `--monday-border`, etc.) y clases Tailwind extendidas: `monday-bg`, `monday-text`, `rounded-monday`, `shadow-monday-lg`, `border-monday-border`, etc. Definidos en `tailwind.config.js` y `index.css`.
- **Temas**: Tres modos en `data-theme`: `light`, `dark`, `night`. Las variables se redefinen por tema en `:root` y `[data-theme="dark"]`, `[data-theme="night"]`. La clave de persistencia es `sunday-theme`.
- **Animaciones**: Duración y easing unificados en variables (`--monday-duration`, `--monday-ease`) y keyframes en Tailwind (`fade-in-up`, `scale-in`). Framer Motion para transiciones de pantalla y listas (AnimatePresence).
- **Scrollbars**: SimpleBar para comportamiento consistente entre navegadores; estilos en `index.css` para que la barra sea visible y usable con cualquier rol/tema.

### Estado y datos

- **Sin Redux**: Estado global vía React Context (User, Toast). El resto es estado local (useState) en App y en contenedores (BoardContainer, DocsPage, etc.).
- **Socket**: Los componentes que necesitan datos en tiempo real (p. ej. board) hacen `useEffect` con `socket.on('evento', handler)` y actualizan estado (setBoard, etc.). El handler suele aplicar el cambio al estado local (añadir/actualizar/eliminar ítem, columna, grupo) sin refetch completo.
- **Llamadas HTTP**: Siempre con `fetch` y el helper `parseResponse` de `api.ts`. parseResponse no llama a `.json()` en respuestas vacías (204) y en errores comprueba Content-Type para no parsear HTML como JSON (evita "Unexpected token '<'").
- **Rutas de la app**: No hay React Router. La “ruta” es estado en App: `activePage` ('home' | 'board' | 'inbox' | 'notifications' | 'search' | 'docs' | 'team' | 'facturacion' | 'miTrabajo' | 'calendar') y, para board, `activeBoardId`. La navegación se hace con setState y, en móvil, con BottomNav.

### Patrones repetidos

- **Vistas del tablero**: `viewMode` en BoardContainer puede ser 'table' | 'kanban' | 'calendar' | 'facturacion' | 'resumen' | 'archivos' | 'miTrabajo' | 'timeline'. Cada vista es un componente (KanbanView, CalendarView, FacturacionBoardView, etc.). La vista por defecto y las pestañas habilitadas se persisten en `localStorage` bajo `sunday-views`.
- **Cell renderers**: Por tipo de columna (StatusCellRenderer, DateCellRenderer, PersonCellRenderer, DocsCellRenderer, FileCellRenderer, ExcelCellRenderer, etc.) para pintar y editar valores en la tabla.
- **Feedback**: useToast() y `toast(text, 'info' | 'success' | 'error')` para mensajes breves; no hay sistema de notificaciones in-app persistente más allá del panel de notificaciones.
- **Roles**: User.role es 'ADMIN' | 'VENTAS' | 'DISENO' | 'TALLER' | 'USER'. La UI condiciona por rol (p. ej. TALLER solo tabla y calendario; Facturación solo ADMIN/VENTAS; adminId en body para crear/editar usuarios).

---

## 4. Estado Actual: Qué está al 100% y qué a medias

### Funcionalidades consolidadas (al 100%)

- Login/logout, persistencia de usuario en localStorage, cambio de estado (available/busy/offline).
- CRUD workspaces y boards (REST y/o socket); selector de workspace y de board en sidebar.
- Grupos e ítems: crear, renombrar, mover, eliminar; drag & drop (grupos e ítems) vía @dnd-kit; orden de columnas (reorder) por API.
- Columnas dinámicas: tipos status, date, person, text, number, timeline, file, contact, excel, docs, billing_docs, folio; valores guardados en ColumnValue (JSON donde aplica).
- Sincronización en tiempo real vía Socket.IO para ítems, columnas, grupos y updates.
- Documentos: textos y hojas (sheet); listado por workspace/board; editor y guardado de content (JSON).
- Documentos tipo PDF: cotización, levantamiento, hoja de trabajo; formularios, editor de plantilla (posiciones, fuentes), generación PDF en backend (Puppeteer + plantilla).
- Panel de notas (panel-notes) por workspace y por usuario (ownerId); doc-groups (grupos personalizados y asignaciones por usuario).
- Bandeja/feed con publicaciones y @mentions; notificaciones in-app y Web Push (VAPID); marcar leídas.
- Calendario: eventos solo de calendario (CalendarEvent), no ligados a ítems; CRUD por API y socket.
- Búsqueda global de ítems en todos los tableros.
- Exportación a carpetas: “Exportar carpetas” copia archivos de ítems asignados al usuario a `~/SundayExports` (estructura año-mes / cliente / ítem).
- Vistas por rol: TALLER restringido a tabla y calendario; Facturación visible solo para ADMIN y VENTAS.
- Temas light/dark/night; layout móvil (BottomNav, drawer “Más”), hide-on-scroll del header en vista de tablero móvil, FAB para “Nuevo elemento”.
- Subida de archivos (JPG, PDF, Excel) y enlace a columnas tipo file/docs/excel; eliminación de docs y limpieza de referencias en ColumnValue.
- Configuración de plantilla PDF global por tipo (TemplateConfig en BD); endpoint PUT acepta userId para identificación pero el upsert es por docType (una config global por tipo).

### A medias o con matices

- **Vistas "Archivos" y "Mi trabajo"**: Existen `ArchivosBoardView` y `MiTrabajoPage` (Mi trabajo filtra ítems asignados al usuario; Archivos lista docs/archivos del board). Pero en App están en `DISABLED_VIEWS`: no se pueden añadir como pestañas desde “Añadir vista”. La navegación a “Mi trabajo” existe en el menú/móvil y funciona; lo que falta es poder activar la pestaña “Archivos”/“Mi trabajo” en el selector de vistas del tablero.
- **Modelo Update y User**: En Prisma, Update tiene `authorId` como string sin relación formal con User. El backend enriquece los updates con autor haciendo un fetch manual de usuarios por authorId; sería más limpio una relación Update → User y usar include.
- **Autenticación**: Contraseñas en texto plano (comentado en código como “demo”); en producción se debería usar bcrypt y, si se quiere, JWT o sesiones.
- **Sync profiles (backend)**: Existe `ROLE_SYNC_PROFILES` (qué roles sincronizan docs, excel, archivos). Se usa para documentar/comportamiento por rol; no está claro si toda la lógica de “ocultar Excel/archivos por rol” en el front está alineada al 100% con estos perfiles.
- **Timeline**: Existe `TimelineBoardView`; la vista timeline está en el tipo ViewMode y se puede añadir. No está marcada como a medias en el código, pero puede tener menos pulido que tabla/kanban/calendario.

---

## 5. Secretos del Proyecto (decisiones no obvias leyendo solo el código)

- **useHideOnScroll**: El elemento que hace scroll es un contenedor (ref), no `window`. Pensado para móvil: el scroll ocurre dentro de un div con overflow; el hook recibe ese elemento y umbrales para ocultar/mostrar la barra (p. ej. header del tablero). Así se evita depender del scroll de la ventana.
- **parseResponse**: No usa `res.json()` directamente. Lee el cuerpo como texto, comprueba 204/vacío y Content-Type; si no es JSON en error, lanza con el texto para no romper con respuestas HTML de error (evita "Unexpected token '<'").
- **API_BASE vacío en dev**: Deliberado para que todas las peticiones vayan al mismo origen y el proxy de Vite funcione tanto en localhost como en IP de la LAN (móvil).
- **Estado Taller → Facturación**: Cuando una columna de tipo status titulada “Estado Taller” se actualiza al valor con optionId `'colocado'`, el backend crea automáticamente la columna “Estado Facturación” si no existe (con opciones pendiente_factura, facturado, cobrado) y asigna el valor “pendiente_factura” al ítem. Es una regla de negocio embebida en el handler de `update_column_value`.
- **ColumnValue.value**: Siempre string. Para columnas status/priority el valor es JSON string (e.g. `{"optionId":"colocado"}`). Para person puede ser un JSON array de userIds. Los cell renderers parsean y escriben ese string.
- **Favicon**: No hay favicon.ico en public; Vite `configureServer` intercepta `/favicon.ico` y sirve `public/favicon.svg` con Content-Type correcto para evitar 404.
- **PDF WYSIWYG**: El PDF generado en el servidor se basa en el mismo HTML/CSS que la previsualización del editor (DocumentPageForPdf); así el resultado es idéntico a lo que ve el usuario.
- **Passwords**: Código indica comparación en claro “para demo”; en producción se debe hashear (bcrypt) y no almacenar en claro.
- **Panel notes y doc-groups**: Se guardan como JSON en campos del Workspace (panelNotes, docGroups). Por usuario se filtra en backend (panelNotes por ownerId; docGroups por clave userId en el objeto). No hay tablas separadas para “notas” o “grupos de docs”.
- **Regla Cursor “restart-servers”**: En Windows PowerShell se usa `;` para encadenar comandos. Tras cambios en backend, env o Vite, se deben reiniciar los servidores; los puertos 3001 (backend) y 5173/5174 (frontend) pueden necesitar liberarse antes.

---

## 6. Próximos Pasos (lo siguiente a programar en modo auto)

Inferido del estado del código y de lo que queda a medias:

1. **Habilitar vistas Archivos y Mi trabajo en el selector**: Quitar `archivos` y `miTrabajo` de `DISABLED_VIEWS` en App (o exponerlas en la UI de “Añadir vista”) para que el usuario pueda añadirlas como pestañas del tablero junto a tabla, kanban, calendario, etc.
2. **Prisma: relación Update → User**: Añadir en schema la relación de Update con User por authorId y usar `include: { author: true }` en las queries de updates; eliminar el fetch manual de usuarios en `GET /api/items/:itemId/updates` y en el evento socket de updates.
3. **Autenticación de producción**: Introducir bcrypt para contraseñas y, opcionalmente, JWT o sesiones con validación en middleware en las rutas que requieran usuario/admin.
4. **Tests**: Aún no hay tests (backend y frontend); añadir al menos tests de integración o unitarios para rutas críticas y lógica de negocio (p. ej. link-doc, update_column_value con regla “colocado”, export folders).
5. **Timeline y Archivos**: Revisar que la vista Timeline y la vista Archivos estén completas a nivel UX y edge cases (permisos, vacíos, etc.).
6. **PWA**: El service worker se registra (`/sw.js`); push está implementado. Completar manifest y comportamiento offline si se quiere PWA instalable.
7. **Documentación**: Un README en la raíz con requisitos (Node, SQLite), variables de entorno (`.env.example` ya existe en backend), y pasos para `npm install` + `prisma migrate`/`db push` + `npm run dev` en backend y frontend.

---

## Referencia rápida de archivos clave

| Área            | Archivos |
|-----------------|----------|
| Entrada backend | `backend/src/index.ts` |
| Entrada frontend| `frontend/src/main.tsx`, `frontend/src/App.tsx` |
| Schema BD       | `backend/prisma/schema.prisma` |
| API cliente     | `frontend/src/api.ts` |
| Socket cliente  | `frontend/src/store/socket.ts` |
| Usuario / Auth  | `frontend/src/store/UserContext.tsx` |
| Tipos           | `frontend/src/types/index.ts` |
| Tablero         | `frontend/src/components/Board/BoardContainer.tsx` |
| Docs / PDF      | `frontend/src/components/pages/DocsPage.tsx`, `docs/docTypes.ts`, `docs/PdfTemplateEditor.tsx` |
| Proxy / build   | `frontend/vite.config.ts` |
| Estilos / tema  | `frontend/src/index.css`, `frontend/tailwind.config.js` |
| PDF backend     | `backend/src/templatePdfGenerator.ts`, `backend/src/htmlPdfGenerator.ts` |
| Regla Cursor    | `.cursor/rules/restart-servers.mdc` |

---

*Generado para migración a otro entorno de desarrollo agentic. Actualizar este documento cuando cambien decisiones de arquitectura, stack o convenciones.*
