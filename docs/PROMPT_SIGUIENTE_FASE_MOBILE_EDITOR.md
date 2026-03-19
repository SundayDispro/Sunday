# Prompt para nuevo agente — Siguiente fase: micro-editor móvil (plantillas PDF)

Copia el bloque siguiente en un chat nuevo de Cursor (agente) como instrucciones iniciales.

---

Eres un agente de Cursor trabajando en el repositorio **Sunday** (frontend Vite/React + backend Node). Tu misión es la **siguiente fase** del trabajo en el **micro-editor móvil de plantillas PDF**, después de lo ya implementado.

## Contexto ya hecho (no rehacer desde cero)

Lee antes de cambiar nada:

- **Auditoría actualizada:** `SUNDAY_TECHNICAL_AUDIT.md` — sección **§4.3.1 Micro-editor móvil de plantillas**.
- **Checklist QA:** `docs/MOBILE_MICRO_EDITOR_QA.md`.
- **Plan origen (Cursor):** `~/.cursor/plans/mobile-micro-editor_6a5cd465.plan.md` (todos m1–m7 en *completed*; el cuerpo del plan lista backlog técnico y PR3 opcional).

**Archivos clave:**

- `frontend/src/components/pages/DocsPage.tsx` — drawer «Editar plantilla», focus mode, panel fijo, modo mapa, auto-map por jank, borrador emergencia.
- `frontend/src/components/pages/docs/PdfTemplateEditor.tsx` — canvas, cajas, blueprint, gestos lienzo vacío, fecha nativa.
- `frontend/src/components/docs/TextFormatBar.tsx` — `uiMode`, mousedown capture.
- `frontend/src/utils/emergencyPdfTemplateDraft.ts` — `sunday_draft_<docId>`.

## Problema central a resolver en esta fase (prioridad)

**Hay que idear e implementar (o prototipar) cómo debe verse el texto mientras el usuario escribe en la plantilla en móvil.**

Hoy, en **focus mode**, la capa de **dim + `backdrop-blur`** sobre el lienzo hace que **visualmente casi no haya referencia** con el documento/PDF de fondo: el usuario edita sobre un contexto poco legible y la experiencia **no se siente WYSIWYG**. El blur empeora la lectura del “fondo” y dificulta alinear mentalmente el texto con la plantilla.

**Objetivo de diseño + ingeniería:**

- Proponer **1–2 direcciones** (con pros/contras) y **implementar la elegida** (o un flag A/B temporal) sin romper:
  - scroll lock del drawer en `DocsPage`,
  - estabilidad del cursor en `contentEditable`,
  - gating ADMIN del panel externo (`textStyleOnly` + parches sanitizados),
  - modo mapa / borrador de emergencia si aplica.

Ejemplos de direcciones (solo orientativas): blur solo **fuera** de la caja activa; “isla” nítida con borde fuerte; reducir opacidad del overlay en la región de la caja; **sin blur** en el rectángulo de la caja enfocada; vista previa temporal al mantener pulsado; combinar con zoom existente.

Documenta en **1 párrafo** en `docs/MOBILE_MICRO_EDITOR_QA.md` o en un `docs/MOBILE_TEMPLATE_FOCUS_UX.md` la decisión y cómo probarla en móvil.

## Backlog técnico del plan (si encaja en el mismo PR)

Si el alcance lo permite, valorar en paralelo (o dejar explícitamente como siguiente iteración):

- `touch-action` más estricto en focus mode para **mitigar pinch-zoom** (el plan original sugería algo tipo `none`; hoy hay `pan-y`).
- `will-change` en capas drag/resize si medición lo justifica.
- Bottom sheet / paleta para **color** u otras semánticas (PR3 residual).
- **Deshacer** accesible desde la barra de foco (opcional §6 del plan).

## Reglas

- Responde al usuario en **español**.
- Si tocas **backend**, **env**, **vite.config** o `backend/src/**`, aplica la regla del workspace: reiniciar servidores (PowerShell con `;`).
- Entrega: cambios en código + nota breve de qué quedó hecho y qué sigue pendiente.

---

_Fin del prompt._
