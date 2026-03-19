# QA manual — Micro-editor móvil (plantillas PDF)

Checklist para validar **DocsPage** drawer «Editar plantilla» en **viewport móvil** (Chrome DevTools + dispositivo real iOS/Android).

## Focus mode + barra externa

- [ ] Al enfocar un cuadro `contentEditable`, aparece el dim + blur y el panel inferior de formato.
- [ ] El texto sigue siendo editable; el cursor **no salta** al inicio al usar la barra (probar negrita/color).
- [ ] Al salir del foco del cuadro, el panel desaparece o se atenúa según diseño actual.

## Scroll y teclado

- [ ] Con el drawer abierto, el **body** del documento no hace scroll de fondo (scroll lock).
- [ ] Con teclado virtual abierto, el panel contextual **sube** de forma razonable (`visualViewport`).
- [ ] Con focus mode activo, el scroll del lienzo es usable (`touch-action: pan-y` en el wrapper).

## ADMIN vs no-ADMIN

- [ ] Usuario no admin: barra de formato **completa** según permisos de cajas del documento.
- [ ] ADMIN: barra en modo **solo estilo** (sin cambios estructurales al master desde esa barra).
- [ ] «Master de plantillas» abre overlay; al volver al drawer normal no se pierde el flujo de emergencia de forma extraña.

## Modo Mapa (blueprint)

- [ ] Botón **Mapa** (icono capas): al activar, el PDF de fondo **no** debe verse y el scroll debe sentirse más fluido.
- [ ] Al desactivar Mapa, el PDF **vuelve** a renderizarse.
- [ ] Al **cerrar** el drawer, Mapa queda desactivado la próxima vez que se abre.
- [ ] Tras ~1,6 s con el drawer abierto, si el hilo principal congela un frame (~96–480 ms), puede aparecer toast y **Mapa** activarse solo (probar con CPU throttling en DevTools).

## Campo fecha (overlay nativo)

- [ ] Cuadro con `fieldKey === 'fecha'`: debe mostrarse **input type="date"** (selector nativo); al elegir fecha se guarda en el borrador como **DD/MM/YYYY**.
- [ ] Focus mode / barra externa siguen al enfocar el campo fecha.

## Zoom de foco + doble gesto

- [ ] Tras enfocar un cuadro, el zoom aumenta; **doble clic** en el **lienzo vacío** (no sobre texto/caja) restaura zoom auto-fit.
- [ ] **Doble toque** en el mismo lienzo vacío en **móvil** hace lo mismo (listener `touchend` no pasivo).

## Borrador de emergencia (m6)

- [ ] Con el drawer abierto, editar texto; **recargar** la página o cerrar pestaña; al reabrir «Editar plantilla», debe ofrecerse recuperar borrador (`sunday_draft_<docId>`).
- [ ] Tras **Guardar** documento PDF con éxito, la clave de borrador se elimina.
- [ ] Tras **Cerrar** el drawer (sin pasar solo por Master), el borrador se limpia.

## Regresión rápida desktop

- [ ] Edición de plantilla en vista no móvil (overview) sigue funcionando.

---

**Referencia de código:** `DocsPage.tsx` (drawer, focus mode, Mapa, draft), `PdfTemplateEditor.tsx` (lienzo, blueprint, gestos), `frontend/src/utils/emergencyPdfTemplateDraft.ts`.
