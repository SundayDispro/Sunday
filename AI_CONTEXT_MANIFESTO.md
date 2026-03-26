# AI Context Manifest — Sunday (v3.0)

Este documento resume la arquitectura y el estado operativo de Sunday. La **fuente de verdad detallada** es `SUNDAY_TECHNICAL_AUDIT.md`; aquí se condensan invariantes útiles para asistentes y desarrolladores.

**Última revisión:** marzo 2026 (alineado con `backend@1.0.0`, Prisma 5, Express 5, React 19, Vite 7).

---

## 1. Arquitectura de Infraestructura y Red

### 1.1 Topología híbrida (LAN + VPN + móvil)
- **Servidor central**: Node.js + **Express 5**, puerto **3001** (HTTP + Socket.IO sobre el mismo `httpServer`).
- **Clientes**: PCs en LAN (`http://192.168.x.x:5173`), VPN y PWA móvil; Vite en dev actúa como proxy hacia `/api`, `/uploads`, `/socket.io`.
- **Vite** (`frontend/vite.config.ts`): proxy a `localhost:3001` para unificar origen y evitar CORS en desarrollo. En producción, `VITE_API_URL` apunta al backend cuando no hay proxy.

### 1.2 Persistencia y event loop
- **Base de datos**: **PostgreSQL** (Prisma `provider = "postgresql"`). Coexistencia **legacy string JSON + campos sombra JSONB** (`*Json`) en varios modelos.
- **Riesgo de bloqueo**: operaciones síncronas pesadas (`fs.copyFileSync` en exportación, Puppeteer). Mitigación aplicada: **worker** para generación PDF principal (`pdfWorker.ts`); revisar `SUNDAY_TECHNICAL_AUDIT.md` §1.4.

---

## 2. Frontend (React 19 + Vite 7)

### 2.1 Estado y navegación
- **Sin react-router**: navegación por estado (`activePage`, etc.) en `App.tsx`.
- **Responsive**: `matchMedia`, `ResizeObserver`, tema persistente, bootstrap de carga en móvil para evitar parpadeos.

### 2.2 Socket.IO cliente
- **Singleton** en `frontend/src/store/socket.ts`.
- **Rooms en servidor**: el cliente emite `join_board` / `leave_board`; el servidor une a `board:<boardId>`. Con JWT válido en el handshake, el servidor une a **`user:<userId>`** para notificaciones y comentarios dirigidos (no broadcast global de esos eventos).
- Listeners en `useEffect` con `socket.off` al desmontar.

---

## 3. Motor PDF WYSIWYG

- **Build**: `esbuild` → `backend/dist/documentViewBundle.cjs` desde `renderDocumentToHtml.tsx`.
- **Editor**: cajas con **contentEditable** (`PdfTemplateEditor`); flujo principal de **descarga 1:1** en cliente: preview → `html2canvas` + `jsPDF` (US Letter).
- **Backend**: `POST /api/templates/:kind/generate` y worker para otros usos; fuentes Averta Std en `backend/assets/fonts`.

---

## 4. Seguridad y autenticación

- **JWT**: header `Authorization: Bearer`. El backend **no arranca** sin `JWT_SECRET` en `.env` (`backend/src/auth.ts`).
- **Contraseñas**: **bcrypt**, rondas vía `BCRYPT_ROUNDS` (p. ej. 12).
- **Middlewares**: `attachUserFromJwt`, `authenticateToken`, `requireAuth`, `requireAdmin`, `requireRoles([...])` (ADMIN con bypass).
- **Socket.IO**: JWT en `handshake.auth`; RBAC por evento (`withSocketRoles`), `action_denied`, reglas por columna en `update_column_value`, `authorId` desde JWT en `add_update`.

---

## 5. Reglas de negocio (resumen)

- **Taller → Facturación**: al marcar **Estado Taller** = `colocado`, el servidor crea/usar **Estado Facturación** y valor inicial (ver `update_column_value` en `backend/src/index.ts`).
- **Exportación de carpetas**: salida bajo `~/SundayExports`; sincronización condicionada a asignación (columna `person`).
- **Web Push**: `PushSubscription` + `sendWebPushToUser`; deep-link a bandeja de notificaciones cuando aplica.

---

## 6. Estado de implementación (marzo 2026)

| Característica | Estado | Notas |
|----------------|--------|--------|
| **Tableros en tiempo real** | ~100% | Rooms por tablero + usuario; refinamiento (throttle, menos fallbacks). |
| **Editor / PDF** | ~95% | Flujo 1:1 cliente consolidado; edge cases y server-side según auditoría. |
| **Seguridad JWT + RBAC** | Alto | JWT obligatorio en arranque; REST + sockets endurecidos; revisar rutas nuevas. |
| **PostgreSQL + Prisma 5** | Producción | Esquema actual en `schema.prisma`; migraciones en repo. |
| **Modo móvil / PWA** | ~88% | Micro-editor embebido, temas, push; QA campo y offline pendientes donde aplique. |
| **Paleta Ctrl/Cmd+K** | 100% | Autocompletado de comandos con `Tab` y ejecución con `Enter`. |
| **Temas** | 100% | Sidebar rápido + lista extendida; sync de tema vía `PATCH /api/users/me` (campo `preferences` JSONB) con debounce. `manifest.webmanifest` y `theme_color` alineados al tema base. |
| **Rail izquierdo colapsable (40px)** | 100% | Persistido en `localStorage` y con micro-UX: iconos compactos, avatar sin recorte y notificaciones en modo compacto. |
| **Rail — reorganización visual** | 100% | Logo arriba; selector de tema; “EN LÍNEA” debajo; botón de colapsar justo encima del ícono de usuario. |
| **Widgets Docs premium (Tareas/Recordatorios)** | ~90-95% | Estilo sticky/agenda: menos “chrome” (filas sin celdas/bordes fuertes), más compacto y con hover suave. |
| **Widgets Docs premium (Calculadora)** | ~95-100% | Secciones internas (display + IVA) como controles tarjeta sin contornos que parezcan tabla. |

*Cualquier cambio estructural debe reflejarse aquí y en `SUNDAY_TECHNICAL_AUDIT.md`.*
