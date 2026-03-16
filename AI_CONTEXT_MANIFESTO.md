# AI Context Manifest — Sunday (v2.0)

Este documento es una radiografía técnica de Sunday. Define la arquitectura, los patrones de diseño y el estado de la infraestructura para garantizar un desarrollo coherente en un entorno multi-usuario.

---

## 1. Arquitectura de Infraestructura y Red

### 1.1 Topología Híbrida (LAN + VPN + Mobile)
- **Servidor Central**: Node.js (Express 5) ejecutándose en un PC de la oficina (Puerto 3001).
- **Clientes Locales**: 6 PCs accediendo vía `http://192.168.x.x:5173`.
- **Clientes Remotos**: 1 PC vía VPN y múltiples dispositivos móviles.
- **Vite Proxy**: El frontend utiliza un proxy inverso (`vite.config.ts`) para que las peticiones a `/api`, `/uploads` y `/socket.io` parezcan del mismo origen, evitando problemas de CORS en redes locales.

### 1.2 Persistencia y Event Loop
- **Base de Datos**: Transición de SQLite a PostgreSQL.
- **Riesgo de Bloqueo**: Operaciones síncronas de sistema de archivos (`fs.copyFileSync` en exportación) y procesos pesados (`Puppeteer`) pueden bloquear el Event Loop de Node, congelando la app para los 7 usuarios.
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
- **Rooms (Objetivo)**: Implementar `join_board` y `leave_board` para segmentar el tráfico por tablero y no saturar a los usuarios móviles.

---

## 3. Motor de Generación de PDF WYSIWYG

### 3.1 Pipeline de Build
- **Bundle Compartido**: `backend/dist/documentViewBundle.cjs`. Se genera mediante `esbuild` a partir de `renderDocumentToHtml.tsx`.
- **Renderizado Server-Side**: El backend usa `require()` sobre este bundle para ejecutar `renderToString()` de React, garantizando que el PDF use el mismo árbol de componentes que el editor.
- **Unidades Físicas**: Uso estricto de `pt` (puntos) para evitar la ambigüedad de los píxeles en impresión (1pt = 1/72 pulgada).

### 3.2 El Problema del Box-Model
- **Discrepancia**: El editor usa `<textarea>` (con métricas de navegador) y el PDF usa `<div>`.
- **Solución**: Migrar el editor a un sistema basado en `div` con `contentEditable` para que el padding y line-height sean 100% predecibles.

---

## 4. Seguridad y Autenticación (Plan Fase A)

- **Identidad**: Migración de IDs en el body a **JWT (JSON Web Tokens)** en los headers (`Authorization: Bearer`).
- **Criptografía**: Uso de **bcrypt** (12 rounds) para el hasheo de contraseñas.
- **Middleware**: Implementación de `authMiddleware` en Express para inyectar `req.user` en todas las rutas protegidas.

---

## 5. Reglas de Negocio Embebidas

- **Trigger Taller -> Facturación**: En `backend/src/index.ts`, al recibir un evento de socket que marca un ítem como `'colocado'`, el servidor dispara una lógica secundaria que crea la columna `'Estado Facturación'` si no existe.
- **Exportación de Carpetas**: Estructura de salida en `~/SundayExports`. Sincroniza archivos solo si el usuario está asignado al ítem (columna tipo `person`).

---

## 6. Estado de Implementación (Marzo 2026)

| Característica | Estado | Notas |
|--- |--- |--- |
| **Tableros en tiempo real** | 100% | Funciona vía Sockets; falta segmentación por Rooms. |
| **Editor de PDF** | 90% | Funcional, pero con ligeras desalineaciones por Box-Model. |
| **Seguridad JWT** | 20% | Planificado en Fase A; token almacenado pero no validado aún. |
| **PostgreSQL** | 10% | Esquema preparado; falta migración física de datos. |
| **Modo Móvil** | 80% | Optimizado; falta pulir PWA offline. |

*Este manifiesto es la fuente de verdad técnica. Cualquier cambio estructural debe reflejarse aquí.*
