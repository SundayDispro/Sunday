# Contexto móvil / PWA (Sunday v1.0)

Referencia breve para IA y desarrollo: comportamiento actual tras el pulido v1.0.

## Feedback y errores

- **Toasts** (`ToastProvider`): variantes `info`, `success`, `error`, `warning`; acción opcional (p. ej. Deshacer); barra de progreso; posición móvil arriba / desktop abajo-derecha.
- **Borrado de ítem con undo** (vista tarjeta / swipe): toast con “Deshacer”; al expirar se confirma `DELETE` + socket.
- **`apiFetch`**: errores HTTP (!ok) y fallos de red (`TypeError`) muestran toast global salvo `silent: true` en la petición.

## Notificaciones

- `GET /api/notifications` devuelve `{ items, hasMore, nextSkip }` con `limit`/`skip` y filtro opcional `type`.
- Pantalla Notificaciones: agrupación por día (Hoy / Ayer / …), “Cargar más”, pestañas existentes.

## Navegación

- **Command palette**: `Ctrl/Cmd+K` — tableros y accesos rápidos (inicio, notificaciones, bandeja, búsqueda).
- **Indicador socket**: rail izquierdo (desktop) — punto verde/rojo según conexión en tiempo real.

## Tablero

- Barra de selección múltiple: **Estado** y **Asignar** masivos cuando existen columnas status/person.
- Carga inicial: skeleton en lugar de solo spinner.

## Checklist QA

Ver `docs/AUDITORIA_V1_LAUNCH.md`.
