# AI Context Manifest — Sunday (v2.2)

Este documento es una radiografía técnica de Sunday. Define la arquitectura, los patrones de diseño y el estado de la infraestructura para garantizar un desarrollo coherente en un entorno multi-usuario.

---

## 1. Arquitectura de Infraestructura y Red

### 1.1 Topología Híbrida (LAN + VPN + Mobile)
- **Servidor Central**: Node.js (Express 5) ejecutándose en un PC de la oficina (Puerto 3001).
- **Clientes Locales**: 6 PCs accediendo vía `http://192.168.x.x:5173`.
- **Clientes Remotos**: 1 PC vía VPN y múltiples dispositivos móviles.
- **Vite Proxy**: El frontend utiliza un proxy inverso (`vite.config.ts`) para que las peticiones a `/api`, `/uploads` y `/socket.io` parezcan del mismo origen, evitando problemas de CORS en redes locales.

### 1.2 Persistencia y Event Loop
- **Base de Datos**: PostgreSQL en uso con Prisma (la transición SQLite→Postgres fue parte de la evolución del sistema).
- **Riesgo de Bloqueo**: La exportación realiza muchas operaciones de I/O en disco y la generación de PDFs usa Puppeteer. Aunque el PDF se ejecuta dentro de `worker_threads` (reduce el bloqueo del event loop principal), en picos de multiusuario pueden aumentar CPU/latencia y colas internas; además, `/api/export/folders` no tiene limitador/cola de concurrencia, así que varias exportaciones simultáneas compiten por disco.
- **Estrategia de Datos**: Uso extensivo de campos **JSON** en tablas de Prisma (`customBoxes`, `fieldPositions`) para configuraciones dinámicas.

---

## 2. Radiografía del Frontend (React 19)

### 2.1 Gestión de Estado y Navegación
- **Ruteo Virtual**: No se usa `react-router`. La navegación es manejada por el estado `activePage` en `App.tsx`.
- **Optimización de UI**: Uso de `ResizeObserver` y `matchMedia` para detectar cambios entre escritorio y móvil en tiempo real.
- **Debouncing de Persistencia**: Las notas personales (`panel-notes`) usan un timeout de 500ms antes de sincronizar con el backend para reducir el tráfico en la VPN.

### 2.2 Sincronización de Sockets (Socket.IO Cliente)
- **Patrón Singleton**: El socket se exporta como un objeto único desde `store/socket.ts`.
- **Ciclo de Vida**: Los componentes registran listeners en `useEffect` y **deben** limpiar (`socket.off`) para evitar fugas de memoria.
- **Rooms (Estado Actual)**: `join_board` y `leave_board` ya segmentan el tráfico por tablero. El handshake de Socket.IO también intenta unir a un `user:<userId>` room para notificaciones/comentarios cuando hay JWT.

---

## 3. Motor de Generación de PDF WYSIWYG

### 3.1 Pipeline de Build
- **Bundle Compartido**: `backend/dist/documentViewBundle.cjs`. Se genera mediante `esbuild` a partir de `renderDocumentToHtml.tsx` y expone una función para construir el HTML del documento.
- **Renderizado / Export (descarga)**: el endpoint `POST /api/templates/:kind/generate`:
  - guarda el contenido en caché (`exportContentCache`) y firma un token de exportación,
  - intenta una captura 1:1 de `/docs/export` con Puppeteer a 300/96,
  - si falla, usa `generatePdfFromDocument` en worker (raster 300 dpi),
  - y si también falla, cae a `generatePdfFromTemplate` (fallback vectorial). El backend informa el camino en `X-PDF-Method`.
- **Renderizado / Export (1:1 en cliente)**: la ventana de preview usa `html2canvas` + `jsPDF` para “Guardar como PDF”.
- **Unidades Físicas**: Uso estricto de `pt` (puntos) para evitar la ambigüedad de los píxeles en impresión (1pt = 1/72 pulgada).

### 3.2 El Problema del Box-Model
- **Discrepancia**: El editor usa cajas posicionadas y edición con `contentEditable` (mismo modelo geométrico) mientras el PDF se genera renderizando HTML en un motor de navegador (Puppeteer) y luego capturando a PNG/PDF.
- **Solución / Mitigación**: Mantener un sistema geométrico unificado (mismas `customBoxes`, `fieldPositions` y tamaños en `pt`) para minimizar desalineaciones, y usar worker/raster con escala controlada (300 DPI efectivos).

---

## 4. Seguridad y Autenticación (Estado Actual)

- **Identidad**: JWT en `Authorization: Bearer ...`. El backend adjunta `req.authUser` con `attachUserFromJwt` y fuerza autenticación con `authenticateToken` / `requireAuth` / `requireAdmin`.
- **Criptografía**: Uso de **bcrypt** configurable por `BCRYPT_ROUNDS` (default 12) para hashear contraseñas.
- **RBAC + Socket Hardening**: guardas por rol (`requireAdmin`, `requireRoles`) y eventos de Socket.IO endurecidos con `withSocketRoles` para evitar escrituras no autorizadas.

---

## 5. Reglas de Negocio Embebidas

- **Trigger Taller -> Facturación**: En `backend/src/index.ts`, al recibir un evento de socket que marca un ítem como `'colocado'`, el servidor dispara una lógica secundaria que crea la columna `'Estado Facturación'` si no existe.
- **Exportación de Carpetas**: Estructura de salida en `~/SundayExports`. Sincroniza archivos solo si el usuario está asignado al ítem (columna tipo `person`).
- **Plantillas PDF (base + configuración)**: el fondo base vive en `backend/templates/<kind>.pdf`; las cajas/estilos se resuelven desde la DB vía `TemplateConfig` (`GET /api/templates/:kind/config` y `PUT /api/templates/:kind/config`).

---

## 6. Estado de Implementación (Marzo 2026)

| Característica | Estado | Notas |
|--- |--- |--- |
| **Tableros en tiempo real** | 100% | Funcional vía Sockets; segmentación por `board:<boardId>` y rooms de usuario en gran parte del flujo. |
| **Editor de PDF** | 95% | Export 1:1 basado en vista de exportación (y fallback raster/worker); se mantiene afinado el layout. |
| **Seguridad JWT** | 100% | JWT validado en backend y endurecimiento en eventos Socket.IO. |
| **PostgreSQL** | 80%+ | Prisma y schema en uso; pendiente limpieza de legacy y confirmación de cobertura total de migraciones/datos. |
| **Modo Móvil** | 95% | PWA offline implementado parcialmente vía `frontend/public/sw.js`: cachea el “shell” y assets estáticos + fallback a `index.html`, pero explícitamente no cachea `/api` ni `/socket.io`. Pendiente: estrategia de caché más granular para datos dinámicos y QA en escenarios offline más agresivos. |

*Este manifiesto es la fuente de verdad técnica. Cualquier cambio estructural debe reflejarse aquí.*
