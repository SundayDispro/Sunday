# Mejora de la lógica de guardado de documentos

Usa este texto como instrucción en una **nueva ventana de chat con un nuevo agente** para implementar las mejoras de guardado en la ventana de Documentos.

---

## Contexto

La aplicación tiene una ventana de Documentos (Docs) donde se editan documentos (texto, hojas, cotizaciones, etc.). Actualmente el guardado puede ser automático o al hacer clic en Guardar. Se pide cambiar el comportamiento y añadir "Guardar como".

## Objetivos

1. **Guardar solo al hacer clic en Guardar**  
   Los cambios no se persisten hasta que el usuario pulse el botón "Guardar". No debe haber guardado automático en segundo plano (o debe desactivarse/eliminarse si existe).

2. **Comportamiento al guardar un documento existente**  
   Si el documento ya existe (está abierto desde la lista):
   - Al pulsar "Guardar": **sobrescribir** el documento actual en el servidor.
   - Mostrar una **confirmación visual** clara de que se ha guardado (por ejemplo toast, mensaje temporal o indicador en la barra del editor).

3. **Comportamiento al guardar un documento nuevo**  
   Si es un documento nuevo (aún no guardado o sin id):
   - Al pulsar "Guardar": abrir un flujo donde el usuario pueda **elegir grupo y subgrupo** (según la estructura de la ventana Docs: tipos de documento y subgrupos).
   - Tras guardar, mostrar la **misma confirmación visual** de que se ha guardado.

4. **Guardar como**  
   Añadir la opción **"Guardar como"** que:
   - Permita guardar el documento **con otro nombre** (título).
   - Permita elegir **grupo y subgrupo** de destino (o tipo de documento si aplica).
   - Cree un **nuevo documento** con el contenido actual (o redirija al recién creado) sin sobrescribir el actual.

## Detalles técnicos útiles

- **Frontend:** `frontend/src/components/pages/DocsPage.tsx` — lógica del editor, estado del documento (`selectedDoc`, `parsed`, borradores), y probablemente `handleSave` o similar.
- **Backend:** rutas de documentos (p. ej. `POST /api/docs` para crear, `PATCH` o `PUT` para actualizar). Revisar cómo se identifican documentos existentes (por `id`) y cómo se persisten grupo/subgrupo (p. ej. `doc-groups`, `subgroupAssignments`).
- **Estado de grupos/subgrupos:** En DocsPage ya existe `customGroups`, `assignments`, `subgroupsByType`, `subgroupAssignments` y funciones como `assignDocToCustomGroup`, `assignDocToSubgroup`, y API `saveDocGroupsToApi`. Reutilizar o adaptar para el flujo "Guardar (nuevo)" y "Guardar como".
- **Confirmación visual:** Ya existe un sistema de toasts en la app (`useToast()` en `frontend/src/components/Toast.tsx`). Usar para mensajes del tipo "Documento guardado" / "Guardado como...".

## Resumen de tareas

- [ ] Guardar solo al clic en "Guardar" (sin auto-guardado).
- [ ] Guardar documento existente: sobrescribir y mostrar confirmación visual.
- [ ] Guardar documento nuevo: elegir grupo/subgrupo, guardar y mostrar confirmación.
- [ ] Añadir "Guardar como": nuevo nombre, elegir grupo/subgrupo, crear nuevo documento y confirmación visual.
