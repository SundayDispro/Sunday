## Sunday — Auditoría Técnica Integral y Especificación de Arquitectura

### 0. Contexto histórico y estado actual

#### 0.1 Evolución por fases

- **Fase 0 — Prototipo inicial**  
  - Persistencia en **SQLite** con modelo centrado en strings JSON (por ejemplo, `content`, `panelNotes`, `docGroups`).  
  - Autenticación básica con IDs en el body de las peticiones.  
  - Sockets con emisiones globales (`io.emit`) sin segmentación por tablero ni por usuario.

- **Fase 1 — Infraestructura de datos (PostgreSQL + Campos Sombra)**  
  - Migración del datasource de Prisma a **PostgreSQL** manteniendo IDs `String @id @default(uuid())`.  
  - Introducción de la arquitectura de **Campos Sombra JSONB** (`panelNotesJson`, `settingsJson`, `contentJson`, `fieldPositionsJson`, `customBoxesJson`, `mentionedUserIdsJson`, etc.) para convivir con el modelo legacy basado en strings JSON.  
  - Ajuste de índices compuestos en `Notification`, `FeedPost` y `CalendarEvent` para soportar escenarios de producción (bandeja de notificaciones, feed cronológico, calendario por tablero).

- **Fase 2 — Seguridad Enterprise (bcrypt + JWT + middleware)**  
  - Sustitución de la identidad en body por **JWT** en header `Authorization: Bearer`.  
  - Implementación de hashing de contraseñas con **bcrypt** (12 rondas actualmente, alineado con el objetivo de endurecimiento) y almacenamiento seguro en Postgres.  
  - Creación de middlewares de Express `attachUserFromJwt`, `authenticateToken`, `requireAuth`, `requireAdmin` que centralizan la matriz de acceso.  
  - Adaptación del frontend para gestionar el ciclo de vida del token (login/logout, refresco de sesión ante 401/403).  
  - Usuario `ADMIN` inicializado y verificado en Postgres como cuenta de referencia.

- **Fase 2.5 — Productización de tiempo real y experiencia de usuario**  
  - Refactor del motor de sockets: paso progresivo de `io.emit` global a **rooms por tablero** (`board:<boardId>`).  
  - Mejora de la UI de tableros tipo Monday.com (vistas `table`, `kanban`, `calendar`, `facturacion`, `resumen`, `timeline`).  
  - Implementación del generador de PDF WYSIWYG compartiendo el árbol de componentes React (`renderDocumentToHtml.tsx` → bundle CJS).  
  - Introducción de Web Push (`PushSubscription`, `sendWebPushToUser`) ligado a reglas de negocio (asignaciones, comentarios).

- **Estado a marzo 2026 (según manifiesto)**  
  - **Tableros en tiempo real**: 100% funcionales, pendiente seguir refinando rooms por usuario.  
  - **Editor/PDF**: ~90% (persisten ajustes finos de box-model).  
  - **Seguridad JWT**: middleware y manejo en frontend implementados; pendiente endurecer algunos valores por defecto (`JWT_SECRET`, rondas bcrypt).  
  - **PostgreSQL**: esquema y campos sombra en producción, con migración lógica desde strings; continúan tareas de eliminación de código puramente legacy.  
  - **Modo móvil/PWA**: ~80%, con UX optimizada pero pendiente pulir modo offline.

#### 0.1.1 Línea de tiempo detallada (vista histórica)

> Las fechas son aproximadas y sirven como referencia para entender el orden de los hitos técnicos.

```text
Q1 2024  ─── Prototipo inicial
          - React + Vite + SQLite.
          - Modelo de datos basado en strings JSON (tableros, docs, panelNotes).
          - Autenticación simple por IDs en body.
          - Socket.IO con io.emit global para la mayoría de eventos.

Q2 2024  ─── Consolidación de tableros
          - Refuerzo del modelo de Board/Group/Item en el backend.
          - Aparición del panel de Docs y panelNotes por usuario.
          - Exportación de carpetas inicial basada en sistema de archivos local.

Q3 2024  ─── Migración a PostgreSQL (Fase 1)
          - Cambio de datasource de Prisma: SQLite → PostgreSQL.
          - Introducción de campos sombra JSONB:
              * Workspace: panelNotesJson, docGroupsJson.
              * BoardColumn / ColumnValue: settingsJson, valueJson.
              * Doc: contentJson.
              * TemplateConfig: fieldPositionsJson, customBoxesJson.
              * FeedPost: mentionedUserIdsJson.
          - Creación/ajuste de índices:
              * Notification: (userId, read, createdAt DESC), (itemId, createdAt).
              * FeedPost: (createdAt DESC), (authorId, createdAt DESC).
          - Primeras migraciones Prisma coherentes con IDs existentes.

Q4 2024  ─── Motor de sockets y reglas de negocio
          - Refactor de eventos de tablero (add/move/delete item, columnas, grupos).
          - Introducción de rooms por tablero: board:<boardId>.
          - Implementación de la regla de negocio Taller → Facturación:
              * Cambio en "Estado Taller" a "colocado" → creación/uso de
                la columna "Estado Facturación" y valor "Pendiente de facturar".
          - Integración de notificaciones ligadas a columnas tipo "person".

Q1 2025  ─── Seguridad Enterprise (Fase 2)
          - Incorporación de bcrypt para hashing de contraseñas.
          - Introducción de JWT:
              * signJwt / verifyJwt en backend.
              * attachUserFromJwt, authenticateToken, requireAuth, requireAdmin.
          - Adaptación del frontend:
              * apiFetch centralizado con envío de Bearer token.
              * Logout automático en 401/403.
          - Creación del usuario ADMIN de referencia; en la fase actual el usuario inicial `ADMIN` se genera vía script de seed (`prisma/seed.ts`) con contraseña `root` hasheada con bcrypt (12 rondas) únicamente para entornos de desarrollo/LAN.

Q2 2025  ─── Generador de PDF WYSIWYG y TemplateConfig
          - Creación de renderDocumentToHtml.tsx y pipeline esbuild → CJS.
          - Introducción del modelo TemplateConfig para centralizar posiciones
            y estilos de textos en PDFs.
          - Primeras plantillas PDF para cotización/levantamiento/hoja de trabajo.
          - Detección del problema de box-model (textarea vs div) y definición
            del plan de migración a contentEditable.

Q3 2025  ─── Web Push, PWA y refinamiento móvil
          - Modelo PushSubscription ligado a User.
          - Helper sendWebPushToUser y flujos:
              * Asignaciones a persona → Web Push "Te asignaron un elemento".
              * Comentarios en elementos asignados → Web Push de resumen.
          - Trabajo sobre modo móvil:
              * Bottom navigation.
              * Detección responsive avanzada (matchMedia, ResizeObserver).
              * Ajustes de UX para pantallas pequeñas.

Q4 2025–Q1 2026 ─── Endurecimiento general y preparación Fases 3–5
          - Revisión de includes/selects en Prisma para reducir sobre-fetching.
          - Limpieza progresiva de código legacy basado solo en strings JSON.
          - Preparación de rooms adicionales (user:<userId>) aún por activar.
          - Redacción y consolidación de esta auditoría técnica como
            fuente de verdad arquitectónica principal del proyecto.
```

#### 0.2 Alcance de esta auditoría

Esta auditoría cubre **todo el programa Sunday** desde el punto de vista técnico:

- Infraestructura de red y despliegue (LAN/VPN/móvil, proxy de Vite, Socket.IO).  
- Persistencia completa (Prisma + PostgreSQL, coexistencia Legacy/JSONB, índices críticos).  
- Seguridad y autenticación extremo a extremo (bcrypt, JWT, middleware, flujos frontend-backend).  
- Funcionalidades core (motor de sockets, reglas de negocio de Taller→Facturación, exportación de carpetas, Web Push, motor de PDF).  
- Estructura y organización de código en backend y frontend, incluyendo el estado actual de modularización.  
- Hoja de ruta de ingeniería para las siguientes fases (optimización de sockets, endurecimiento de consultas Prisma, hardening de seguridad y del event loop).

Con este contexto histórico, las secciones siguientes descienden al detalle de cada capa del sistema.

#### 0.3 Diagrama de arquitectura de alto nivel

```text
flowchart LR
  subgraph Clients["Clientes (LAN / VPN / Móvil)"]
    PC1["PC Oficina 1 (React/Vite)"]
    PC2["PC Oficina 2 (React/Vite)"]
    VPN_PC["PC Remoto VPN (React/Vite)"]
    Mobile["Móvil/Tablet (React PWA)"]
  end

  subgraph Frontend["Frontend (Vite + React 19)"]
    ViteDev["Vite Dev Server :5173\nProxy /api, /uploads, /socket.io"]
    App["App.tsx\n(activePage, vistas, tema, apiFetch)"]
    SocketClient["store/socket.ts\nSocket.IO Client singleton"]
  end

  subgraph Backend["Backend (Node.js + Express 5)"]
    ExpressAPI["Express API\n/auth, /api/workspaces, /api/boards, /docs..."]
    AuthMW["auth.ts\nattachUserFromJwt,\nauthenticateToken,\nrequireAuth,\nrequireAdmin"]
    SocketServer["Socket.IO Server\nrooms: board:<id>, user:<id>*"]
    PDFEngine["Motor PDF\nrenderDocumentToHtml.tsx + esbuild + Puppeteer/pdf-lib"]
    WebPush["Web Push\nsendWebPushToUser"]
  end

  subgraph DB["Persistencia (PostgreSQL + Prisma)"]
    Prisma["Prisma Client\nschema.prisma"]
    Models["Modelos:\nUser, Workspace, Board,\nGroup, Item, BoardColumn,\nColumnValue, Update,\nNotification, FeedPost,\nDoc, Design, TemplateConfig,\nPushSubscription"]
  end

  subgraph Storage["Sistema de archivos"]
    Uploads["/uploads\n(JPG, PDF, XLSX/XLS)"]
    Exports["~/SundayExports\nExportación de carpetas"]
    Templates["Plantillas PDF\n(assets base)"]
  end

  Clients -->|HTTP(S) + WebSocket| ViteDev
  ViteDev -->|Proxy /api, /uploads, /socket.io| ExpressAPI
  ViteDev -->|Proxy WebSocket /socket.io| SocketServer
  App <-->|Socket.IO| SocketClient
  App -->|apiFetch + JWT Bearer| ExpressAPI

  ExpressAPI --> AuthMW
  AuthMW --> Prisma
  SocketServer --> Prisma
  PDFEngine --> Prisma
  WebPush --> Prisma

  ExpressAPI --> PDFEngine
  ExpressAPI --> Uploads
  ExpressAPI --> Exports
  PDFEngine --> Templates

  Prisma --> DB
```

> Nota: los rooms `user:<id>` están marcados con `*` porque forman parte de la hoja de ruta (Fase 3) y aún no se usan en todos los flujos.

### 1. Arquitectura de Red y Topología de Despliegue

#### 1.1 Topología híbrida (LAN / VPN / Mobile)

- **Servidor central**:  
  - Node.js + Express 5, ejecutándose en un PC de oficina, escuchando en el puerto `3001`.  
  - Proceso principal HTTP+WebSocket creado mediante `createServer(app)` y compartido con Socket.IO.
- **Clientes LAN**:  
  - ~6 PCs conectados en la red local, accediendo al frontend vía `http://192.168.x.x:5173`.  
  - El servidor de desarrollo/producción del frontend es Vite, que actúa como reverse proxy hacia el backend.
- **Clientes remotos**:  
  - 1 PC conectado por VPN (accede al mismo host interno pero con mayor latencia y jitter).  
  - Múltiples dispositivos móviles (teléfonos/tabletas) que acceden al frontend mediante el mismo host (`192.168.x.x:5173` o dominio equivalente) y se conectan al backend vía proxy o `VITE_API_URL`.

Esta configuración define una **topología estrella** con un único backend central y clientes delgados (React) que consumen API REST, WebSockets y recursos estáticos.

##### 1.1.1 Fase inicial de acceso externo: Cloudflare Tunnel (modo gratuito)

- **Objetivo de la fase inicial**:  
  - Permitir acceso remoto (móviles fuera de la LAN, PCs en otras redes) sin contratar todavía dominio propio ni VPS.  
  - Mantener el backend y el frontend ejecutándose en un PC servidor de oficina prácticamente siempre encendido.
- **Mecanismo elegido**:  
  - Uso de **Cloudflare Tunnel en modo quick tunnel gratuito** (`cloudflared tunnel --url http://localhost:51xx`) para exponer el servidor de Vite (que a su vez proxya `/api`, `/uploads` y `/socket.io` al backend en `3001`).  
  - El acceso externo se realiza a través de URLs temporales del tipo `https://<nombre>.trycloudflare.com`, que se regeneran al reiniciar el comando.
- **Implicaciones y límites**:  
  - Adecuado para **pruebas, pilotos y primeras fases** de adopción de Sunday (equipo reducido, uso controlado).  
  - No hay garantía de uptime ni de estabilidad de URL: es una solución explícitamente **no definitiva** para producción.  
  - La seguridad de aplicación (JWT, CORS endurecido, Socket.IO con origen controlado) permanece igual; Cloudflare Tunnel actúa solo como capa de transporte cifrado y tunelizado.
- **Hoja de ruta posterior**:  
  - Migrar de quick tunnels a un **túnel nombrado** asociado a un dominio propio (`sunday.midominio.com`) cuando se decida formalizar el despliegue externo.  
  - Mantener el mismo PC servidor como origen inicial, sustituyendo únicamente la capa de entrada (de `trycloudflare.com` temporal a dominio propio gestionado por Cloudflare).

#### 1.2 Rol del proxy de Vite

El archivo `vite.config.ts` define la capa de proxy local:

- Proxy de `/api` → `http://localhost:3001`
- Proxy de `/uploads` → `http://localhost:3001`
- Proxy de `/socket.io` → `http://localhost:3001` (incluyendo `ws: true` para WebSockets)

Efectos:

- **Unificación de origen**: desde el punto de vista del navegador, todas las rutas se sirven desde el mismo host/puerto donde corre Vite (`5173`).  
  Esto evita problemas de CORS durante el desarrollo y simplifica la configuración en LAN/VPN.
- **Transparencia para el frontend**: el código React usa rutas relativas (`/api/...`, `/socket.io/...`, `/uploads/...`) sin conocer el host real del backend.  
- **Mobile y VPN**: en entornos con latencia alta (VPN, móviles), el proxy de Vite no mitiga la latencia física, pero:
  - Minimiza fallos de CORS y configuración cruzada.
  - Centraliza el punto de entrada (solo exponer Vite + backend).

En modo producción, el frontend puede configurarse con `VITE_API_URL` para que la app conozca el origen del backend cuando no se usa el proxy dev.

#### 1.3 Resolución de direccionamiento en entornos con latencia

En el frontend:

- El socket se crea en `store/socket.ts` usando:
  - `SOCKET_URL = import.meta.env.VITE_API_URL || undefined`.
  - Si es `undefined`, Socket.IO usa mismo origen (`window.location`) y se apoya en el proxy de Vite.
- El API base se determina en `App.tsx` (`API_BASE`):
  - En desarrollo: `''` (mismo origen, vía proxy).
  - En producción: `VITE_API_URL || 'http://localhost:3001'`.

Patrones relevantes:

- **Fallback robusto**: si no se define `VITE_API_URL`, la app sigue funcionando en LAN (`localhost`/`192.168.x.x`) sin configuración adicional.
- **Compatibilidad VPN**: al mantener rutas relativas y un único origen en desarrollo, se minimiza el impacto de cambios de IP o túneles VPN.

Riesgos/edge cases:

- Configurar `VITE_API_URL` con un host accesible desde LAN pero no desde dispositivos móviles (o viceversa) puede romper la conexión de sockets o las llamadas REST.
- La latencia VPN puede amplificar efectos del bloqueo del event loop (ver sección de persistencia).

#### 1.4 Endurecimiento aplicado (marzo 2026)

Cambios de hardening ya implementados en esta fase:

- **JWT y autenticación**  
  - Eliminado el fallback inseguro `JWT_SECRET || 'change-me-in-prod'` en `backend/src/auth.ts`.  
  - Ahora el backend **falla al arrancar** si `JWT_SECRET` no está definido en `.env`.  
  - `JWT_SECRET`, `JWT_EXPIRES_IN` y `BCRYPT_ROUNDS` quedan documentados y parametrizados en `backend/.env.example` (12 rondas por defecto).  
  - Todas las rutas protegidas del backend (`/api/boards`, `/api/docs`, `/api/feed`, `/api/users`, `/api/notifications`, `/api/workspaces/*/doc-groups`, `/api/export/folders`, etc.) son consumidas desde el frontend a través de `apiFetch`, que adjunta automáticamente el JWT y centraliza el manejo de 401/403.

- **Socket.IO (VPN y móviles)**  
  - Configuración explícita en el servidor (`backend/src/index.ts`):  
    - `pingTimeout: 60000`, `pingInterval: 25000`, `connectTimeout: 45000`, `transports: ['websocket', 'polling']`.  
  - Cliente (`frontend/src/store/socket.ts`):  
    - Activada reconexión con `reconnection: true`, intentos limitados, backoff (`reconnectionDelay`/`reconnectionDelayMax`) y `timeout: 45000` para conexiones con alta latencia (VPN).

- **Sincronización Legacy / JSONB (campos sombra)**  
  - `Workspace.panelNotes` → `panelNotesJson`: las escrituras de `/api/workspaces/:workspaceId/panel-notes` actualizan ambos campos en la misma operación Prisma.  
  - `TemplateConfig.fieldPositions/customBoxes` → `fieldPositionsJson` / `customBoxesJson`: las rutas de configuración de plantilla guardan siempre string + JSONB sincronizados.  
  - `BoardColumn.settings` → `settingsJson`:  
    - Tanto la creación de columnas (`add_column`) como los updates (`update_column_settings`) y el trigger “Estado Taller → Estado Facturación” rellenan ahora el campo sombra JSONB.  
  - `Doc.content` → `contentJson`:  
    - `POST /api/docs` y `PATCH /api/docs/:id` mantienen sincronizados el string legacy y el JSONB con el contenido del documento.

- **Broadcast de sockets y rooms**  
  - Refuerzo del uso de `board:<boardId>` como room principal para eventos de tablero:  
    - `item_*`, `group_*`, `column_*` ya se emiten mayoritariamente a rooms, con fallbacks globales solo en casos sin `boardId`.  
    - Eventos de calendario (`calendar_event_added/updated/deleted`) migrados a `io.to(boardRoom(boardId))`.  
    - Eventos de linkado de docs/excel (`/api/boards/link-doc`) emiten `column_value_updated` al room del tablero cuando es posible.  
  - Introducción de rooms por usuario `user:<userId>` en el handshake de Socket.IO a partir del JWT; las notificaciones (`notification_created`) y los comentarios (`update_added`) se envían ahora a estos rooms en lugar de hacer broadcast global.  
  - Se mantienen como emisiones globales solo algunos eventos de bajo volumen (`user_added`, `user_updated`, `board_added`), documentados como deuda técnica para futura segmentación por workspace/usuario.

- **Motor de PDF (Puppeteer) y event loop**  
  - Introducción de `backend/src/pdfWorker.ts` basado en `worker_threads`:  
    - Toda la generación WYSIWYG de PDFs (incluyendo carga de plantillas, resolución de imágenes, render HTML y exportación) se ejecuta en un **worker dedicado**, no en el event loop principal.  
  - `generatePdfFromDocument` (`backend/src/htmlPdfGenerator.ts`):  
    - Ahora instancia un `Worker` (`pdfWorker.js`), pasa las opciones del documento y `API_BASE_URL`, y aplica un **timeout defensivo de 90 segundos**, tras el cual termina el worker y devuelve error controlado.  
  - `generatePdfFromHtml` se mantiene como helper legacy, usando Puppeteer directo, pero el flujo principal de impresiones usa el worker para minimizar bloqueos.

- **Motor de PDF de cotizaciones vectoriales**  
  - El botón **“Descargar PDF”** de `DocsPage` para `cotizacion` ya no depende del HTML/WYSIWYG como ruta principal:  
    - `POST /api/templates/:kind/generate` prioriza `generatePdfFromTemplate(kind, content)` con `pdf-lib`.  
    - Si el render vectorial falla o no existe la plantilla, el backend cae al flujo HTML (`generatePdfFromDocument` / worker) como fallback.  
  - Las fuentes `Averta Std` del flujo vectorial se cargan desde `backend/assets/fonts/AvertaStd` y se incrustan directamente en el PDF; esto explica que el resultado visual pueda diferir ligeramente del preview HTML aunque la tipografía sea la misma.  
  - El flujo HTML/WYSIWYG sigue siendo útil como respaldo y para documentos sin plantilla vectorial, pero **no** es el camino dominante para cotización.

- **Despliegue frontend y Nginx**  

- **CORS coherente entre Express y Socket.IO**  
  - El backend (`backend/src/index.ts`) lee ahora `ALLOWED_ORIGINS` como lista separada por comas y la aplica de forma consistente tanto al middleware `cors` de Express como a la configuración de Socket.IO.  
  - En desarrollo se utilizan orígenes explícitos (`http://localhost:5173`, IP LAN de Vite) en lugar de `'*'`, dejando documentado en `backend/.env` cómo ajustar la lista para entornos LAN/VPN y producción.  
  - Esto reduce superficie de ataque CORS manteniendo una experiencia cómoda en red local y móviles conectados por Wi‑Fi/VPN.
  - Añadido `nginx.conf` en la raíz del proyecto con:  
    - Servido del build de Vite como SPA (`root /ruta/al/frontend/dist`, `try_files ... /index.html`).  
    - Proxy de `/api`, `/uploads` y `/socket.io` hacia `http://localhost:3001` con soporte WebSocket y timeouts adecuados.  
  - Creado `frontend/.env.example` con `VITE_API_URL=http://192.168.X.X:3001` como guía para entornos LAN/VPN, manteniendo el patrón de “frontend delgado, backend central”.

---

### 2. Auditoría de Persistencia: Modelo Legacy vs JSONB nativo

#### 2.1 Estado actual de la base de datos

- **Proveedor**: PostgreSQL (definido en `schema.prisma` con `provider = "postgresql"`).  
- **Cliente ORM**: Prisma 5 (`@prisma/client` / `prisma`).
- **Migración desde SQLite**:
  - El proyecto ha migrado el datasource y el esquema a Postgres.
  - Se ha preservado la semántica de IDs (`String @id @default(uuid())`) y constraints.

#### 2.2 Estrategia de convivencia Legacy String JSON + JSONB

Para varios modelos se ha implementado una arquitectura de **"Campos Sombra"**:

- `Workspace`:
  - `panelNotes: String?` (JSON string legacy).
  - `panelNotesJson: Json?` (sombra JSONB para Postgres).
  - `docGroups: String?` / `docGroupsJson: Json?`.
- `BoardColumn`:
  - `settings: String?` (configuración JSON como string).
  - `settingsJson: Json?` (sombra).
- `ColumnValue`:
  - `value: String` (puede contener JSON o texto plano).
  - `valueJson: Json?` (sombra).
- `Doc`:
  - `content: String` (JSON string legacy).
  - `contentJson: Json?` (sombra).
- `Design`:
  - `content: String` (JSON string con el estado del canvas Fabric).
  - `contentJson: Json?` (sombra JSONB, útil para futuras consultas o tooling).
- `TemplateConfig`:
  - `fieldPositions: String` / `fieldPositionsJson: Json?`.
  - `customBoxes: String` / `customBoxesJson: Json?`.
- `FeedPost`:
  - `mentionedUserIds: String` / `mentionedUserIdsJson: Json?`.

Motivación:

- Permitir una migración progresiva donde:
  - El código legacy continúa leyendo/escribiendo strings JSON.
  - Nuevas funcionalidades y optimizaciones pueden usar JSONB directamente.
- Reducir el riesgo de **data loss** durante la transición: el string sigue siendo la fuente de verdad mientras se estabilizan las lecturas/escrituras nativas.

Patrón recomendado:

1. **Escritura**:
   - Cuando se actualice el campo string legacy (`content`, `settings`, etc.), sincronizar inmediatamente el campo JSONB (`contentJson`, `settingsJson`) con un parse seguro.
2. **Lectura**:
   - Lecturas nuevas / internas: priorizar JSONB (`*_Json`) por rendimiento y capacidad de indexación.
   - Lecturas legacy: seguir soportando string hasta eliminar los consumidores antiguos.

#### 2.3 Índices compuestos críticos para rendimiento

En el esquema Prisma destacan varios índices que son claves para el rendimiento en PostgreSQL:

- **Notification**
  - `@@index([userId, read, createdAt(sort: Desc)])`
    - Optimiza:
      - Bandeja de notificaciones por usuario (`WHERE userId = ? AND read = false/true ORDER BY createdAt DESC`).
      - Consultas mixtas de conteo de no leídas.
    - Impacto:
      - Evita escaneos completos de tabla al listar notificaciones recientes por usuario.
  - `@@index([itemId, createdAt])`
    - Optimiza auditorías por ítem (histórico de notificaciones de un elemento).

- **FeedPost**
  - `@@index([createdAt(sort: Desc)])`
    - Lista global del feed ordenado por tiempo (paginación inversa eficiente).
  - `@@index([authorId, createdAt(sort: Desc)])`
    - Consultas de publicaciones por autor (historial de actividad).

- **ColumnValue**
  - `@@unique([itemId, columnId])`
    - Garantiza que cada par (item, columna) tenga solo un valor.
    - Permite upserts eficientes (`upsert`) y simplifica la lógica de sincronización en sockets.

Estos índices están alineados con los patrones de acceso reales:

- Panel de notificaciones.
- Bandeja de entrada / feed.
- Operaciones de tablero en tiempo real (columna-valor por item).

Edge cases:

- Faltan, de momento, índices sobre campos `Json?` (JSONB) para filtros más complejos (por ejemplo, buscar por `settingsJson->'options'`), pero esto es razonable en la fase actual.

---

### 3. Matriz de Seguridad y Flujos de Autenticación

#### 3.1 Criptografía y almacenamiento de credenciales

- **Hashing de contraseñas**:
  - Implementado con `bcrypt` en `auth.ts` (`hashPassword`, `verifyPassword`).
  - Rondas configuradas vía `BCRYPT_ROUNDS` en `.env` (por defecto 12 en el código).
- **Usuarios y roles**:
  - Modelo `User` en Prisma:
    - Campos: `username`, `name`, `initials`, `color`, `password`, `role`, `status`.
    - Roles posibles: `'ADMIN' | 'VENTAS' | 'DISENO' | 'TALLER' | 'USER'`.
  - Usuario `ADMIN` se inicializa mediante script (`scripts/set-admin.ts`) y está verificado en Postgres.

Estado de endurecimiento (aplicado):

- **JWT_SECRET**: Sin fallback. El backend **falla al arrancar** si `JWT_SECRET` no está definido en `.env`. En producción es obligatorio configurar un secreto fuerte.

#### 3.2 Tokens JWT y ciclo de vida

- **Firma de tokens**:
  - `signJwt(payload: { userId; role })` en `auth.ts`.
  - Expiración configurable (`JWT_EXPIRES_IN`, por defecto `'7d'`).
- **Verificación de tokens**:
  - `verifyJwt(token)` encapsula `jwt.verify`.

El flujo de login (a alto nivel) es:

1. El usuario envía credenciales a una ruta de autenticación (no mostrada en el fragmento, pero normalmente `/api/login`).
2. El backend:
   - Busca el usuario en Postgres (`prisma.user.findUnique`).
   - Verifica la contraseña con `verifyPassword`.
   - Firma un JWT con `signJwt({ userId, role })`.
3. El frontend almacena el JWT (típicamente en `localStorage` o `sessionStorage`).
4. Las peticiones posteriores incluyen `Authorization: Bearer <token>`.

#### 3.3 Middleware de Express y composición

En `auth.ts` se define una cadena clara de responsabilidad:

- **`attachUserFromJwt`**:
  - Se ejecuta temprano (`app.use(attachUserFromJwt)`).
  - Lee el header `Authorization`.
  - Si existe un Bearer token válido:
    - Verifica el JWT.
    - Carga el usuario desde Postgres (`prisma.user.findUnique`).
    - Adjunta `req.authUser` y `req.user` con `{ id, role, username, name }`.
  - Si el token es inválido o no existe, simplemente continúa sin usuario.

- **`authenticateToken`**:
  - Se usa en rutas que requieren autenticación fuerte:
    - Ej.: `/api/workspaces`, `/api/workspaces/:id/panel-notes`, `/api/boards/...`.
  - Si `req.authUser` ya está presente, reutiliza esa información.
  - Si no, intenta verificar el JWT directamente; si algo falla, responde `401`.

- **`requireAuth`**:
  - Asegura que `req.authUser` exista; en caso contrario, responde `401`.

- **`requireAdmin`**:
  - Variante de `requireAuth` que exige `role === 'ADMIN'`.
  - Responde `403` si el usuario no es administrador.

Esto proporciona una matriz de acceso basada en roles:

- Rutas generales autenticadas → `authenticateToken` / `requireAuth`.
- Rutas privilegiadas (configuración, administración, plantillas PDF) → `requireAdmin`.

#### 3.4 Flujo lógico de una petición típica

Ejemplo: `GET /api/workspaces`

1. **Frontend**:
   - Función `apiFetch` (en el frontend) construye la petición:
     - `method: 'GET'`
     - `headers: { Authorization: 'Bearer <token>' }`
     - `baseURL` derivado de `API_BASE`.
2. **Red / Proxy**:
   - Si el frontend está sirviéndose desde Vite dev:
     - La petición es `GET http://192.168.x.x:5173/api/workspaces`.
     - Vite redirige internamente a `http://localhost:3001/api/workspaces`.
   - Si está en producción con `VITE_API_URL`:
     - La petición va directamente al host backend.
3. **Express Middleware Chain**:
   - `cors` (valida origen).
   - `express.json()` (parsea body si aplica).
   - `attachUserFromJwt` (adjunta `req.authUser` si el token es válido).
4. **Ruta protegida**:
   - Handler `app.get('/api/workspaces', authenticateToken, async ...)`:
     - `authenticateToken` verifica que `req.authUser` exista o valida de nuevo el token.
     - Si es válido:
       - El handler ejecuta `prisma.workspace.findMany(...)`.
       - Devuelve JSON con los workspaces.
     - Si no:
       - Devuelve `401 { error: 'No autenticado' }`.
5. **Frontend**:
   - Si la respuesta es `401` o `403`, la capa de frontend dispara:
     - Logout automático.
     - Limpieza de token.
     - Redirección a pantalla de login.

Pseudocódigo lógico:

```text
client.apiFetch(path, options):
  token = loadToken()
  res = fetch(API_BASE + path, { headers: { Authorization: 'Bearer ' + token } })
  if res.status in {401, 403}:
    clearToken()
    redirectToLogin()
  return res.json()
```

#### 3.5 Seguridad de rutas críticas

- **Workspaces, boards, panel-notes**:
  - Todas las operaciones de lectura/escritura relevantes están protegidas con `authenticateToken`.
  - Esto impide accesos anónimos a la estructura de trabajo y notas personales.
- **Notificaciones y bandeja de entrada**:
  - Asociadas a `userId`, protegidas también por auth.
- **Administración de usuarios y plantillas**:
  - Deben estar protegidas por `requireAdmin` (verificar en el código que todas las rutas de administración usan este middleware).

Edge cases y recomendaciones:

- Cuando el token expira, el frontend maneja automáticamente el 401/403, pero:
  - Es crítico que todas las rutas de lectura que exponen datos sensibles usen al menos `authenticateToken`.
  - Validar que no haya endpoints heredados sin middleware de auth.

---

### 4. Radiografía de Funcionalidades Core

#### 4.1 Motor de Sockets (Socket.IO)

Topología y patrón:

- Backend:
  - Crea un servidor Socket.IO sobre el mismo `httpServer` de Express.
  - Define un helper `boardRoom(boardId) = 'board:' + boardId`.
  - Usa rooms específicos para agrupar conexiones por tablero.
- Frontend:
  - `socket` singleton en `store/socket.ts`, compartido por todos los componentes.
  - Listeners registrados en `useEffect` con `socket.on(..)` y limpiados con `socket.off(..)`.

Flujos principales:

- `join_board` / `leave_board`:
  - El cliente emite `join_board({ boardId })` al abrir un tablero.
  - El servidor ejecuta `socket.join(boardRoom(boardId))`.
  - A la salida, se emite `leave_board` y el servidor hace `socket.leave(boardRoom(boardId))`.

- Eventos sobre items (`update_item_name`, `add_item`, `move_item`, `delete_item`):
  - Cada handler:
    - Persiste cambios en Postgres vía Prisma.
    - Recupera el `boardId` asociado (a través de `group`).
    - Emite el evento usando `io.to(boardRoom(boardId)).emit(...)`.

- Eventos sobre columnas, grupos y boards:
  - Similarmente, se centran en el board correspondiente y emiten al room adecuado.

Riesgo original (global emit):

- En la arquitectura inicial (sin rooms), muchos eventos se emitían con `io.emit(...)` (broadcast global).
  - Consecuencia: todos los clientes reciben tráfico de todos los tableros, incluso si solo trabajan en uno.
  - Esto satura fácilmente clientes móviles y conexiones VPN.

Estado actual:

- Los principales eventos de tablero (`item_added`, `item_moved`, `column_value_updated`, etc.) ya usan rooms (`io.to(boardRoom(...))`), lo que segmenta el tráfico por tablero.
- Aún existen algunos `io.emit(...)` (por ejemplo, ciertas notificaciones globales o eventos legacy):
  - `io.emit('notification_created', notif)` (notificación a todos, aunque solo interese a un usuario).
  - `io.emit('update_added', safeUpdate)` (comentarios en items).

**Recomendación Fase 3 — Optimización de Sockets**:

- Extender el concepto de rooms:
  - `user:<userId>` para tráfico estrictamente personal (notificaciones, comentarios, etc.).
  - Mantener `board:<boardId>` para tráfico de tablero.
- Pseudocódigo:

```text
on connection(socket):
  userId = authenticateSocketHandshake(socket) // derivado del JWT en la query/headers
  if userId:
    socket.join('user:' + userId)

sendNotificationToUser(userId, notif):
  io.to('user:' + userId).emit('notification_created', notif)
```

Con esto se elimina el broadcast global innecesario y se reduce la presión sobre la red móvil.

#### 4.2 Editor vectorial Estudio (Fabric.js)

La app incorpora ahora una página **Estudio** (solo desktop) orientada a diseño vectorial para taller/señalética.

- **Motor gráfico**:
  - Basado en **Fabric.js 6.x** sobre `<canvas>`, integrado en `VectorEditor`.
  - El estado del lienzo se serializa en JSON vía `canvas.toJSON()` y se persiste en el modelo `Design` (`content` / `contentJson`).
- **Modelo y API**:
  - Modelo `Design` en Prisma: `id`, `workspaceId`, `name`, `content`, `contentJson`, `thumbnailUrl?`, `boardId?`, `createdBy?`, timestamps.
  - Endpoints REST:
    - `GET /api/designs?workspaceId=...` — lista los diseños de un workspace.
    - `POST /api/designs` — crea un diseño vacío o con contenido inicial.
    - `GET /api/designs/:id` — obtiene un diseño.
    - `PATCH /api/designs/:id` — actualiza nombre y contenido (JSON de Fabric).
    - `DELETE /api/designs/:id` — elimina un diseño.
  - Todas las rutas usan `authenticateToken`; la validación estricta de workspace (que `design.workspaceId` pertenezca a un workspace accesible por el usuario) está diseñada pero aún puede reforzarse.
- **UI actual**:
  - Barra lateral izquierda (`DesignPage`):
    - Lista de diseños con nombre y `updatedAt`.
    - Botón **Nuevo** → `POST /api/designs` con contenido `{}` y selección inmediata del diseño creado.
  - `VectorEditor`:
    - Toolbar flotante con efecto **“liquid glass”** (`backdrop-filter: blur`) con herramientas:
      - Selección, Rectángulo, Elipse, (Pluma preparada pero todavía sin integración completa de `fabric-pen-tool`), Texto, Imagen (text/image aún sin comportamiento completo en esta iteración).
    - Lienzo responsivo:
      - `ResizeObserver` adapta `width/height` del canvas al contenedor.
      - Zoom con rueda (0.1x–5x en el MVP actual) y slider que muestra porcentaje.
      - Pan con **barra espaciadora + arrastrar**, moviendo el viewport de Fabric.
    - Panel de capas (`LayersPanel`):
      - Lista de objetos actuales, permite seleccionar objetos desde la lista.
      - Aún sin miniaturas por capa; previsto para fases posteriores usando `object.toDataURL()`.
    - Panel de propiedades (`PropertiesPanel`):
      - Ajuste de relleno, trazo y grosor del objeto seleccionado.
    - Barra superior:
      - Campo de nombre del diseño, indicador **dirty state** (punto rojo cuando hay cambios sin guardar).
      - Control de zoom y botón **Guardar** (deshabilitado si no hay cambios).
- **Persistencia y dirty state**:
  - El editor no hace PATCH continuo; cualquier cambio marca `isDirty = true`.
  - Al pulsar **Guardar**, se llama a `canvas.toJSON()` y se envía vía `PATCH /api/designs/:id`.
  - El dirty flag se limpia al recibir respuesta correcta.

Limitaciones actuales (respecto a Illustrator):

- No hay todavía edición de nodos (subselección de puntos Bézier) ni operaciones booleanas avanzadas.
- El snapping/guías y las unidades físicas (cm/m) aún no están implementados; el canvas trabaja esencialmente en px.
- La integración con items de tablero (asociar un diseño a un `Item`) está pensada pero no cableada; se soporta relación opcional `boardId` pero no `itemId`.

#### 4.3 Generador de PDF (WYSIWYG)

Pipeline de generación:

- **Build**:
  - Script `backend/scripts/build-document-view.js` usa `esbuild` para compilar `renderDocumentToHtml.tsx` a un bundle CJS:
    - Salida: `backend/dist/documentViewBundle.cjs`.
  - El bundle contiene lógica React para renderizar el documento exactamente como el editor.

- **Renderizado server-side**:
  - En runtime, el backend hace `require()` del bundle CJS.
  - Invoca una función (por ejemplo, `renderDocumentToHtml(docData)`) que devuelve HTML.
  - Este HTML se pasa a `puppeteer`/`pdf-lib` para producir un PDF con layout fiel.

- **Unidades físicas**:
  - Toda la tipografía y layout se define en `pt` (puntos tipográficos) para garantizar que 1 pt = 1/72 de pulgada.
  - Esto asegura que el WYSIWYG se mantenga consistente entre pantalla y papel.

Problema de box-model actual:

- El editor visual emplea `<textarea>` (con métricas dependientes del navegador).
- El PDF usa `<div>` con estilos CSS.

Resultado:

- Pequeñas desalineaciones (line-height, padding, wrapping de texto) entre lo que ve el usuario y lo que se renderiza en el PDF.

Además, **persiste un bug funcional conocido**:

- Cuando el texto se configura con color blanco en el editor, en algunos casos **no se visualiza correctamente en el PDF descargado** (queda invisible o con contraste insuficiente sobre el fondo).  
- Este comportamiento sugiere una discrepancia entre:
  - El estilo aplicado en el editor (color/fondo) y
  - El estilo final aplicado en la plantilla PDF durante el renderizado server-side.
- Debe tratarse como incidencia abierta a resolver en paralelo a la migración a `contentEditable` y a la consolidación de la hoja de estilos compartida.

Plan de mejora:

- Migrar el editor a un sistema basado en `div` + `contentEditable` con las mismas clases CSS que el PDF:

```text
Editor:
  <div contentEditable class="doc-text-block">
    ...
  </div>

PDF:
  <div class="doc-text-block">
    ...
  </div>
```

- Mantener una hoja de estilos compartida (CSS) para ambos entornos.

Estado a marzo 2026 (actualizado tras integración de plantilla vectorial de cotización):

- Para documentos de tipo **`cotizacion`**, el flujo principal de descarga usa la plantilla PDF vectorial (`backend/templates/cotizacion.pdf`) y el motor `generatePdfFromTemplate`, alimentado por `buildPdfContent` y `customBoxes` compartidos con el preview (`DocumentPageForPdf`).  
- Las fuentes **Averta Std** se empaquetan en el backend en `backend/assets/fonts/AvertaStd` y se embeben mediante `pdf-lib`; en la práctica, la mayoría de visores muestran ya texto nítido y vectorial, aunque persisten pequeñas diferencias de “hinting”/renderizado frente al navegador (especialmente en tamaños pequeños, en el ajuste vertical de las cajas y en la lectura del total blanco sobre fondo oscuro).
- El endpoint `POST /api/templates/:kind/generate` está configurado con una jerarquía clara: primero vectorial, luego fallback HTML worker si algo falla. La discrepancia visual entre preview y PDF final ya no debe interpretarse como falta de fuente, sino como una diferencia de métricas entre Chromium y pdf-lib.

#### 4.4 Reglas de negocio clave (Taller → Facturación)

Trigger automático implementado en el servidor (`update_column_value` en `index.ts`):

1. Evento de socket `update_column_value`:
   - Client envía `{ itemId, columnId, value }`.
2. Backend:
   - Hace `upsert` de `ColumnValue` (garantizado por `@@unique([itemId, columnId])`).
   - Identifica la columna (`BoardColumn`) asociada.
3. Regla especial:
   - Si la columna es de tipo `'status'`/`'priority'` y `title === 'Estado Taller'`, y el `value` JSON contiene `optionId === 'colocado'`:
     - Verifica si existe la columna `'Estado Facturación'` en el mismo board:
       - Si no existe:
         - Calcula `position` al final (`last.position + 1024`).
         - Crea la columna con `type: 'status'` y `settings` preconfiguradas:
           - Opciones: `Pendiente de facturar`, `Facturado`, `Cobrado`, `default`.
         - Emite `column_added` al room del board.
     - Verifica si el item ya tiene un `ColumnValue` para `'Estado Facturación'`:
       - Si no, crea uno con `value = { optionId: 'pendiente_factura' }`.
       - Emite `column_value_updated` al room del board.

Efectos de negocio:

- Automatiza el pipeline:
  - Taller marca un ítem como `colocado` → el sistema prepara la columna de facturación y marca el ítem como `Pendiente de facturar`.
- Reduce errores manuales:
  - Evita olvidar crear la columna de facturación o setear su estado inicial.

Edge cases:

- Si el board ya tiene una columna `'Estado Facturación'` con configuración distinta, la automatización podría entrar en conflicto con expectativas del usuario.
- Si `value` no es JSON válido, la lógica cae en un `try/catch` silencioso y simplemente no dispara el trigger (evitando caídas, pero ocultando datos malformados).

#### 4.5 Exportación de carpetas y Web Push

- Exportación de carpetas:
  - El servidor sincroniza archivos solo si el usuario está asignado al ítem (columna tipo `person`).
  - La estructura de salida se organiza bajo un directorio tipo `~/SundayExports`.
  - Esto cumple un control de acceso de facto sobre los assets exportados.

- Notificaciones Web Push:
  - Modelo `PushSubscription` ligado a `User`.
  - Helper `sendWebPushToUser(userId, payload)`:
    - Recupera todas las suscripciones del usuario.
    - Envía la notificación Web Push.
    - Si encuentra suscripciones inválidas (`410`, `404`), las elimina.
  - Integración con reglas de negocio:
    - Asignación de persona (`column.type === 'person'`) dispara notificación de tipo `'assigned'` y Web Push.
    - Nuevos comentarios (`add_update`) envían Web Push a usuarios asignados (excepto el autor).

---

### 5. Estructura de Archivos y Organización de Servicios

#### 5.1 Backend

- `backend/src/index.ts`:
  - Punto de entrada HTTP y Socket.IO.
  - Configuración de CORS, JSON, uploads (Multer), rutas REST y handlers de sockets.
  - Orquestación de Web Push.
- `backend/src/auth.ts`:
  - Lógica de JWT, hashing de contraseñas y middlewares de autorización.
- `backend/prisma/schema.prisma`:
  - Definición del modelo de datos: `User`, `Workspace`, `Board`, `Group`, `Item`, `BoardColumn`, `ColumnValue`, `Update`, `Notification`, `FeedPost`, `Doc`, **`Design`**, `TemplateConfig`, `PushSubscription`.
- `backend/scripts/*`:
  - `build-document-view.js`: build del bundle React server-side para PDFs.
  - `set-admin.ts`: inicialización del usuario administrador.
- `backend/templates/*`:
  - Plantillas base para PDFs u otros artefactos.

Patrones:

- **Capas**:
  - Capa de API (Express routes).
  - Capa de dominio (regras de negocio embebidas en handlers).
  - Capa de persistencia (Prisma ORM).
- **Riesgo**: la lógica de dominio está muy concentrada en `index.ts`, lo que puede dificultar el testing y la evolución. Fase futura debería extraer servicios por contexto (Boards, Docs, Notifications, Billing).

#### 5.2 Frontend

Componentes clave:

- `frontend/src/App.tsx`:
  - Orquestador general:
    - Estado de navegación (`activePage` virtual en lugar de `react-router`).
    - Gestión de vistas (`table`, `kanban`, `calendar`, `facturacion`, `resumen`, `timeline`, **`estudio`**).
    - Detección responsive (`matchMedia`, `ResizeObserver`).
    - Tema (`light` / `dark` / `night`) con persistencia en `localStorage` y sincronización con `<meta name="theme-color">`.
  - Gestión de paneles móviles (bottom nav, sidebars) y drawer `MobileMoreDrawer` (donde **`Estudio` solo está disponible en desktop, no en móvil** para evitar complejidad de UX en pantallas pequeñas).

- `frontend/src/store/socket.ts`:
  - Singleton de Socket.IO cliente.
  - Configuración de `autoConnect` y transports.

- `frontend/src/store/UserContext.tsx`:
  - Contexto de usuario logueado:
    - Almacena `currentUser`, token JWT y helpers `login/logout`.
    - Maneja expiración de sesión (logout en 401/403).

- `frontend/src/components/Board/*`:
  - `BoardContainer`, `ItemDetailsPanel`, etc.
  - Representación visual de tableros tipo Monday.com (grupos, items, columnas).

- `frontend/src/components/pages/*`:
  - `InboxPage`, `NotificationsPage`, `DocsPage`, `TeamPage`, `FacturacionPage`, `WorkspaceOverviewPage`, `MiTrabajoPage`, **`DesignPage` (Estudio)**.
  - Cada página corresponde a una "vista" de datos de negocio específica.

- `frontend/src/components/design/*`:
  - `VectorEditor`, `Toolbar`, `LayersPanel`, `PropertiesPanel`, `canvasSetup`, `designTypes`.
  - Implementan el editor vectorial basado en Fabric.js para la página Estudio.

Servicios:

- Capa `apiFetch` (ubicada en `frontend/src/api.ts`) centraliza:
  - Construcción de URLs (`API_BASE`).
  - Manejo de headers (Bearer token).
  - Tratamiento de errores comunes (401/403 → logout).

---

### 6. Hoja de Ruta de Ingeniería (Fases 3–5)

#### 6.1 Fase 3 — Optimización avanzada de Sockets

Objetivo: Reducir tráfico innecesario y mejorar la experiencia en VPN/móvil.

- **Rooms por usuario**:
  - Implementar `user:<userId>` además de `board:<boardId>`.
  - En el handshake del socket (o primer mensaje tras conexión), autenticar el usuario vía JWT y unirlo a su room de usuario.
  - Redirigir eventos de notificaciones y comentarios de:
    - `io.emit('notification_created', notif)` → `io.to('user:' + notif.userId).emit(...)`.
    - `io.emit('update_added', safeUpdate)` → rooms por item o por usuarios asignados.

- **Throttle/debounce en cliente**:
  - Para acciones de alta frecuencia (drag de items, actualizaciones rápidas), aplicar:
    - Debounce en envíos de eventos.
    - Batch de actualizaciones cuando sea posible.

KPIs:

- Reducción de ancho de banda promedio por cliente (especialmente móvil).
- Latencia percibida en updates concurrentes.

#### 6.2 Fase 4 — Endurecimiento de Consultas (Prisma)

Objetivo: Evitar sobre-fetching y mejorar tiempos de respuesta.

Líneas de actuación:

- Revisar todas las consultas Prisma que usan `include: { ... }`:
  - En muchos lugares se incluyen relaciones completas que no siempre son necesarias (ej. `include: { items: { include: { columnValues: true } } }`).
  - Estrategia:
    - Definir **DTOs específicos** por endpoint (qué datos necesita realmente el frontend).
    - Ajustar `select`/`include` en consecuencia.

- Ejemplo:

```text
// Actual (hipotético)
prisma.board.findUnique({
  where: { id: boardId },
  include: { groups: { include: { items: { include: { columnValues: true } } } } },
})

// Propuesto
prisma.board.findUnique({
  where: { id: boardId },
  select: {
    id: true,
    name: true,
    groups: {
      select: {
        id: true,
        name: true,
        position: true,
        items: {
          select: {
            id: true,
            name: true,
            position: true,
            // Solo columnas necesarias para la vista actual
          },
        },
      },
    },
  },
})
```

- Aprovechar JSONB:
  - Migrar progresivamente lecturas pesadas de strings JSON a campos `*_Json`.
  - En fases posteriores, introducir índices GIN sobre campos JSONB críticos (por ejemplo, búsquedas por etiquetas o estados complejos).

KPIs:

- Tiempos p95/p99 de endpoints críticos (boards, inbox, docs).
- Tamaño medio de respuesta (KB) en dichos endpoints.

#### 6.3 Fase 5 — Endurecimiento de Seguridad y Robustez Operacional

Líneas de trabajo:

- **Seguridad JWT**:
  - Asegurar:
    - `JWT_SECRET` fuerte y sin fallback en producción.
    - Rotación periódica de tokens (opcionalmente con refresh tokens).
  - Endurecer:
    - Validaciones de payload (`role` estrictamente tipado).
    - Blacklist/whitelist de orígenes para CORS en entornos productivos.

- **Hardening del event loop**:
  - Identificar operaciones bloqueantes:
    - `fs.copyFileSync` en exportaciones.
    - Llamadas pesadas de `puppeteer`.
  - Moverlas a:
    - Workers dedicados / colas de trabajo (ej. `bullmq`, `node:worker_threads`).
    - Procesos hijos con comunicación vía colas o sockets internos.

- **Observabilidad**:

Estado a marzo 2026 (actualizado):

- El build de frontend (`npm run build`) compila sin errores de TypeScript tras tipar de forma estricta vistas de tablero, calendario y editor/PDF (incluyendo `DocsPage`, `PdfTemplateEditor` y `UserContext`).  
- La experiencia móvil al entrar en la app se ha estabilizado mediante un estado de “bootstrap” en `App.tsx`, que muestra una única pantalla de carga mientras se resuelven `currentUser`, workspaces y boards, evitando montajes/desmontajes repetidos de vistas de tablero y encabezados.
  - Añadir logging estructurado (JSON) y niveles (`info`, `warn`, `error`).
  - Instrumentar tiempos de consulta de Prisma.
  - Medir número de conexiones Socket.IO activas.

#### 6.4 Camino a un Estudio “tipo Illustrator”

Además de las fases generales, el editor vectorial Estudio tiene su propia hoja de ruta específica:

- **Fase E1 — Pluma y edición de nodos**  
  - Integrar `fabric-pen-tool` o un módulo equivalente sobre Fabric.js 6 para:
    - Herramienta Pluma con creación de paths Bézier.
    - Modo de **edición de nodos** (Direct Selection): mover puntos y mangos, añadir/eliminar nodos.
  - Diseño de UX: herramienta de selección directa separada, atajos de teclado (P, A, V).

- **Fase E2 — Zoom, Pan y Rulers “industriales”**  
  - Extender el rango de zoom a **0.1x–100x** con control visual y atajos (`Ctrl + rueda`, botones +/-).
  - Mejorar el pan con barra espaciadora (suavizado y freno).
  - Implementar **reglas (Rulers)** superior/izquierda que:
    - Se actualicen con el zoom y el viewport.
    - Sirvan como origen para **guías arrastrables**.

- **Fase E3 — Capas avanzadas y miniaturas**  
  - Ampliar `LayersPanel` con:
    - Miniatura por objeto (`object.toDataURL()`), icono por tipo (Rect, Path, Text, Image).
    - Reordenación drag & drop (z-index), visibilidad y bloqueo.
  - Optimizar rendimiento para lienzos con docenas/centenares de objetos.

- **Fase E4 — Texto, imágenes, snapping y unidades reales**  
  - Herramienta Texto (`IText`/`Textbox`) y herramienta Imagen (subida/local o URL).
  - Panel de propiedades enriquecido (fuentes, tamaños, alineaciones, tracking simple).
  - **Snapping profesional**:
    - A bordes y centros de objetos.
    - A guías horizontales/verticales y centro del lienzo.
    - Feedback visual con líneas de alineación.
  - **Unidades físicas**:
    - Configuración de tamaño de lienzo en cm/m.
    - Factor de escala interno (ej. 100 px = 10 cm) y reglas/panel que muestren unidades reales.

- **Fase E5 — Export y operaciones booleanas**  
  - Exportar SVG/PNG desde el editor, con control de resolución y escala para archivos de corte.
  - Historial de deshacer/rehacer basado en snapshots JSON (con límites y compactación).
  - Operaciones booleanas (Pathfinder-like):
    - Integrar una librería de geometría 2D (Paper.js o ClipperLib) para unir/restar/intersecar paths.
    - Flujo: el usuario selecciona 2+ objetos → “Unir / Restar / Intersección” → se genera un nuevo Path resultado.

- **Fase E6 — Integración profunda con tableros**  
  - Asociación de `Design` a `Item` (`itemId` en el modelo).
  - Botones desde columnas o panel de detalle de ítem: “Abrir en Estudio”.
  - Convenciones para exportar archivos listos para producción (nomenclatura, estructura de capas, tamaño físico).

Estas fases, combinadas, acercan Estudio a una experiencia de trabajo **tipo Illustrator** pero centrada en los casos de uso del taller (rotulación, señalética, corte, etc.), manteniendo persistencia robusta en JSON/JSONB y un flujo de trabajo integrado con tableros y documentos de Sunday.

#### 6.5 Automatización ligera de despliegues (Git + script en servidor)

Como mejora operativa inmediata, se implementará en breve un **script de despliegue en el servidor** que:

- Ejecutará `git pull` sobre la rama principal del repositorio.
- Aplicará las migraciones de Prisma sobre PostgreSQL (`prisma migrate deploy`).
- Reconstruirá los artefactos necesarios (`npm run build` en backend/frontend, según aplique).
- Reiniciará los procesos de backend/frontend de forma controlada.

Este enfoque mantiene un flujo sencillo (desarrollo en cualquier PC → `git push` → ejecución manual del script en el servidor), pero reduce drásticamente el riesgo de errores humanos durante las actualizaciones.

---

### 7. Edge Cases y Riesgos Remanentes

- **Tokens expirados o inválidos**:
  - Si el frontend no captura correctamente todos los 401/403, pueden aparecer estados inconsistentes (UI que asume usuario logueado, pero backend lo rechaza).

- **Desfase Legacy / JSONB**:
  - Si alguna ruta actualiza solo el campo string y no el JSONB (o viceversa), pueden aparecer divergencias de datos entre vistas antiguas y nuevas.

- **Broadcast global residual**:
  - Cualquier `io.emit` residual en eventos de alta frecuencia puede seguir saturando redes lentas.

- **Box-model en PDF**:
  - Hasta completar el ajuste fino de métricas/paddings en el motor vectorial, ciertos documentos pueden imprimir con pequeñas diferencias respecto a la vista del editor.
  - El total blanco y otros textos sobre fondos oscuros dependen de que la caja quede exactamente dentro de la franja de fondo del PDF base; cualquier desfase vertical deja el texto fuera del área visible.

- **Configuraciones de CORS flexibles**:
  - El uso de `'*'` como origen permitido es aceptable en desarrollo, pero debe endurecerse en despliegue real a dominios concretos.

- **Parpadeo crítico de la UI (especialmente en móvil)** — corregido:
  - Se ha introducido un estado de arranque (`isBootstrapping`) en `App.tsx` que espera a que se carguen `currentUser`, workspaces y boards antes de montar las vistas pesadas en móvil.  
  - Mientras dura el bootstrap se muestra una pantalla de carga única y se ocultan `MobileBoardHeader`, FAB y `BottomNav`, evitando los cambios encadenados de `activePage`/`activeBoardId` y el parpadeo entre distintas pantallas.  
  - El comportamiento de navegación y sockets se mantiene intacto una vez finaliza el bootstrap.

---

### 8. Conclusión

Sunday presenta una arquitectura moderna basada en React + Node.js + PostgreSQL, con un diseño orientado a trabajo en tiempo real (Sockets) y una cuidadosa transición desde modelos legacy a JSONB.  
Las capas de seguridad (bcrypt + JWT + middlewares) y la segmentación de tráfico por rooms sientan las bases para operación segura en entornos LAN/VPN/móviles.  
Las siguientes fases de ingeniería (optimización de sockets, endurecimiento de consultas Prisma y hardening de seguridad/event loop) permitirán escalar el sistema manteniendo una experiencia fluida para los usuarios finales.

