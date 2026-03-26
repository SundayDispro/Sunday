# Auditoría / checklist lanzamiento v1.0

## Funcional

- [ ] Login y sesión (expiración JWT, mensaje coherente).
- [ ] Toasts en error de API y sin red.
- [ ] Borrar ítem en móvil (swipe): undo y confirmación final al expirar toast.
- [ ] Notificaciones: paginación, “Cargar más”, marcar leídas.
- [ ] Campana: contador + punto verde si hay no leídas &lt; 2 min.
- [x] `Ctrl/Cmd+K`: abrir paleta, buscar elementos del tablero activo, navegar y filtrar temas con `/temas` (y acciones con `/` o `/acciones`).
- [ ] Multi-selección: estado y persona masivos.
- [ ] Socket: indicador en rail refleja desconexión (p. ej. modo avión / backend caído).

## Accesibilidad / UI

- [ ] Modales Radix: foco atrapado; botón destructivo no recibe foco inicial si aplica.
- [ ] Toasts con `aria-live`.

## Rendimiento

- [ ] Tablero grande: skeleton no bloquea interacción innecesariamente.

---

## Actualización marzo 2026 (UX premium — parcial)

Implementado en esta iteración:

- **Paleta de comandos** modo terminal (`CommandPalette.tsx`), integración con búsqueda global vía `sessionStorage` (`sunday-search-prefill`) y `SearchPage`.
- **Backend**: campo `User.preferences` (JSON) y `PATCH /api/users/me` para sincronizar tema; migración `20260326120000_user_preferences`.
- **Desktop**: panel de detalle de ítem **embebido** (480px) junto al `main`, sin overlay de pantalla completa; `ItemDetailsPanel` con `embedded`.
- **Notificaciones**: `NotificationDropdown` en el rail; campana con pestañas y marcar todo.
- **Tablero**: debounce 300ms en filtro local; chips de filtros activos bajo la toolbar.
- **Global**: `AppTooltipProvider`, `scroll-behavior: smooth`, `::selection`, transición de tema 200ms en `[data-theme]`, carga diferida de `DocsPage` (`React.lazy` + `Suspense`).
- **Pendiente** respecto al brief completo: virtualización masiva (`@tanstack/react-virtual`), ContextMenu en filas, resize de columnas, Kanban layoutId exhaustivo, pull-to-refresh móvil, haptics, bottom sheet snap points, auditoría completa de `focus-visible` / `aria` en todos los íconos.
