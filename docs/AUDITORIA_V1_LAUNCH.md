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
