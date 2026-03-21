import type { TemplateConfigState, CustomBoxDef, PdfDocType } from './pdfTemplateConfig';
import {
  extractPdfDocumentImageBoxes,
  pdfDraftUsesSplitImageLayout,
  pdfTemplateBoxesExcludingImages,
} from './pdfTemplateConfig';

export interface BuildPdfContentParams {
  docType: PdfDocType;
  parsedContent: Record<string, unknown>;
  pdfFormDraft: Record<string, unknown>;
  templateConfig?: TemplateConfigState | null;
  selectedDocId?: string | null;
}

export interface BuildPdfContentResult {
  contentToSend: Record<string, unknown>;
}

export function buildPdfContent({
  docType,
  parsedContent,
  pdfFormDraft,
  templateConfig,
  selectedDocId,
}: BuildPdfContentParams): BuildPdfContentResult {
  const config = templateConfig ?? null;
  const docFieldPositions = (pdfFormDraft.fieldPositions ?? {}) as Record<
    string,
    { x: number; y: number; fontSize?: number; maxWidth?: number }
  >;
  // Modo admin: texto desde plantilla global + imágenes solo del documento (`pdfImageBoxes`).
  // Legado / no admin: `customBoxes` completo en el documento.
  const docCustomBoxesRaw = Array.isArray(pdfFormDraft.customBoxes) ? pdfFormDraft.customBoxes : [];
  const configBoxesRaw = Array.isArray(config?.customBoxes) ? config.customBoxes : [];
  const configText = pdfTemplateBoxesExcludingImages(configBoxesRaw);
  const docImages = extractPdfDocumentImageBoxes(pdfFormDraft);

  let rawCustomBoxes: CustomBoxDef[];
  if (pdfDraftUsesSplitImageLayout(pdfFormDraft)) {
    rawCustomBoxes = [...configText, ...docImages];
  } else if (docCustomBoxesRaw.length > 0) {
    rawCustomBoxes = docCustomBoxesRaw as CustomBoxDef[];
  } else {
    rawCustomBoxes = configBoxesRaw as CustomBoxDef[];
  }
  const customFieldValues = (pdfFormDraft.customFieldValues ?? {}) as Record<string, string>;

  const fieldKeysByType: Record<string, string[]> = {
    cotizacion: ['cliente', 'fecha', 'vigencia', 'descripcion_corta', 'elemento', 'total', 'notas'],
    levantamiento: ['proyecto', 'fecha', 'direccion', 'descripcion', 'observaciones'],
    hoja_trabajo: ['titulo', 'fecha', 'item', 'descripcion', 'observaciones'],
  };

  const keysByIndex = (fieldKeysByType[docType] ?? []).filter((k) => k !== 'folio');
  let keyIndex = 0;

  const customBoxes: CustomBoxDef[] = rawCustomBoxes.map((b) => {
    const box = b as Partial<CustomBoxDef> & { semantic?: string; fieldKey?: string };
    const fieldKey =
      box.fieldKey
        ? box.fieldKey
        : box.semantic === 'folio'
          ? 'folio'
          : box.semantic === 'element'
            ? 'elemento'
            : keysByIndex[keyIndex++] ?? undefined;
    return {
      ...(box as CustomBoxDef),
      fieldKey: box.fieldKey ?? fieldKey,
      x: Math.max(0, Math.min(1, Number(box.x) || 0)),
      y: Math.max(0, Math.min(1, Number(box.y) || 0)),
      width: Math.max(0.01, Math.min(1, Number(box.width) ?? 0.3)),
      height: Math.max(0.01, Math.min(1, Number(box.height) ?? 0.05)),
    };
  });

  const contentFromDraft = {
    ...(parsedContent as Record<string, unknown>),
    ...pdfFormDraft,
  } as Record<string, unknown>;

  // Normalizar fecha: aceptar tanto "fecha" como "date" y volcar todo en content.fecha
  const rawFecha =
    (pdfFormDraft as Record<string, unknown>).fecha ??
    (pdfFormDraft as Record<string, unknown>).date ??
    (parsedContent as Record<string, unknown>).fecha ??
    (parsedContent as Record<string, unknown>).date ??
    contentFromDraft.fecha ??
    '';
  const normalizedFecha =
    typeof rawFecha === 'string' ? rawFecha.trim() : String(rawFecha ?? '').trim();
  if (normalizedFecha) {
    contentFromDraft.fecha = normalizedFecha;
  }

  // PDF 1:1 con el editor: cada caja con fieldKey usa exactamente el valor visible en el editor
  customBoxes.forEach((box: { id?: string; fieldKey?: string }) => {
    if (!box.fieldKey || !box.id) return;
    const visibleInEditor = (pdfFormDraft as Record<string, unknown>)[box.fieldKey] ?? customFieldValues[box.id] ?? '';
    const visibleStr = (typeof visibleInEditor === 'string' ? visibleInEditor : String(visibleInEditor ?? '')).trim();
    if (visibleStr !== '') contentFromDraft[box.fieldKey] = visibleStr;
  });

  const knownFields = (fieldKeysByType[docType] ?? []).concat('folio');
  knownFields.forEach((key) => {
    if (
      contentFromDraft[key] === undefined ||
      contentFromDraft[key] === null ||
      String(contentFromDraft[key]).trim() === ''
    ) {
      const box = customBoxes.find((b: { fieldKey?: string }) => b.fieldKey === key);
      if (box?.id && customFieldValues[box.id]?.trim()) {
        contentFromDraft[key] = String(customFieldValues[box.id]).trim();
      }
    }
  });

  // Fecha en el PDF = exactamente lo que muestra la vista previa (1:1).
  const fechaBox = customBoxes.find((b: { fieldKey?: string }) => b.fieldKey === 'fecha');
  const fechaFromBox = fechaBox
    ? ((pdfFormDraft as Record<string, unknown>).fecha ??
        (pdfFormDraft as Record<string, unknown>).date ??
        customFieldValues[fechaBox.id] ??
        '')
    : contentFromDraft.fecha ?? normalizedFecha ?? '';
  const fechaStr = (typeof fechaFromBox === 'string' ? fechaFromBox : String(fechaFromBox ?? '')).trim();
  contentFromDraft.fecha = fechaStr;

  // Folio en el PDF = solo lo que muestra la caja de folio. Si está vacío, usa el id del doc.
  const folioBox = customBoxes.find((b) => b.fieldKey === 'folio' || b.semantic === 'folio');
  const folioFromBox = folioBox
    ? ((pdfFormDraft as Record<string, unknown>).folio ?? customFieldValues[folioBox.id] ?? '')
    : contentFromDraft.folio ?? '';
  const folioStr = (typeof folioFromBox === 'string' ? folioFromBox : String(folioFromBox ?? '')).trim();
  contentFromDraft.folio = folioStr !== '' ? folioStr : (selectedDocId ?? '');

  // Total en el PDF = valor visible en la caja de total (draft o customFieldValues).
  const totalBox = customBoxes.find((b: { fieldKey?: string }) => b.fieldKey === 'total');
  const totalFromBox = totalBox
    ? (
        (pdfFormDraft as Record<string, unknown>).total ??
        customFieldValues[totalBox.id] ??
        (contentFromDraft.total ?? '')
      )
        .toString()
        .trim()
    : String(contentFromDraft.total ?? '').trim();
  contentFromDraft.total = totalFromBox;

  // Asegurar que elemento esté en content para el PDF.
  const elementoBox = customBoxes.find((b: { fieldKey?: string }) => b.fieldKey === 'elemento');
  if (
    elementoBox?.id &&
    (contentFromDraft.elemento === undefined ||
      contentFromDraft.elemento === null ||
      String(contentFromDraft.elemento).trim() === '') &&
    customFieldValues[elementoBox.id]?.trim()
  ) {
    contentFromDraft.elemento = String(customFieldValues[elementoBox.id]).trim();
  }

  const effectiveFontSize =
    typeof pdfFormDraft.globalFontSize === 'number'
      ? pdfFormDraft.globalFontSize
      : config?.fontSize ?? 11;
  const effectiveFontColor =
    typeof pdfFormDraft.globalFontColor === 'string'
      ? pdfFormDraft.globalFontColor
      : config?.fontColor ?? '#000000';
  const effectiveFontFamily =
    typeof pdfFormDraft.globalFontFamily === 'string'
      ? pdfFormDraft.globalFontFamily
      : config?.fontFamily ?? 'Averta Std';
  const effectiveFontBold =
    pdfFormDraft.globalFontBold === true || pdfFormDraft.globalFontBold === 'true'
      ? true
      : config?.fontBold ?? false;
  const effectiveFontItalic =
    pdfFormDraft.globalFontItalic === true || pdfFormDraft.globalFontItalic === 'true'
      ? true
      : config?.fontItalic ?? false;

  const contentToSend = {
    ...contentFromDraft,
    fieldPositions: { ...(config?.fieldPositions ?? {}), ...docFieldPositions },
    customBoxes,
    globalFontSize: effectiveFontSize,
    globalFontColor: effectiveFontColor,
    globalFontFamily: effectiveFontFamily,
    globalFontBold: effectiveFontBold,
    globalFontItalic: effectiveFontItalic,
  };

  return { contentToSend };
}

