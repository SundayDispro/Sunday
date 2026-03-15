"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultCotizacionTemplateStrings = getDefaultCotizacionTemplateStrings;
exports.buildCotizacionHtml = buildCotizacionHtml;
const path_1 = __importDefault(require("path"));
function getDefaultCotizacionTemplateStrings() {
    return {
        title: 'Cotización',
        clientLabel: 'Cliente',
        dateLabel: 'Fecha',
        validityLabel: 'Vigencia',
        itemsSectionTitle: 'Detalle de conceptos',
        subtotalLabel: 'Subtotal',
        ivaLabel: 'IVA',
        totalLabel: 'Total',
        notesLabel: 'Notas',
    };
}
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function buildCotizacionHtml(rawContent, templateStrings) {
    const content = {
        cliente: typeof rawContent.cliente === 'string' ? rawContent.cliente : '',
        fecha: typeof rawContent.fecha === 'string' ? rawContent.fecha : '',
        vigencia: typeof rawContent.vigencia === 'string' ? rawContent.vigencia : '',
        subtotal: typeof rawContent.subtotal === 'string' ? rawContent.subtotal : '',
        iva: typeof rawContent.iva === 'string' ? rawContent.iva : '',
        total: typeof rawContent.total === 'string' ? rawContent.total : '',
        notas: typeof rawContent.notas === 'string' ? rawContent.notas : '',
        items: Array.isArray(rawContent.items)
            ? rawContent.items
            : [],
    };
    const fontsDir = path_1.default.join(process.cwd(), 'assets', 'fonts', 'AvertaStd');
    const regularPath = `file:///${fontsDir.replace(/\\/g, '/')}/AvertaStd-Regular.ttf`;
    const boldPath = `file:///${fontsDir.replace(/\\/g, '/')}/AvertaStd-Bold.ttf`;
    const defaults = getDefaultCotizacionTemplateStrings();
    const t = { ...defaults, ...(templateStrings ?? {}) };
    const itemsRows = (content.items ?? []).map((it) => {
        const desc = escapeHtml(it.descripcion ?? '');
        const qty = escapeHtml(it.cantidad ?? '');
        const price = escapeHtml(it.precio ?? '');
        const total = escapeHtml(it.total ?? '');
        return `
      <tr>
        <td class="cell desc">${desc}</td>
        <td class="cell num">${qty}</td>
        <td class="cell num">${price}</td>
        <td class="cell num">${total}</td>
      </tr>
    `;
    }).join('');
    const cliente = escapeHtml(content.cliente ?? '');
    const fecha = escapeHtml(content.fecha ?? '');
    const vigencia = escapeHtml(content.vigencia ?? '');
    const subtotal = escapeHtml(content.subtotal ?? '');
    const iva = escapeHtml(content.iva ?? '');
    const total = escapeHtml(content.total ?? '');
    const notas = escapeHtml(content.notas ?? '');
    return `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charSet="utf-8" />
    <style>
      @font-face {
        font-family: 'AvertaStd';
        src: url('${regularPath}') format('truetype');
        font-weight: 400;
      }
      @font-face {
        font-family: 'AvertaStd';
        src: url('${boldPath}') format('truetype');
        font-weight: 700;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
      }

      body {
        width: 210mm;
        height: 297mm;
        margin: 0;
        font-family: 'AvertaStd', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #111827;
      }

      .page {
        position: relative;
        width: 210mm;
        height: 297mm;
        padding: 18mm 18mm 20mm 18mm;
        display: flex;
        flex-direction: column;
        font-size: 10pt;
      }

      .header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8mm;
      }

      .header-left {
        max-width: 60%;
      }

      .title {
        font-size: 16pt;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin: 0 0 4mm 0;
      }

      .label {
        font-size: 8pt;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #6b7280;
      }

      .value {
        font-size: 10pt;
        font-weight: 400;
        margin-top: 1mm;
      }

      .header-right {
        text-align: right;
        font-size: 9pt;
      }

      .section {
        margin-bottom: 6mm;
      }

      .section-title {
        font-size: 9pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #4b5563;
        margin-bottom: 2mm;
      }

      .items-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 2mm;
        font-size: 9pt;
      }

      .items-table thead th {
        font-weight: 700;
        text-align: left;
        padding: 2mm 2mm;
        border-bottom: 0.3pt solid #d1d5db;
        color: #4b5563;
      }

      .items-table thead th.num {
        text-align: right;
      }

      .items-table tbody td.cell {
        padding: 1.5mm 2mm;
        border-bottom: 0.25pt solid #e5e7eb;
      }

      .items-table tbody td.desc {
        width: 100%;
      }

      .items-table tbody td.num {
        width: 20mm;
        text-align: right;
        white-space: nowrap;
      }

      .totals {
        margin-top: 4mm;
        margin-left: auto;
        width: 60mm;
        font-size: 9pt;
      }

      .totals-row {
        display: flex;
        justify-content: space-between;
        padding: 1mm 0;
      }

      .totals-row.total {
        font-weight: 700;
        border-top: 0.4pt solid #111827;
        margin-top: 1mm;
        padding-top: 1.8mm;
      }

      .notes {
        margin-top: auto;
        font-size: 8.5pt;
        color: #4b5563;
      }

      .notes-label {
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        margin-bottom: 1.5mm;
      }

      .notes-text {
        white-space: pre-wrap;
        line-height: 1.4;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="header">
        <div class="header-left">
          <h1 class="title">${escapeHtml(t.title)}</h1>
          <div class="section">
            <div class="label">${escapeHtml(t.clientLabel)}</div>
            <div class="value">${cliente}</div>
          </div>
        </div>
        <div class="header-right">
          <div class="section">
            <div class="label">${escapeHtml(t.dateLabel)}</div>
            <div class="value">${fecha}</div>
          </div>
          <div class="section">
            <div class="label">${escapeHtml(t.validityLabel)}</div>
            <div class="value">${vigencia}</div>
          </div>
        </div>
      </header>

      <section class="section">
        <div class="section-title">${escapeHtml(t.itemsSectionTitle)}</div>
        <table class="items-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th class="num">Cant.</th>
              <th class="num">Precio</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-row">
            <span>${escapeHtml(t.subtotalLabel)}</span>
            <span>${subtotal}</span>
          </div>
          <div class="totals-row">
            <span>${escapeHtml(t.ivaLabel)}</span>
            <span>${iva}</span>
          </div>
          <div class="totals-row total">
            <span>${escapeHtml(t.totalLabel)}</span>
            <span>${total}</span>
          </div>
        </div>
      </section>

      <section class="notes">
        <div class="notes-label">${escapeHtml(t.notesLabel)}</div>
        <div class="notes-text">${notas}</div>
      </section>
    </div>
  </body>
</html>
`;
}
