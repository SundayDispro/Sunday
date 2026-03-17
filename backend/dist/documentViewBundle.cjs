"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// frontend/src/renderDocumentToHtml.tsx
var renderDocumentToHtml_exports = {};
__export(renderDocumentToHtml_exports, {
  renderDocumentHtml: () => renderDocumentHtml
});
module.exports = __toCommonJS(renderDocumentToHtml_exports);
var import_react = __toESM(require("react"), 1);
var import_server = require("react-dom/server");

// frontend/src/components/pages/docs/DocumentPageForPdf.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var PAGE_W_PT = 612;
var PAGE_H_PT = 792;
var PADDING_TOP_FOLIO_PT = 9;
var PADDING_TOP_SINGLE_PT = 12;
var PADDING_TOP_DESCRIPCION_CORTA_PT = 27;
var PADDING_TOP_MULTI_PT = 6;
var PADDING_BOTTOM_PT = 3;
var PADDING_SIDES_PT = 4.5;
var PADDING_FOLIO_LEFT_PT = 4.5;
var PADDING_TOP_TOTAL_PT = 0;
var PADDING_TOTAL_RIGHT_PT = 4.5;
function formatDateForPdf(value) {
  const s = String(value).trim();
  if (!s) return s;
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return s;
}
function getBoxText(box, content, customFieldValues) {
  const rawFromField = box.fieldKey ? content[box.fieldKey] : void 0;
  const strFromField = rawFromField !== void 0 && rawFromField !== null ? String(rawFromField).trim() : "";
  const hasFieldValue = strFromField !== "";
  const isElementBox = box.fieldKey === "elemento" || box.semantic === "element";
  const rawElemento = content["elemento"] ?? content["descripcion_corta"];
  const strElemento = rawElemento !== void 0 && rawElemento !== null ? String(rawElemento).trim() : "";
  if (box.fieldKey && hasFieldValue) {
    return box.fieldKey === "fecha" ? formatDateForPdf(String(rawFromField)) : strFromField;
  }
  if (isElementBox && strElemento) return strElemento;
  const byId = (customFieldValues[box.id] ?? "").trim();
  if (byId) {
    return box.fieldKey === "fecha" ? formatDateForPdf(byId) : byId;
  }
  if (box.fieldKey === "cliente") {
    const alt = content["cliente"] ?? content["client"] ?? "";
    return (typeof alt === "string" ? alt : String(alt ?? "")).trim();
  }
  if (box.fieldKey === "total" || box.fieldKey === "folio") {
    const alt = content[box.fieldKey] ?? customFieldValues[box.id];
    return (alt !== void 0 && alt !== null ? String(alt) : "").trim();
  }
  if (isElementBox) return strElemento;
  if (box.fieldKey && rawFromField !== void 0 && rawFromField !== null) {
    return box.fieldKey === "fecha" ? formatDateForPdf(String(rawFromField)) : String(rawFromField).trim();
  }
  return "";
}
var PDF_WHITE_COLOR = "rgb(254,254,254)";
function normalizeTextColor(raw) {
  const s = raw.toLowerCase().trim();
  if (s === "#ffffff" || s === "#fff" || s === "white") return PDF_WHITE_COLOR;
  if (/^rgb\s*\(\s*255\s*,\s*255\s*,\s*255\s*\)$/.test(s.replace(/\s/g, ""))) return PDF_WHITE_COLOR;
  return "#000000";
}
function normalizeBackgroundColor(raw) {
  const s = raw.toLowerCase().trim();
  if (!s) return "transparent";
  if (s === "#000000" || s === "#000" || s === "black") return "#000000";
  if (/^rgb\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(s.replace(/\s/g, ""))) return "#000000";
  return s;
}
var DocumentPageForPdf = ({
  content,
  backgroundImageDataUrl
}) => {
  const customBoxes = content.customBoxes ?? [];
  const customFieldValues = content.customFieldValues ?? {};
  const globalFontSize = typeof content.globalFontSize === "number" ? content.globalFontSize : 11;
  const globalFontFamily = String(
    content.globalFontFamily ?? "Averta Std"
  ).trim();
  const globalFontColor = String(content.globalFontColor ?? "#000000").trim();
  const globalFontBold = content.globalFontBold === true || content.globalFontBold === "true";
  const globalFontItalic = content.globalFontItalic === true || content.globalFontItalic === "true";
  const backgroundStyle = backgroundImageDataUrl ? {
    backgroundImage: `url(${backgroundImageDataUrl})`,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "0 0"
  } : { backgroundColor: "#ffffff" };
  const pageStyle = {
    width: "612pt",
    height: "792pt",
    minWidth: "612pt",
    minHeight: "792pt",
    position: "relative",
    overflow: "visible",
    backgroundColor: "#ffffff",
    ...backgroundStyle
  };
  const boxes = customBoxes.map((box) => {
    if (!box) return null;
    const leftPt = (box.x ?? 0) * PAGE_W_PT;
    const topPt = (box.y ?? 0) * PAGE_H_PT;
    const widthPt = (box.width ?? 0.3) * PAGE_W_PT;
    if (box.kind === "image" && box.imageUrl) {
      const heightPt2 = (box.height ?? 0.15) * PAGE_H_PT;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "img",
        {
          src: box.imageUrl,
          alt: "",
          style: {
            position: "absolute",
            left: `${leftPt}pt`,
            top: `${topPt}pt`,
            width: `${widthPt}pt`,
            height: `${heightPt2}pt`,
            objectFit: "contain",
            objectPosition: "left top"
          }
        },
        box.id
      );
    }
    const text = getBoxText(box, content, customFieldValues);
    const totalStr = String(content?.total ?? "").trim();
    const isTotalBox = box.fieldKey === "total" || totalStr !== "" && text.trim() === totalStr;
    let size = typeof box.fontSize === "number" ? box.fontSize : globalFontSize;
    if (isTotalBox) size = Math.max(size, 11);
    if (box.semantic === "folio" || box.fieldKey === "folio") {
      size = typeof box.fontSize === "number" ? box.fontSize : globalFontSize;
    }
    const ff = (box.fontFamily ?? globalFontFamily).trim();
    let bold = typeof box.fontBold === "boolean" ? box.fontBold : globalFontBold;
    if (isTotalBox) bold = true;
    const italic = typeof box.fontItalic === "boolean" ? box.fontItalic : globalFontItalic;
    const colRaw = typeof box.fontColor === "string" && box.fontColor ? box.fontColor : globalFontColor;
    let textCol = normalizeTextColor(colRaw);
    const bgRaw = typeof box.backgroundColor === "string" && box.backgroundColor.trim() ? box.backgroundColor.trim() : "transparent";
    let bgCol = bgRaw === "transparent" ? "transparent" : normalizeBackgroundColor(bgRaw);
    if (bgCol === "#000000" || isTotalBox) {
      textCol = PDF_WHITE_COLOR;
      if (isTotalBox) bgCol = "#000000";
    }
    const isFolio = box.semantic === "folio" || box.fieldKey === "folio";
    const isSingleLine = box.singleLine === true || isFolio;
    const isDescripcionCorta = box.fieldKey === "descripcion_corta";
    const isTotal = isTotalBox;
    const heightPt = (box.height ?? 0.05) * PAGE_H_PT;
    const heightClampedPt = Math.min(heightPt, PAGE_H_PT - topPt);
    const lineHeight = isSingleLine ? 1.1 : 1.35;
    const paddingTopPt = isTotalBox ? PADDING_TOP_TOTAL_PT : isDescripcionCorta ? PADDING_TOP_DESCRIPCION_CORTA_PT : isFolio ? PADDING_TOP_FOLIO_PT : isSingleLine ? PADDING_TOP_SINGLE_PT : PADDING_TOP_MULTI_PT;
    const paddingBottomPt = isTotalBox ? 0 : PADDING_BOTTOM_PT;
    const paddingLeftPt = isFolio ? PADDING_FOLIO_LEFT_PT : PADDING_SIDES_PT;
    const paddingRightPt = isTotalBox ? PADDING_TOTAL_RIGHT_PT : PADDING_SIDES_PT;
    const boxStyle = {
      position: "absolute",
      left: `${leftPt}pt`,
      top: `${topPt}pt`,
      width: `${widthPt}pt`,
      height: `${heightClampedPt}pt`,
      margin: 0,
      padding: `${paddingTopPt}pt ${paddingRightPt}pt ${paddingBottomPt}pt ${paddingLeftPt}pt`,
      lineHeight,
      boxSizing: "border-box",
      overflow: isTotalBox ? "visible" : "hidden",
      display: "block",
      zIndex: 5,
      backgroundColor: bgCol,
      WebkitPrintColorAdjust: "exact",
      printColorAdjust: "exact"
    };
    const isWhiteText = textCol === PDF_WHITE_COLOR;
    const innerStyle = {
      display: isTotalBox ? "flex" : "block",
      justifyContent: isTotalBox ? "flex-end" : void 0,
      alignItems: isTotalBox ? "center" : void 0,
      width: "100%",
      height: "100%",
      minWidth: 0,
      margin: 0,
      overflow: isTotalBox ? "visible" : "hidden",
      fontFamily: `${ff}, sans-serif`,
      fontSize: `${size}pt`,
      fontWeight: bold ? "bold" : "normal",
      fontStyle: italic ? "italic" : "normal",
      color: textCol,
      backgroundColor: "transparent",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflowWrap: "break-word",
      boxSizing: "border-box",
      textAlign: isTotal ? "right" : "left",
      direction: "ltr",
      fontVariant: "no-common-ligatures",
      textRendering: "geometricPrecision",
      WebkitPrintColorAdjust: "exact",
      printColorAdjust: "exact",
      ...isTotalBox && { lineHeight: 1 },
      ...isWhiteText && { WebkitTextFillColor: PDF_WHITE_COLOR }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: isTotalBox ? "doc-box-total" : void 0, style: boxStyle, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: innerStyle, children: isTotalBox ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { display: "inline-block", textAlign: "right", width: "auto", flexShrink: 0, marginLeft: "auto", lineHeight: 1, transform: "translateY(-0.08em)", color: PDF_WHITE_COLOR, WebkitTextFillColor: PDF_WHITE_COLOR }, children: text || "\xA0" }) : text || "\xA0" }) }, box.id);
  });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: pageStyle, children: boxes });
};

// frontend/src/renderDocumentToHtml.tsx
function renderDocumentHtml(props) {
  return (0, import_server.renderToStaticMarkup)(import_react.default.createElement(DocumentPageForPdf, props));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  renderDocumentHtml
});
