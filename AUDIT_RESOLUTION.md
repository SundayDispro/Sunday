# Resolución auditoría de seguridad — Sunday v0.9.8

**Fecha:** 2026-04-09

## Tabla de hallazgos

| ID | Descripción breve | Acción tomada | Archivos principales | Estado |
|----|-------------------|---------------|----------------------|--------|
| **CRÍTICO** | jsPDF en npm audit | Sanitización de texto de usuario antes de `jsPDF`/`splitTextToSize`; nombre de PDF en vista previa acotado; `npm audit fix` sin `--force` (el informe ya no reporta jsPDF crítico tras dependencias actualizadas). | `frontend/src/utils/sanitizePdfText.ts`, `CotizacionPage.tsx`, `DocsPdfPreviewPage.tsx`, `frontend/package.json` | **RESUELTO** |
| **H1** | GET `/api/boards/:id` sin ACL por usuario | Comentario `SECURITY-ACCEPTED-RISK` (app interna, sin membresía en Prisma). | `backend/src/index.ts` | **RIESGO-ACEPTADO** |
| **H2** | `join_board` sin permisos por board | Comentario `SECURITY-ACCEPTED-RISK` alineado con H1. | `backend/src/index.ts` | **RIESGO-ACEPTADO** |
| **H3** | GET `/api/items/:itemId/updates` sin pertenencia | Comentario `SECURITY-ACCEPTED-RISK` alineado con H1. | `backend/src/index.ts` | **RIESGO-ACEPTADO** |
| **H4** | `dangerouslySetInnerHTML` sin sanitizar | `DOMPurify.sanitize()` en HTML; dependencia explícita `dompurify`. | `DocsPage.tsx`, `frontend/package.json` | **RESUELTO** |
| **H5** | JWT en localStorage | Comentarios `SECURITY-ACCEPTED-RISK` (Tailscale/red privada) en `UserContext.tsx` y `getAuthToken` en `api.ts`. | `frontend/src/store/UserContext.tsx`, `frontend/src/api.ts` | **RIESGO-ACEPTADO** |
| **M1** | Rate limit solo en login | `apiGlobalRateLimiter` (200 req / 15 min) en `/api`; `loginRateLimiter` intacto. | `backend/src/index.ts` | **RESUELTO** |
| **M2** | `/uploads` sin auth | Comentario `SECURITY-ACCEPTED-RISK` (nombres timestamp+random). | `backend/src/index.ts` | **RIESGO-ACEPTADO** |
| **M3** | `express.json` 25mb global | `1mb` por defecto; `25mb` solo en rutas con payloads grandes (docs, diseños, generate, panel-notes, doc-groups). | `backend/src/index.ts` | **RESUELTO** |
| **M4** | `ALLOW_TRYCLOUDFLARE_ORIGINS` | Comentario: desactivado por defecto; no usar en producción salvo depuración. | `backend/src/index.ts` | **RESUELTO** |
| **M5** | CORS sin `Origin` | En producción, `!origin` → `callback(null, false)`. | `backend/src/index.ts` | **RESUELTO** |
| **M6** | Multer expone `err.message` | Mensaje genérico "Error al procesar el archivo"; detalle en consola; `MulterFileRejectedError` en fileFilter; manejo en handler global y rutas `/api/upload` y avatar. | `backend/src/index.ts` | **RESUELTO** |
| **M7** | npm audit | `npm audit fix` en backend y frontend. Quedan hallazgos sin parche (fabric/jsdom/xlsx, etc.). | `package-lock.json` (ambos) | **PENDIENTE-MANUAL** |
| **M8** | `backend/backups/` en Git | Entrada en `.gitignore`. | `.gitignore` | **RESUELTO** |
| **M9** | `sqlite3` en dependencias | Sin uso en `backend/src/`; `npm uninstall sqlite3`. Script legacy `scripts/exportSqliteToJson.ts` excluido de `tsc` (no compila sin sqlite3). | `backend/package.json`, `backend/tsconfig.json` | **RESUELTO** |
| **B1** | Mensajes de error en inglés | `res.status(4xx/5xx)` en `index.ts` unificados a español o mensajes genéricos donde aplicaba. | `backend/src/index.ts` | **RESUELTO** |
| **B2** | Helmet | Comentario: cabeceras en Nginx; no se añade `helmet` en Node. | `backend/src/index.ts` | **RIESGO-ACEPTADO** |
| **B3** | `/api/internal/feed/system-message` loopback | Comentario de verificación + Nginx no debe exponer `/api/internal/*`. | `backend/src/index.ts` | **RESUELTO** |
| **B4** | Comportamiento verificado | `SECURITY-VERIFIED` en bcrypt/contraseñas. | `backend/src/auth.ts` | **RESUELTO** |
| **B5** | Comportamiento verificado | `SECURITY-VERIFIED` en verificación JWT. | `backend/src/auth.ts` | **RESUELTO** |
| **B6** | Comportamiento verificado | `SECURITY-VERIFIED` en token de exportación PDF. | `backend/src/auth.ts` | **RESUELTO** |
| **B7** | Puertos en documentación | README ya indica backend **3001** y Vite **5173**; sin cambios. | `README.md` | **NO-APLICA** |

## Cambios que requieren acción manual post-deploy

1. **npm audit residual (frontend):** dependencias transitivas (`fabric` / `jsdom`, `xlsx`, etc.) sin `npm audit fix` automático completo. Revisar actualizaciones mayores de `fabric`/`xlsx` cuando sea posible.
2. **`npm audit fix --force` (frontend):** no se ejecutó para `esbuild` (cambio breaking sugerido por auditoría). Evaluar en entorno de prueba antes de forzar.
3. **Script legacy `scripts/exportSqliteToJson.ts`:** si se necesita ejecutar, instalar `sqlite3` en local o restaurar como dependencia opcional solo para ese script.
4. **Producción CORS sin `Origin`:** peticiones sin cabecera `Origin` quedan rechazadas; validar que no haya integraciones legítimas (curl, herramientas) que dependan de ello.
5. **Carpeta `backend/backups/`:** si ya estaba versionada, seguir en Git el historial; el `.gitignore` evita nuevos commits. Opcional: `git rm -r --cached backend/backups` si se desea dejar de trackear archivos ya existentes.

## Build status

| Paquete | Comando | Resultado |
|---------|---------|-----------|
| Backend | `npm run build` (en `backend/`) | OK (TypeScript + `build:document-view`) |
| Frontend | `npm run build` (en `frontend/`) | OK (`tsc` + Vite) |

## Notas críticas jsPDF / `--force`

- No fue necesario `npm audit fix --force` para el frontend: tras `npm audit fix` y el uso de `dompurify` + sanitización de texto, el informe actual no marca el hallazgo crítico de jsPDF anterior.
- Si en otro entorno `npm audit` sigue marcando jsPDF, repetir `npm audit fix` y, solo si falla el build, documentar y no aplicar `--force` sin revisión.
