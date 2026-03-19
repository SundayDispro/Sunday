# QA manual — Micro-editor móvil (plantillas PDF)

Checklist para validar **DocsPage** subvista embebida «Editar plantilla» en **viewport móvil** (Chrome DevTools + dispositivo real iOS/Android).

Estado de ejecución (2026-03-19):
- Entorno validado: desktop + emulación móvil (Chrome DevTools).
- Dispositivos reales: iOS Safari / Android Chrome pendientes de pasada final en hardware.

## Focus mode + barra externa

- [x] Al enfocar un cuadro `contentEditable`, aparece el dim + blur y el panel inferior de formato. *(PASS en emulación móvil)*
- [x] El texto sigue siendo editable; el cursor **no salta** al inicio al usar la barra (probar negrita/color). *(PASS)*
- [x] Si el cuadro ya tenía texto guardado, al hacer clic para editar **no se borra** su contenido. *(PASS)*
- [x] Si el texto del cuadro es blanco, en edición sigue siendo legible sobre el PDF (sin perder el color blanco final). *(PASS)*
- [x] Al salir del foco del cuadro, el panel desaparece o se atenúa según diseño actual. *(PASS)*

## Scroll y teclado

- [x] Con la subvista abierta, el **body** del documento no hace scroll de fondo (scroll lock). *(PASS)*
- [x] Con teclado virtual abierto, el panel contextual **sube** de forma razonable (`visualViewport`). *(PASS en emulación)*
- [x] Con focus mode activo, el scroll del lienzo es usable (`touch-action: pan-y` en el wrapper). *(PASS)*
- [x] Con focus mode activo, el gesto de **pinch-zoom** dentro de la subvista queda mitigado (no hace zoom accidental), pero el scroll vertical del editor sigue funcionando. *(PASS; además se conectó el `ref` del contenedor para que aplique de forma efectiva)*

## ADMIN vs no-ADMIN

- [x] Usuario no admin: barra de formato **completa** según permisos de cajas del documento. *(PASS)*
- [x] ADMIN: barra en modo **solo estilo** (sin cambios estructurales al master desde esa barra). *(PASS; sin cambios en gating `textStyleOnly` ni sanitización)*
- [x] «Master de plantillas» abre overlay; al volver al flujo normal no se pierde el flujo de emergencia de forma extraña. *(PASS)*

## Interacción de cajas

- [x] Durante arrastre/redimensión de cuadros, la interacción se siente fluida en móvil (sin “saltos” notorios), y al soltar vuelve al estado normal. *(PASS)*

## Campo fecha (overlay nativo)

- [x] Cuadro con `fieldKey === 'fecha'`: debe mostrarse **input type="date"** (selector nativo); al elegir fecha se guarda en el borrador como **DD/MM/YYYY**. *(PASS)*
- [x] Focus mode / barra externa siguen al enfocar el campo fecha. *(PASS)*

## Zoom de foco + doble gesto

- [x] Tras enfocar un cuadro, el zoom aumenta; **doble clic** en el **lienzo vacío** (no sobre texto/caja) restaura zoom auto-fit. *(PASS)*
- [x] **Doble toque** en el mismo lienzo vacío en **móvil** hace lo mismo (listener `touchend` no pasivo). *(PASS en emulación táctil)*
- [x] Al enfocar el cuadro `total` (parte baja) con zoom activo, el texto no queda tapado por barras inferiores (barra de foco / navegación Inicio-Calendario-Docs). *(PASS; se mantiene reserva inferior de scroll)*

## Borrador de emergencia (m6)

- [x] Con la subvista abierta, editar texto; **recargar** la página o cerrar pestaña; al reabrir «Editar plantilla», debe ofrecerse recuperar borrador (`sunday_draft_<docId>`). *(PASS)*
- [x] Tras **Guardar** documento PDF con éxito, la clave de borrador se elimina. *(PASS)*
- [x] Tras **Cerrar** la subvista (sin pasar solo por Master), el borrador se limpia. *(PASS)*

## Regresión rápida desktop

- [x] Edición de plantilla en vista no móvil (overview) sigue funcionando. *(PASS)*
- [x] Cuadros de `singleLine` / `folio`: no aceptan saltos de línea (Enter/paste multilinea se normaliza a una sola línea). *(PASS)*

## Pendiente en dispositivo real

- [ ] Ejecutar pasada física en **iOS Safari** con teclado nativo y barra inferior.
- [ ] Ejecutar pasada física en **Android Chrome** con teclado nativo y navegación por gestos.
- [ ] Confirmar ergonomía en sesión prolongada (>10 min) en ambos dispositivos.

---

**Referencia de código:** `DocsPage.tsx` (drawer, focus mode, draft), `PdfTemplateEditor.tsx` (lienzo y gestos), `frontend/src/utils/emergencyPdfTemplateDraft.ts`.

Decisión UX de esta fase: se implementó un enfoque de **spotlight** para focus mode en móvil. Se evaluaron dos direcciones (1) reducir/quitar blur global en todo el lienzo y (2) mantener dim+blur pero aplicarlo solo fuera de la caja activa; se eligió la segunda porque conserva foco visual sin perder referencia WYSIWYG con el PDF debajo del texto que se está editando. Para probarlo, abre «Editar plantilla» en móvil, enfoca un cuadro de texto y verifica que la zona del cuadro queda nítida con borde guía mientras el resto del lienzo mantiene atenuación; luego desplázate/zoom en focus mode y confirma que la “ventana” sigue al cuadro sin romper barra de formato, cursor ni scroll lock del drawer.
