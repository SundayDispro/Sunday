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

- **Estado a marzo 2026 (según manifiesto, actualizado)**  
  - **Tableros en tiempo real**: 100% funcionales, pendiente seguir refinando rooms por usuario.  
  - **Editor/PDF**: ~95% (flujo 1:1 de descarga consolidado; quedan detalles finos en edge cases).  
  - **Seguridad JWT**: middleware y manejo en frontend implementados; pendiente endurecer algunos valores por defecto (`JWT_SECRET`, rondas bcrypt).  
  - **PostgreSQL**: esquema y campos sombra en producción, con migración lógica desde strings; continúan tareas de eliminación de código puramente legacy.  
- **Modo móvil/PWA (Roadmap V6 — completado 20 marzo 2026)**: ~95%, con todas las mejoras del Roadmap Mobile V6 implementadas (menú Más reducido, Bandeja/Notificaciones separadas, deep-link desde notificación a post de Bandeja, grupos Docs minimizados al entrar en móvil, foto de perfil persistente con `avatarUrl`, etiquetas Info corregidas en panel de detalle, visibilidad de columnas de estado por rol, ícono PWA definitivo); bug crítico de crash en Safari iOS al navegar desde notificación al tablero corregido (ver sección 7).
  - **Web Push + bandeja**: menciones/asignaciones sin leer unificadas en la bandeja móvil; deep-link desde push hacia la pestaña de `Notificaciones`; contador de badge sincronizado con notificaciones sin leer (cuando soportado por el navegador).
  - **PWA icon assets (iOS) — cierre operativo**: además del set inicial (`icon-180/192/512.v2`), se incorporaron generaciones `v5`/`v6`, `apple-touch-icon` en variantes canónicas (`apple-touch-icon*.png`) y `favicon.ico` real generado desde el logo de app para cortar fallback legacy.
  - **Estado final del ícono en iPhone**: validado funcional al instalar desde URL pública HTTPS de **Cloudflare Tunnel** (quick tunnel) con origen nuevo; iOS dejó de mostrar la “S” azul y tomó el icono correcto de la app.
  - **Residuo conocido en iOS**: al cambiar de origen (IP LAN/puerto/URL temporal/dominio fijo), iOS no migra el WebClip existente; requiere eliminar acceso directo previo y reinstalar “Agregar a inicio”.
  - **Ajustes UX móviles**: header/banners estilo login en Inicio móvil y correcciones de layout en `BandejaUnificadaPage` para estabilizar el desplazamiento al alternar pestañas.

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

#### 0.1.2 Documentación del repositorio y PostgreSQL en servidor (marzo 2026)

- **README operativos**: `README.md` en la raíz del monorepo, `backend/README.md` y `frontend/README.md` con instrucciones de arranque, variables de entorno y enlaces a la guía de base de datos.
- **Guía de base de datos**: `docs/DEV_SETUP_POSTGRES.md` describe el flujo con **PostgreSQL instalado nativamente en Windows** (desarrollo y servidor final): creación de usuario/base (`ops/setup-local-postgres.sql`), `npx prisma migrate deploy`, `npm run seed`, comprobación con Prisma Studio, y notas de firewall/secretos/backups para producción.
- **Variables de entorno**: `backend/src/env.ts` carga `backend/.env` con **`override: true`** respecto al proceso, de modo que la configuración del proyecto no quede oculta por una `DATABASE_URL` u otras variables heredadas en el entorno del sistema Windows.
- **Contenedores**: la implementación final prevista **no** depende de Docker para PostgreSQL; el repositorio no incluye `docker-compose` en el flujo documentado de despliegue (histórico opcional de desarrollo eliminado de la documentación activa).

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

- **Motor de PDF y descarga 1:1 (Generar PDF)**  
  - En Docs, vista documento, el botón **"Generar PDF"** (cotización, levantamiento, hoja de trabajo) abre la ventana `/docs/pdf-preview` con la misma vista que el preview (`PdfTemplateEditor` solo lectura). El usuario pulsa **"Guardar como PDF"**: el frontend captura con `html2canvas` a escala 300/96, genera un PDF US Letter con `jsPDF` y descarga. El PDF descargado es **1:1** respecto al preview. En la ventana hay **Enviar por WhatsApp** y **Enviar por correo**.  
  - El backend mantiene `POST /api/templates/:kind/generate` (worker raster o vectorial) para otros usos; la descarga que ve el usuario es la ventana cliente. Las fuentes Averta Std se usan en el editor y en el flujo vectorial del backend.

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

- **`requireRoles([...])` (RBAC por rol)**:
  - Middleware general para autorizar **por lista de roles permitidos** (ej. `['ADMIN','VENTAS']`).
  - Hardening aplicado (marzo 2026):
    - **Valida la configuración** (roles no vacíos y dentro del set permitido) para evitar typos silenciosos.
    - **Bypass de ADMIN**: el rol `ADMIN` se considera “acceso total” y pasa aunque no esté incluido explícitamente en la lista.
  - Respuestas:
    - `401` si no hay usuario autenticado (`req.authUser` ausente).
    - `403` si el rol no está autorizado.

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
- **Endurecimiento RBAC aplicado (marzo 2026)**:
  - `GET /api/my-work`: requiere JWT (`authenticateToken`) y **filtra por usuario** (solo ítems asignados al `userId` del token).
  - `GET /api/search`: requiere JWT (`authenticateToken`) y para roles restrictivos filtra a ítems **asignados al usuario**; para roles amplios (`ADMIN|VENTAS|DISENO`) permite búsqueda más global dentro del workspace.
  - `DELETE /api/items/:id`: requiere JWT y además `requireRoles(['ADMIN','VENTAS'])` (por bypass, `ADMIN` siempre pasa). Esto bloquea borrados desde roles no autorizados (incluyendo `DISENO`, `TALLER`, `USER`).
- **Notificaciones y bandeja de entrada**:
  - Asociadas a `userId`, protegidas también por auth.
- **Administración de usuarios y plantillas**:
  - Deben estar protegidas por `requireAdmin` (verificar en el código que todas las rutas de administración usan este middleware).
- **Rutas REST con `requireRoles` aplicado (marzo 2026)**:
  - **Deletions destructivas**:
    - `DELETE /api/workspaces/:id` → `requireRoles(['ADMIN'])`.
    - `DELETE /api/boards/:id` → `requireRoles(['ADMIN'])`.
    - `DELETE /api/items/:id` → `requireRoles(['ADMIN','VENTAS'])` (excepción operativa: ventas puede borrar ítems; `ADMIN` bypass).
  - **Creación/edición sensible (estructura o acciones de alto impacto)**:
    - `POST /api/workspaces` → `requireRoles(['ADMIN'])`.
    - `PATCH /api/workspaces/:id` → `requireRoles(['ADMIN'])`.
    - `POST /api/boards` → `requireRoles(['ADMIN','VENTAS'])`.
    - `POST /api/boards/:id/columns/reorder` → `requireRoles(['ADMIN','VENTAS'])`.
    - `POST /api/boards/link-doc` → `requireRoles(['ADMIN','VENTAS','DISENO'])` (alineado con creación/edición de ítems).
    - `POST /api/boards/:boardId/calendar-events` → `requireRoles(['ADMIN','VENTAS','DISENO'])`.
    - `PATCH /api/boards/:boardId/calendar-events/:eventId` → `requireRoles(['ADMIN','VENTAS','DISENO'])`.
    - `DELETE /api/boards/:boardId/calendar-events/:eventId` → `requireRoles(['ADMIN','VENTAS','DISENO'])`.
- **Facturación / costos (backend como fuente de verdad)**:
  - No existe un endpoint REST dedicado tipo `/api/billing` o `/api/costos`.
  - La vista de facturación se nutre de los datos del tablero (boards/columnas/columnValues), y el control de acceso se refuerza en:
    - Frontend: `can(user, 'billing.view')`.
    - Sockets: `update_column_value` bloquea a `DISENO` en la columna **"Estado Facturación"**.
- **Grupos (eliminación)**:
  - No existe `DELETE /api/groups` (REST). La eliminación de grupos es vía Socket.IO (`delete_group`) y queda restringida en backend (solo `ADMIN` por bypass + lista vacía).

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

Endurecimiento aplicado (marzo 2026) — **RBAC en eventos Socket.IO**:

- **Problema**: aunque la API REST esté protegida, si los eventos Socket.IO de escritura no validan rol/JWT,
  un usuario (ej. `DISENO`) podría emitir `delete_item` desde consola y el backend lo procesaría.
- **Solución implementada en `backend/src/index.ts`**:
  - En el handshake se verifica el JWT y se persiste `{ userId, role }` en `socket.data`.
  - Se introduce un wrapper `withSocketRoles(event, rolesAllowed, handler)`:
    - Si no hay JWT válido → emite `action_denied { event, reason: 'unauthenticated' }` y no procesa.
    - Si el rol no está permitido → emite `action_denied { event, reason: 'unauthorized' }` y no procesa.
    - `ADMIN` tiene bypass (acceso total) por diseño.
  - **Hardening adicional por columna** en `update_column_value`:
    - `TALLER` y `USER` solo pueden actualizar la columna **`Estado Taller`** (tipo `status`) y nunca columnas `person`.
    - `DISENO` no puede actualizar la columna **`Estado Facturación`**.
  - **Hardening de identidad**: en `add_update` se ignora `authorId` del cliente y se fuerza `authorId = socketJWT.userId`.

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

#### 4.2 Editor vectorial Estudio (Fabric.js) — pestaña retirada

La app incorporaba una página **Estudio** (solo desktop) orientada a diseño vectorial para taller/señalética. **En una actualización reciente la pestaña Estudio fue eliminada por completo de la navegación** por no cumplir con los estándares deseados. El modelo `Design`, los endpoints REST de diseños y el código del editor (Fabric.js, `DesignPage`, `VectorEditor`, etc.) pueden seguir presentes en el repositorio o en el backend, pero **ya no están accesibles desde la UI**: no hay icono ni ruta para Estudio en la barra lateral ni en el drawer móvil.

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

Limitaciones que motivaron la retirada (respecto a estándares tipo Illustrator):

- No había edición de nodos (subselección de puntos Bézier) ni operaciones booleanas avanzadas.
- El snapping/guías y las unidades físicas (cm/m) no estaban implementados; el canvas trabajaba en px.
- La integración con items de tablero estaba pensada pero no cableada.

#### 4.2.1 Pestaña Navegador (Browser) — retirada

La pestaña **Navegador** fue retirada de la aplicación.

Motivo: la mayoría de sitios modernos (por ejemplo Google / WhatsApp Web) bloquean el render dentro de iframes mediante `X-Frame-Options` / `Content-Security-Policy`, por lo que un “navegador integrado” basado en iframe no es una solución fiable ni mantenible para Sunday.

Estado: se eliminó la UI, rutas backend y modelos asociados; si en el futuro se retoma, debe plantearse como **“Abrir en navegador del sistema”** (PWA) o mediante un contenedor nativo con WebView (fuera del alcance actual).

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

- El editor visual de plantillas (`PdfTemplateEditor`) usa cajas con `contentEditable` y aplica `line-height`/paddings consistentes en cliente.
- El PDF descargado en el flujo principal (“Generar PDF” → “Guardar como PDF”) se genera capturando **la misma vista** del preview con `html2canvas` (escala 300/96) e incrustándola en US Letter con `jsPDF`.

Resultado:

- Para el flujo **1:1** que ve el usuario, el PDF coincide con el preview porque proviene del mismo DOM renderizado en cliente.
- Las discrepancias restantes quedan acotadas a rutas server-side (renderizado/embebido con Puppeteer/pdf-lib) y a edge cases de normalización de estilos/colores y recorte de cajas cerca del borde.

Además, hay que vigilar edge cases de color en rutas server-side:

- El mapeo de contraste para “texto blanco” se calcula en `pdf-lib` (fuerza blanco para cajas tipo `total` y/o fondos negros).
- En el flujo 1:1 del cliente, el color se corresponde con el preview; cualquier discrepancia suele aparecer cuando el valor de `fontColor` no llega en un formato normalizado (por ejemplo, diferencias entre `#fff` y `#ffffff`) o por reglas de recorte en el renderizado en backend.

Plan de mejora:

- Unificar/simplificar normalización de `fontColor` y `backgroundColor` entre UI y backend (aceptar variantes como `#fff` y `#ffffff`, y no asumir solo valores exactos).
- Revisar el clamping/recorte de cajas cuando están muy cerca de bordes (evitar que se pierda texto por 1–2px efectivos a escala alta).
- Mantener consistencia de escalas (300/96) y factores de tipografía para que el rasterizado server-side y el cliente sigan siendo equivalentes.

Estado a marzo 2026 (actualizado tras flujo Generar PDF y descarga 1:1):

- El flujo principal que ve el usuario para **descargar el PDF** es en cliente: en Docs, vista documento, **"Generar PDF"** abre la ventana `/docs/pdf-preview` con la misma vista que el preview (`PdfTemplateEditor` solo lectura). El usuario pulsa **"Guardar como PDF"**: el frontend captura con `html2canvas` a escala 300/96, genera un PDF US Letter con `jsPDF` y descarga. **El PDF descargado es 1:1** respecto al preview. En la ventana están también **Enviar por WhatsApp** y **Enviar por correo**.
- El backend mantiene `POST /api/templates/:kind/generate` (worker en `pdfWorker.ts` o flujo vectorial): se usa para otros usos (impresiones, etc.). Para documentos tipo **`cotizacion`** y resto de plantillas, ese flujo es **rasterizado a 300 dpi** (`generatePdfFromDocument` → PNG 300/96 → `createPdfFromScreenshotPng`) con fallback a `generatePdfFromTemplate` si falla.  
- Las fuentes **Averta Std** se cargan en el backend (`backend/assets/fonts/AvertaStd`) y se usan tanto en el bundle de render (worker) como en el flujo vectorial (`pdf-lib`); en la práctica, la mayoría de visores muestran ya texto nítido y vectorial, aunque persisten pequeñas diferencias de “hinting”/renderizado frente al navegador (especialmente en tamaños pequeños, en el ajuste vertical de las cajas y en la lectura del total blanco sobre fondo oscuro).
- La cabecera de respuesta `X-PDF-Method` indica `raster-300dpi` o `vector-fallback` según el camino usado.

#### 4.3.1 Micro-editor móvil de plantillas (plan «mobile-micro-editor»)

Implementación consolidada en frontend (marzo 2026):

- **`frontend/src/components/pages/DocsPage.tsx`**: el flujo móvil de «Editar plantilla» migró de drawer/modal superpuesto a **subvista embebida dentro de Docs** (con breadcrumb contextual `Documentos / Editar plantilla` y botón **Cerrar** con retorno al estado correcto lista/visor); se eliminó `Modo mapa` y la botonera superior se normalizó en 4 acciones principales (Deshacer/Cerrar/Generar PDF/Guardar), con layout adaptativo para evitar recortes en pantallas estrechas; se mantiene el guardado de emergencia en `localStorage` (`sunday_draft_<documentId>`), con recuperación al reabrir y limpieza al guardar/cerrar.
- **`frontend/src/components/pages/docs/PdfTemplateEditor.tsx`**: mejora de edición `contentEditable` sin borrado al enfocar (sin inyectar `children` en el cuadro activo), saneamiento de cajas de una línea (`singleLine`/`folio` sin saltos de línea en Enter/paste/input), soporte visual para texto blanco durante edición (`textShadow` + `caretColor`) y `will-change` temporal en drag/resize.
- **`frontend/src/components/docs/TextFormatBar.tsx`**: continúa `uiMode?: 'full' | 'textStyleOnly'` para respetar gating ADMIN en estilos.
- **Documentación**: checklist manual `docs/MOBILE_MICRO_EDITOR_QA.md`; plan de trabajo Cursor `mobile-micro-editor_6a5cd465.plan.md` (todos m1–m7 en estado *completed*).

**Hueco de producto/UX (siguiente fase recomendada):**

- El problema de referencia visual y usabilidad en móvil pasó de **abierto crítico** a **mitigado** con edición embebida, escala consistente entre Explorar/Crear y eliminación de solapamientos con navegación inferior durante edición.  
  Pendiente: validar en QA de campo (iOS/Android reales) el confort de lectura en plantillas con fondos claros/oscuros y la ergonomía del flujo en sesiones largas.

**Backlog técnico alineado con el plan (no bloqueante):** unificar definitivamente código legacy del flujo overlay (si queda rastro), evaluar bottom sheets para color/semánticas (`nota_iva` / `notas`), y ejecutar QA de campo en **Safari iOS + Chrome Android** con checklist final sobre dispositivos físicos.

**Estado de cierre del plan (marzo 2026):**

- **Cerrado en ingeniería:** migración a subvista embebida, estabilidad de edición (`contentEditable`), legibilidad de texto blanco, enforcement de cajas de una línea, mitigación de solapamiento en `total`, borrador de emergencia y limpieza documental.
- **Criterio pendiente para cierre total:** pasada final en dispositivos físicos (**iOS Safari + Android Chrome**) y registro de evidencias del checklist QA.

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
  - En el cliente:
    - El service worker muestra la notificación y, cuando está soportado, aplica `setAppBadge` con el contador de no-leídas.
    - El payload incluye un `url` que deep-linkea a `/?tab=notifications` para abrir directamente la pestaña `Notificaciones` dentro de la app.
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
  - Estado operativo actual: `cotizacion.pdf`, `levantamiento.pdf` y `hoja_trabajo.pdf` presentes en el servidor de proyecto; `levantamiento.pdf` actualizado con la plantilla real de levantamiento entregada por el usuario.

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
    - Gestión de vistas (`table`, `kanban`, `calendar`, `facturacion`, `resumen`, `timeline`).
    - Reordenamiento de tabs de vistas del tablero mediante **drag & drop** (con persistencia en `localStorage` y controles de flecha como respaldo).
    - La pestaña **Estudio** fue eliminada; la pestaña **Navegador** fue retirada por no ser viable como iframe.
    - Detección responsive (`matchMedia`, `ResizeObserver`).
    - Tema (`light` / `dark` / `night`) con persistencia en `localStorage` y sincronización con `<meta name="theme-color">`.
  - Sidebar de Docs (desktop) actualizado:
    - Sistema de widgets persistentes por usuario/workspace (`panel-notes`) con orden arrastrable.
    - Widgets activos: **Tareas**, **Calculadora** y **Recordatorios**.
    - Rediseño visual unificado de widgets con estilo glass sutil, bordes de bajo contraste y separación por sombras para mejor integración con temas.
  - Gestión de paneles móviles (bottom nav, sidebars) y drawer `MobileMoreDrawer`.

- `frontend/src/store/socket.ts`:
  - Singleton de Socket.IO cliente.
  - Configuración de `autoConnect` y transports.

- `frontend/src/store/UserContext.tsx`:
  - Contexto de usuario logueado:
    - Almacena `currentUser`, token JWT y helpers `login/logout`.
    - Maneja expiración de sesión (logout en 401/403).

- `frontend/src/components/Login.tsx`:
  - Pantalla de login (skin vertical principal):
    - Encabezado del hero con **“Bienvenido / a Sunday”** alineado a la izquierda en dos renglones.
    - `AnimatedLogo` pequeño: render SVG por capas (sol + rayos) usando un “grupo rotante” de keyframes.
      - El par activo (una variante para sol y otra para rayos) se asigna al entrar a una pestaña y se mantiene hasta cambiar a otra (`activePage`).
      - Se evita desincronía rígida aplicando desfase entre sol/rayos, manteniendo el mismo eje centrado.
      - Los keyframes incluyen efectos de brillo (`drop-shadow`), wobble suave (micro-deformaciones con `scale`) y respiración (pequeño `translateY`); el color base sigue adaptándose al tema mediante `currentColor`.
    - Ajuste visual reciente:
      - El botón principal **“Continuar”** quedó unificado en ambos layouts (vertical y horizontal) usando una única clase de estilo primario (`bg-monday-blue`, hover consistente y mismos estados `disabled`/sombra), eliminando discrepancias de color entre variantes del login.

- `frontend/src/components/Board/*`:
  - `BoardContainer`, `ItemDetailsPanel`, etc.
  - Representación visual de tableros tipo Monday.com (grupos, items, columnas).
  - `frontend/src/components/Board/ItemDetailsPanel.tsx` (actualización marzo 2026):
    - Cambios realizados:
      - Se reforzó la deduplicación de enlaces en la pestaña `Archivos` (Drive) usando normalización de URL y extracción del ID de Drive para evitar duplicados.
      - Se mejoró el renderizado en la pestaña `Info` evitando que IDs/valores “en código” (UUIDs o JSON double-encoded) se muestren como texto crudo.
      - Ajuste adicional: para columnas `person` sin usuario resoluble se muestra `Usuario asignado` en lugar de IDs internos.
      - Fallback de columnas sin metadata endurecido para ocultar valores técnicos (UUID/JSON) con placeholder visual (`—`) y etiqueta neutral (`Campo`).
    - Estado:
      - `Info`: mitigado de forma importante; se mantiene monitoreo de edge cases de datos legacy extremadamente malformados.
      - `Archivos`: deduplicación operativa; mantener QA sobre enlaces históricos duplicados en datos antiguos.

- `frontend/src/components/mobile/*` y navegación móvil:
  - Ajustes visuales de consistencia de tema (menos fondos `bg-white` rígidos en overlays/drawers; mayor uso de tokens de superficie).
  - `MobileBottomNav`: feedback táctil y transición de estado activo refinados para mejorar legibilidad del tab seleccionado.
  - `TodayPage`: cards y barra de búsqueda con jerarquía visual más limpia y consistente entre temas.
  - `MobileMoreDrawer`: inputs/popovers de workspace y tema migrados a superficies temáticas para evitar “parches blancos” en temas oscuros.

- `frontend/src/components/pages/*`:
  - `InboxPage`, `NotificationsPage`, `DocsPage`, `TeamPage`, `FacturacionPage`, `WorkspaceOverviewPage`, `MiTrabajoPage`.
  - `DocsPage` (actualización marzo 2026):
    - El menú **Añadir widget** agrega elementos al ecosistema de Docs y se alineó con widgets operativos del panel de exploración.
    - Widgets operativos actuales en exploración móvil: **Pendientes por estado**, **Atajos por tipo**, **Filtros guardados** y **Recordatorios v2** (con repetición diaria/semanal, sonido y snooze).
    - Ajustes UX recientes:
      - Flujo móvil de **Crear** unificado para abrir el documento recién creado en el mismo contexto de Docs (sin rebotes al menú de creación).
      - En **overview**, el bloque superior de creación se oculta cuando hay documento/borrador activo para evitar que el editor quede “debajo” y requiera scroll.
      - Cabeceras de grupo en **Explorar móvil** optimizadas: contador de elementos más pequeño y reposicionado bajo el título; se eliminó el botón **Añadir subgrupo** para priorizar visibilidad del nombre completo del grupo.
      - La hoja nueva (`sheet`) se presenta en formato visual **US Letter** para una edición más controlada.
  - La página **DesignPage (Estudio)** fue retirada de la navegación; el código puede seguir en el repo pero no se monta desde `App.tsx`.
  - Cada página corresponde a una "vista" de datos de negocio específica.

- `frontend/src/components/design/*`:
  - `VectorEditor`, `Toolbar`, `LayersPanel`, `PropertiesPanel`, `canvasSetup`, `designTypes`.
  - Código del editor vectorial Fabric.js; ya no está expuesto en la UI al haberse eliminado la pestaña Estudio.

- **Guards de autorización en frontend (UX) — Fase 4 aplicada (marzo 2026)**:
  - Helper central `frontend/src/authz/can.ts`: `can(user, action)` con acciones tipadas (`billing.view`, `board.delete`, `group.delete`, `column.delete`, `item.delete`). Solo controla **visibilidad/UX**; el backend es la fuente de verdad.
  - Reglas UX alineadas con RBAC backend: `billing.view` → solo ADMIN/VENTAS; `item.delete` → ADMIN/VENTAS; `group.delete`, `column.delete`, `board.delete` → solo ADMIN (botones ocultos para el resto).
  - Uso: `App.tsx` usa `can(currentUser, 'billing.view')` para mostrar/ocultar vista y pestaña de Facturación; `BoardGroup.tsx` oculta botón y diálogo "Eliminar grupo" y opción "Eliminar" en menú de columna según permiso; `BoardContainer.tsx` oculta botón "Eliminar" del toolbar de selección múltiple de ítems y guard defensivo en confirmación.

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
- La UX móvil/PWA consolidó navegación principal con bottom navigation (Inicio/Calendario/Docs) y un Hub de Docs (Explorar/Crear) optimizado para scroll en iOS/Safari.
- Se corrigió la aplicación de temas en móvil: el layout móvil dejó de forzar `bg-black/text-white` y ahora consume los tokens del sistema de temas (`--monday-bg/surface/text/border/hover/pill`) vía clases semánticas (`bg-monday-bg`, `bg-white`, `text-monday-text`, etc.), alineando `header` y `bottom nav` con `data-theme` (light/dark/night/dawn/fog/plum/ember).
  - Añadir logging estructurado (JSON) y niveles (`info`, `warn`, `error`).
  - Instrumentar tiempos de consulta de Prisma.
  - Medir número de conexiones Socket.IO activas.

#### 6.4 Camino a un Estudio “tipo Illustrator” (en pausa)

La pestaña **Estudio** fue eliminada de la aplicación por no cumplir con los estándares deseados. La siguiente hoja de ruta queda **en pausa**; si en el futuro se recupera un editor vectorial, podría retomarse:

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

Estas fases, combinadas, acercarían un futuro Estudio a una experiencia **tipo Illustrator** centrada en el taller. **Prioridad actual:** consolidar performance/estabilidad (móvil/VPN) y cerrar pendientes del editor/PDF antes de retomar funcionalidades de diseño vectorial.

#### 6.5 Automatización ligera de despliegues (Git + script en servidor)

Como mejora operativa inmediata, se implementará en breve un **script de despliegue en el servidor** que:

- Ejecutará `git pull` sobre la rama principal del repositorio.
- Aplicará las migraciones de Prisma sobre PostgreSQL (`prisma migrate deploy`).
- Reconstruirá los artefactos necesarios (`npm run build` en backend/frontend, según aplique).
- Reiniciará los procesos de backend/frontend de forma controlada.

Este enfoque mantiene un flujo sencillo (desarrollo en cualquier PC → `git push` → ejecución manual del script en el servidor), pero reduce drásticamente el riesgo de errores humanos durante las actualizaciones.

#### 6.6 Checklist recomendado (sábado, PC servidor)

Checklist operativo para dejar la app estable en el equipo que actuará como servidor:

1. **Preparación del servidor**
   - Instalar Node.js LTS y dependencias del repo (`npm install` en backend/frontend).
   - Instalar `cloudflared` y validar versión (`cloudflared --version`).
2. **Arranque local de servicios**
   - Backend en `3001` y frontend en `517x` (con HTTPS dev si aplica).
   - Verificar rutas críticas: `/api/health` (o endpoint equivalente), carga de app y socket.
3. **Cloudflare Tunnel (dominio fijo)**
   - Completar `cloudflared tunnel login` (requiere zona Cloudflare en estado **Active**).
   - Crear túnel nombrado, enrutar DNS (`sunday.<dominio>`) y apuntar a frontend local.
   - Confirmar acceso público desde red externa (móvil con datos).
4. **PWA / iOS**
   - Instalar PWA **solo** desde el dominio fijo (evitar IP LAN o URLs temporales para instalación final).
   - Si existían instalaciones previas con otro origen: eliminar acceso directo y reinstalar.
   - Verificar icono correcto, apertura standalone y deep-link de notificaciones.
5. **Persistencia y operación**
   - Dejar backend, frontend y túnel como procesos persistentes (servicio/tarea programada/PM2).
   - Documentar comandos de reinicio y contingencia (caída de túnel, cambio de IP local, reinicio de host).

---

### 7. Edge Cases y Riesgos Remanentes

- **Navegador integrado (Browser) — retirado**:
  - Se retiró por limitaciones estructurales de iframes/CSP en sitios modernos (Google/WhatsApp, etc.). No es un riesgo vigente; el “riesgo” se considera cerrado al eliminar la funcionalidad.

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

- **Editor master de plantillas (fuente/tamaño) — incidencia abierta**:
  - En el flujo de edición del **Master de plantillas** se detectó comportamiento intermitente/no funcional en los controles de **Fuente** y **Tamaño de fuente** (popover no abre o no aplica cambios de forma consistente en ciertos estados de selección/foco).
  - Impacto: dificulta la edición tipográfica global del master (layout/estilos) aun cuando el guardado de configuración y la carga de plantillas funcionan.
  - Acción recomendada: mantener esta incidencia en seguimiento QA (desktop + móvil), validar interacción con estados de foco/selección de caja y cubrir con pruebas E2E del flujo “abrir master → cambiar fuente/tamaño → guardar → recargar → verificar persistencia”.

- **Parpadeo crítico de la UI (especialmente en móvil)** — corregido:
  - Se ha introducido un estado de arranque (`isBootstrapping`) en `App.tsx` que espera a que se carguen `currentUser`, workspaces y boards antes de montar las vistas pesadas en móvil.  
  - Mientras dura el bootstrap se muestra una pantalla de carga única y se ocultan `MobileBoardHeader`, FAB y `BottomNav`, evitando los cambios encadenados de `activePage`/`activeBoardId` y el parpadeo entre distintas pantallas.  
  - El comportamiento de navegación y sockets se mantiene intacto una vez finaliza el bootstrap.

- **Zoom involuntario en móvil tras login (iOS/Safari)** — corregido:
  - Síntoma: al enfocar inputs con tipografía <16px, Safari aplica zoom; al hacer login, el zoom puede persistir en la siguiente vista.
  - Mitigación aplicada: inputs del login usan `text-[16px]` en móvil (con `sm:text-[14px]` para desktop) y se fuerza `blur()` del elemento activo al enviar el formulario.

- **Edición de plantilla PDF en móvil (subvista embebida en Docs) — legibilidad y flujo** — mitigado:
  - Se eliminó el modal/drawer superpuesto y se movió la edición a una subvista interna de Docs con botón de cierre explícito; además, se ajustó el tamaño de preview en Explorar para coincidir con Crear.
  - Riesgo remanente: completar QA en dispositivos físicos (iOS Safari / Android Chrome) para confirmar confort en sesiones largas y descartar edge cases de teclado/safe-area en barras del sistema atípicas.

**Estado del plan RBAC (marzo 2026):**
- **Fase 1 (REST brechas críticas):** Completa — `/api/my-work` y `/api/search` con `authenticateToken` y filtrado por usuario.
- **Fase 2 (Middleware REST):** En progreso — `requireRoles` en auth; aplicado a DELETE workspaces/boards/items; pendiente extender a rutas de facturación y otras escrituras sensibles.
- **Fase 3 (Socket.IO):** Completa — RBAC por evento (`withSocketRoles`), `action_denied`, endurecimiento por columna en `update_column_value`, `authorId` forzado desde JWT en `add_update`.
- **Fase 4 (Frontend guards UX):** Completa — `can(user, action)` en `authz/can.ts`; Facturación y botones de eliminar (tablero/grupo/columna/ítem) ocultos según rol.

---

### Roadmap Mobile V6 — Resumen de cambios (20 marzo 2026)

Implementación completa del plan "Roadmap Mobile V6". Cambios aplicados:

| Área | Cambio | Archivos |
|------|--------|----------|
| Menú "Más" móvil | Eliminado el sub-menú "Ir a" con los atajos de Bandeja y Notificaciones (ya accesibles desde la barra inferior) | `MobileMoreDrawer.tsx` |
| Bandeja / Notificaciones | Separadas en componentes independientes (`InboxPage`, `NotificationsPage`) eliminando la página unificada `BandejaUnificadaPage` del flujo móvil | `App.tsx` |
| Deep-link notificación → Bandeja | Al hacer clic en una mención desde `NotificationsPage`, la app navega a `InboxPage` con `initialPostId` para hacer scroll/highlight al post concreto | `App.tsx`, `InboxPage.tsx`, `NotificationsPage.tsx` |
| Docs — grupos minimizados en móvil | Al entrar a la pantalla Docs en móvil, todos los grupos de tipos y grupos personalizados quedan colapsados por defecto (se expanden on-demand) | `DocsPage.tsx` |
| Foto de perfil persistente | Campo `avatarUrl` en el modelo `User` de Prisma; endpoint `PATCH /api/users/:id/avatar` con Multer; UI de cámara/previsualización en `UserPanel.tsx`; `updateAvatar()` en `UserContext` | `schema.prisma`, `index.ts`, `UserPanel.tsx`, `UserContext.tsx`, `types/index.ts` |
| Etiquetas Info en panel de detalle | Corrección de fallbacks y manejo del tipo de columna `folio` en `ItemDetailsPanel` | `ItemDetailsPanel.tsx` |
| Visibilidad de columnas por rol | `BoardContainer` oculta "Estado Taller" a no-TALLER, y "Estado Facturación" / `billing_docs` a roles sin permiso `billing.view` | `BoardContainer.tsx` |
| Ícono PWA definitivo | Script `generate-pwa-icons.mjs` genera assets `icon-192.v6.png`, `icon-512.v6.png` y `apple-touch-icon-180x180.png` desde SVG fuente; bump a `sunday-cache-v7` en service worker; `prebuild` en `package.json` para automatizar | `sw.js`, `generate-pwa-icons.mjs`, `package.json`, `manifest.webmanifest` |

---

### Bugs críticos corregidos — 20 marzo 2026

#### Bug 1: Interfaz móvil no carga — "pantalla completa de color"

- **Síntoma**: En móvil la app no cargaba y se mostraba una pantalla de fondo sólido de color (fondo del tema o pantalla de Login morado oscuro `#1a0828`).
- **Causa raíz**: El plugin `@vitejs/plugin-basic-ssl` (`basicSsl()`) fue añadido al `vite.config.ts` como parte del Roadmap V6 (commit `0575800c`, 19 marzo). Esto cambió el servidor Vite de HTTP (`http://192.168.100.8:5173`) a HTTPS con certificado auto-firmado (`https://192.168.100.8:5173`).
  - El certificado auto-firmado **no es confiable** por defecto en Safari iOS: el navegador bloqueaba los módulos JS del servidor Vite. Solo cargaban el HTML y el CSS del caché del Service Worker → el usuario veía únicamente el color de fondo del tema aplicado por CSS (`body { background-color: var(--monday-bg) }`).
  - Adicionalmente, al cambiar de origen (HTTP → HTTPS), los tokens de sesión guardados en `localStorage` bajo el origen HTTP dejaban de ser accesibles → `currentUser = null` → se mostraba la pantalla de Login con su fondo morado (`bg-[#1a0828]`).
- **Corrección**: Se eliminó `basicSsl()` y su import de `vite.config.ts`. El servidor Vite vuelve a servir en HTTP para acceso LAN. El HTTPS sigue disponible vía **Cloudflare Tunnel** (que termina TLS con certificado válido de Cloudflare) y es la vía recomendada para instalar la PWA y para acceso externo.
- **Archivo**: `frontend/vite.config.ts`

#### Bug 2: Crash total de Safari iOS al hacer clic en notificación de elemento

- **Síntoma**: Al hacer clic en una notificación de asignación en la pestaña Notificaciones, la app navegaba al tablero pero crasheaba completamente (pestaña Safari requería cerrarse y reabrir).
- **Causa raíz**: Conflicto de `layoutId` en Framer Motion.
  - `BoardGroup.tsx` (vista kanban móvil) asignaba `layoutId=\`item-${item.id}\`` a cada tarjeta de elemento, habilitando la animación "morph" de tarjeta → panel.
  - `ItemDetailsPanel.tsx` (modo sheet móvil) usaba el **mismo** `layoutId=\`item-${item.id}\`` en su `motion.div` envolvente.
  - Al hacer clic en una notificación, `setActivePage('board')` y `setSelectedItem(item)` se llamaban **simultáneamente**: el `ItemDetailsPanel` montaba (con su `layoutId`) al mismo tiempo que el `BoardContainer` cargaba y `BoardGroup.tsx` renderizaba las tarjetas (con el mismo `layoutId`). Framer Motion detectaba dos elementos activos con el mismo `layoutId` y entraba en un ciclo de medición de layout que colapsaba el hilo principal de Safari iOS.
- **Corrección**: Se eliminó `layoutId` de ambos componentes:
  - `ItemDetailsPanel.tsx`: quitado `layoutId` del objeto `wrapperProps` en el modo sheet. El panel mantiene su animación de entrada vía CSS (`panel-slide-in`) y el gesto de swipe para cerrar.
  - `BoardGroup.tsx`: quitado `layoutId` del `motion.div` de las tarjetas kanban.
- **Archivos**: `frontend/src/components/Board/ItemDetailsPanel.tsx`, `frontend/src/components/Board/BoardGroup.tsx`

---

### 8. Conclusión

Sunday presenta una arquitectura moderna basada en React + Node.js + PostgreSQL, con un diseño orientado a trabajo en tiempo real (Sockets) y una cuidadosa transición desde modelos legacy a JSONB.  
La documentación de instalación local y servidor se centraliza en los **README** del repositorio y en `docs/DEV_SETUP_POSTGRES.md`, alineada con PostgreSQL nativo en Windows para el equipo servidor.  
Las capas de seguridad (bcrypt + JWT + middlewares) y la segmentación de tráfico por rooms sientan las bases para operación segura en entornos LAN/VPN/móviles.  
Las siguientes fases de ingeniería (optimización de sockets, endurecimiento de consultas Prisma y hardening de seguridad/event loop) permitirán escalar el sistema manteniendo una experiencia fluida para los usuarios finales.

