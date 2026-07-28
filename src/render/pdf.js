'use strict';
/**
 * Renders the management-accounts pack as a PDF — the format the founders receive.
 *
 * Generated directly with pdfkit rather than converted from .docx: no LibreOffice or
 * headless browser binary is needed, so this runs anywhere Node runs (including a
 * routine's cloud sandbox). Streams are left uncompressed so GATE 2 can read the text
 * back out of the finished file and verify every figure.
 *
 * Typeface note: PDF's built-in Helvetica is used (always present, nothing to embed).
 * Calibri would require shipping a font file; Helvetica is the standard PDF sans and
 * keeps the pack byte-identical wherever it runs.
 *
 * Returns { file, expected, allowedMoney, requiredSections } — the same contract as the
 * .docx renderer, so the verification gate is unchanged.
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { gbp, pct1, signedPct1, int, slug, pdfSafe } = require('../format');
const { renderCharts } = require('./charts');

const NAVY = '#1F3A4D', TEAL = '#2E6E7E', SAND = '#F1ECE2', LIGHT = '#F7F4EE',
  GREY = '#5A5A5A', RULE = '#C9BFA8', RED = '#B4553F', GREEN = '#3B6E4B',
  INK = '#222222', WHITE = '#FFFFFF', AMBER = '#B07A2F';

const PAGE = { size: 'LETTER', margin: 54 };
const X0 = PAGE.margin;
const CW = 612 - PAGE.margin * 2; // content width

async function render(model, signals, dir, opts = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const charts = renderCharts(model, dir);

  const expected = [];
  const allowedMoney = [];
  const note = (key, text) => {
    const t = pdfSafe(String(text));
    expected.push({ key, text: t });
    return t;
  };

  const cadenceTitle = model.meta.cadence.charAt(0).toUpperCase() + model.meta.cadence.slice(1);
  const cols = model.pnlColumns;

  const fileName = `${slug(model.meta.business)}-${model.meta.cadence}-${slug(model.meta.periodLabel)}.pdf`;
  const file = path.join(dir, fileName);

  const doc = new PDFDocument({ ...PAGE, compress: false, bufferPages: true, info: {
    Title: `${model.meta.business} — ${cadenceTitle} Management Accounts — ${model.meta.periodLabel}`,
    Author: 'Negative Zero', Subject: 'Management accounts (management information, ex-VAT)',
  } });
  const stream = fs.createWriteStream(file);
  doc.pipe(stream);

  // ---------- small drawing helpers ----------
  const txt = (s, x, y, o = {}) => {
    doc.font(o.bold ? 'Helvetica-Bold' : o.italic ? 'Helvetica-Oblique' : 'Helvetica')
      .fontSize(o.size || 9.5)
      .fillColor(o.color || INK)
      .text(pdfSafe(s), x, y, { width: o.width, align: o.align, lineGap: o.lineGap == null ? 1.5 : o.lineGap });
    return doc.y;
  };
  const rule = (y, color = RULE, w = 0.9) => {
    doc.moveTo(X0, y).lineTo(X0 + CW, y).lineWidth(w).strokeColor(color).stroke();
    return y + 1;
  };
  const box = (x, y, w, h, fill) => { doc.rect(x, y, w, h).fillColor(fill).fill(); };
  const heading = (label) => {
    if (doc.y > 700) doc.addPage();
    const y = doc.y + 14;
    doc.font('Helvetica-Bold').fontSize(13.5).fillColor(NAVY).text(label, X0, y);
    const after = rule(doc.y + 3);
    doc.y = after + 7;
    return label;
  };

  // ================= TITLE =================
  doc.font('Helvetica-Bold').fontSize(24).fillColor(NAVY).text('Management Accounts', X0, 56);
  doc.font('Helvetica-Oblique').fontSize(11).fillColor(TEAL)
    .text(`${cadenceTitle} pack - ${model.meta.periodLabel}`, X0, doc.y + 2);
  doc.font('Helvetica').fontSize(8).fillColor(GREY)
    .text(`Period: ${model.meta.start} to ${model.meta.end}   Currency: ${model.meta.currency}   Basis: management information (ex-VAT)`,
      X0, doc.y + 4);
  doc.y = rule(doc.y + 6, RULE, 1.6) + 10;

  // ================= AT A GLANCE =================
  const sec1 = heading('At a glance');
  const kpiRevenue = note('headline.revenue', gbp(model.period.revenuePence));
  const kpiUnits = model.period.units != null ? note('headline.units', int(model.period.units)) : '-';
  const kpiPrior = model.headline.priorPct != null ? note('headline.priorPct', signedPct1(model.headline.priorPct)) : '-';
  const kpiYoy = model.headline.yoyPct != null ? note('headline.yoyPct', signedPct1(model.headline.yoyPct)) : '-';
  const kpiNetMargin = note('headline.netMargin', pct1(model.headline.netMarginPct));

  txt(
    `${model.meta.periodLabel} revenue was ${kpiRevenue}` +
      (model.headline.priorPct != null ? `, ${kpiPrior} on the ${model.headline.priorLabel}` : '') +
      (model.headline.yoyPct != null ? ` and ${kpiYoy} on the ${model.headline.yoyLabel}` : '') +
      `. Net margin for the period was ${kpiNetMargin}.`,
    X0, doc.y, { width: CW, size: 10 }
  );

  // KPI cards
  const cardY = doc.y + 10;
  const gap = 8;
  const cardW = (CW - gap * 3) / 4;
  const cards = [
    { label: 'REVENUE', value: kpiRevenue, sub: model.meta.periodLabel, color: TEAL },
    { label: 'UNITS SOLD', value: kpiUnits, sub: model.period.units != null ? 'in the period' : 'awaiting unit data', color: TEAL },
    { label: `VS ${String(model.headline.priorLabel).toUpperCase()}`, value: kpiPrior, sub: 'sequential', color: (model.headline.priorPct || 0) >= 0 ? GREEN : RED },
    { label: `VS ${String(model.headline.yoyLabel).toUpperCase()}`, value: kpiYoy, sub: 'year-on-year', color: (model.headline.yoyPct || 0) >= 0 ? GREEN : RED },
  ];
  cards.forEach((c, i) => {
    const x = X0 + i * (cardW + gap);
    box(x, cardY, cardW, 56, SAND);
    txt(c.label, x + 8, cardY + 7, { size: 6.4, color: GREY, width: cardW - 16 });
    txt(c.value, x + 8, cardY + 18, { size: 15, bold: true, color: NAVY, width: cardW - 16 });
    txt(c.sub, x + 8, cardY + 40, { size: 6.8, bold: true, color: c.color, width: cardW - 16 });
  });
  doc.y = cardY + 56 + 14;

  // ================= P&L =================
  const sec2 = heading('Profit & loss summary');
  txt('Revenue, cost of goods, operating costs and profit at annual level. A year-to-date column is a part-year figure and not directly comparable to a full year.',
    X0, doc.y, { width: CW, size: 9 });
  doc.y += 6;

  const labelW = 186;
  const valW = (CW - labelW) / cols.length;
  const rowH = 15.5;
  const drawRow = (label, values, o = {}) => {
    const y = doc.y;
    if (o.fill) box(X0, y, CW, rowH, o.fill);
    txt((o.indent ? '   ' : '') + label, X0 + 5, y + 4, { size: 8.6, bold: o.bold, color: o.color || INK, width: labelW });
    values.forEach((v, i) => {
      txt(v, X0 + labelW + i * valW, y + 4, { size: 8.6, bold: o.bold, color: o.color || INK, width: valW - 6, align: 'right' });
    });
    doc.y = y + rowH;
  };
  const pl = (getter, key) => cols.map((c) => note(`pnl.${key}.${c.key}`, gbp(getter(c))));

  // header row
  const hy = doc.y;
  box(X0, hy, CW, rowH + 1, NAVY);
  txt('£', X0 + 5, hy + 4.5, { size: 8.6, bold: true, color: WHITE, width: labelW });
  cols.forEach((c, i) =>
    txt(c.key, X0 + labelW + i * valW, hy + 4.5, { size: 8.2, bold: true, color: WHITE, width: valW - 6, align: 'right' })
  );
  doc.y = hy + rowH + 1;

  drawRow('Revenue', pl((c) => c.revenuePence, 'revenue'), { bold: true, fill: LIGHT });
  drawRow('Cost of goods sold', pl((c) => c.cogsPence, 'cogs'), { indent: true });
  drawRow('Gross profit', pl((c) => c.grossPence, 'gross'), { bold: true, color: NAVY });
  drawRow('Gross margin', cols.map((c) => note(`pnl.grossMargin.${c.key}`, pct1((c.grossPence / c.revenuePence) * 100))), { fill: LIGHT, color: GREY });
  drawRow('Marketing & advertising', pl((c) => c.opex.marketingPence, 'marketing'), { indent: true });
  drawRow('Fulfilment & shipping', pl((c) => c.opex.fulfilmentPence, 'fulfilment'), { indent: true });
  drawRow('Platform & payment fees', pl((c) => c.opex.feesPence, 'fees'), { indent: true });
  drawRow("Founders' compensation", pl((c) => c.opex.foundersPence, 'founders'), { indent: true });
  drawRow('Software & other overhead', pl((c) => c.opex.softwarePence, 'software'), { indent: true });
  drawRow('Total operating expenses', pl((c) => c.opexTotalPence, 'opexTotal'), { fill: LIGHT });
  drawRow('Net profit', pl((c) => c.netPence, 'net'), { bold: true, fill: SAND, color: NAVY });
  drawRow('Net margin', cols.map((c) => note(`pnl.netMargin.${c.key}`, pct1((c.netPence / c.revenuePence) * 100))), { bold: true, color: TEAL });
  rule(doc.y + 1);

  const last = cols[cols.length - 1];
  doc.y += 8;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Read this: ', X0, doc.y, { continued: true });
  doc.font('Helvetica').fillColor(INK).text(
    pdfSafe(`gross margin holds at ${pct1((last.grossPence / last.revenuePence) * 100)}, so the business keeps a consistent slice of every sale. Because some costs are fixed, a soft period squeezes net margin a little harder than the revenue drop alone.`),
    { width: CW }
  );

  // ================= TREND (page 2) =================
  doc.addPage();
  doc.y = 56;
  const sec3 = heading('Revenue trend');
  txt(`Monthly revenue across the available history (${model.monthlySeries[0].period} onward). The rhythm is clear: a Q4 lift each November-December, softer summers, and steady year-on-year growth.`,
    X0, doc.y, { width: CW, size: 9 });
  doc.y += 6;
  doc.image(charts.monthly, X0, doc.y, { width: CW });
  doc.y += CW * 0.337 + 10;
  doc.image(charts.quarterly, X0, doc.y, { width: CW });
  doc.y += CW * 0.326 + 14;

  // quarterly table
  const years = model.quarters.years;
  const qLabelW = 90;
  const qValW = (CW - qLabelW) / years.length;
  const qhy = doc.y;
  box(X0, qhy, CW, rowH + 1, NAVY);
  txt('Quarter', X0 + 5, qhy + 4.5, { size: 8.6, bold: true, color: WHITE, width: qLabelW });
  years.forEach((y, i) =>
    txt(`FY${y}`, X0 + qLabelW + i * qValW, qhy + 4.5, { size: 8.2, bold: true, color: WHITE, width: qValW - 6, align: 'right' })
  );
  doc.y = qhy + rowH + 1;
  model.quarters.rows.forEach((row, ri) => {
    const y = doc.y;
    const fill = ri % 2 === 0 ? LIGHT : null;
    if (fill) box(X0, y, CW, rowH, fill);
    txt(row.quarter, X0 + 5, y + 4, { size: 8.6, bold: true, width: qLabelW });
    years.forEach((yr, i) => {
      const c = row.byYear[yr];
      const x = X0 + qLabelW + i * qValW;
      if (!c) {
        txt('-', x, y + 4, { size: 8.6, color: GREY, width: qValW - 6, align: 'right' });
      } else {
        const partial = c.monthCount < 3;
        const t = note(`quarter.${yr}.${row.quarter}`, gbp(c.revenuePence)) + (partial ? ' *' : '');
        txt(t, x, y + 4, { size: 8.6, color: partial ? RED : INK, bold: partial, width: qValW - 6, align: 'right' });
      }
    });
    doc.y = y + rowH;
  });
  rule(doc.y + 1);
  txt('* an incomplete quarter - fewer than three months of data.', X0, doc.y + 4, { size: 7.6, color: GREY, italic: true });

  // ================= INSIGHTS =================
  const sec4 = heading('What we flagged this period');
  if (signals.length === 0) {
    txt('Nothing unusual this period - revenue, margin and growth are all within their normal range.',
      X0, doc.y, { width: CW, size: 9.5 });
  } else {
    for (const s of signals.slice(0, 3)) {
      insightBlock(doc, s, expected, allowedMoney, { txt, box });
    }
  }

  // ================= ASSUMPTIONS =================
  const sec5 = heading('Assumptions & notes');
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Modelling rates. ', X0, doc.y, { continued: true });
  doc.font('Helvetica').fillColor(INK).text(
    pdfSafe(`Cost of goods ${pct1((model.assumptions.cogsPct || 0) * 100)} of revenue; marketing ${pct1((model.assumptions.marketingPct || 0) * 100)}; fulfilment ${pct1((model.assumptions.fulfilmentPct || 0) * 100)}; platform & payment fees ${pct1((model.assumptions.feesPct || 0) * 100)}. Founders' compensation and software/overhead are fixed monthly amounts. Every figure is calculated from source data and reconciles to the accounts.`),
    { width: CW }
  );
  doc.y += 4;
  for (const f of model.quality.fixes || []) {
    txt(`•  ${f}`, X0 + 4, doc.y + 2, { size: 7.8, color: GREY, width: CW - 8 });
  }
  doc.y = rule(doc.y + 8) + 4;
  doc.font('Helvetica-Bold').fontSize(7.6).fillColor(GREY).text('Notes.  ', X0, doc.y, { continued: true });
  doc.font('Helvetica').fillColor(GREY).text(
    pdfSafe(`Management information for internal decisions - not audited or statutory accounts, and shown ex-VAT. Source: ${
      model.meta.source === 'xero'
        ? `live Xero pull${model.meta.provenance && model.meta.provenance.organisation ? ` from the "${model.meta.provenance.organisation}" organisation` : ''}`
        : 'client finance workbook'
    }. Generated automatically; every figure is verified against source before this pack is sent.`),
    { width: CW }
  );

  // ---------- page footers ----------
  // Footers must be written INSIDE the page's usable area, otherwise pdfkit treats the
  // overflow as new content and silently appends a page per footer.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const keepBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // let us draw in the footer strip
    doc.font('Helvetica').fontSize(7).fillColor(GREY);
    doc.text(
      pdfSafe(`${model.meta.business}  -  ${cadenceTitle} management accounts  -  generated automatically from ${model.meta.source === 'xero' ? 'Xero' : 'the finance workbook'} on ${model.meta.generatedAt.slice(0, 10)}`),
      X0, 752, { width: CW - 70, lineBreak: false }
    );
    doc.text(`Page ${i + 1} of ${range.count}`, X0, 752, { width: CW, align: 'right', lineBreak: false });
    doc.page.margins.bottom = keepBottom;
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return {
    file,
    charts,
    expected,
    allowedMoney,
    requiredSections: [sec1, sec2, sec3, sec4, sec5],
  };
}

function insightBlock(doc, signal, expected, allowedMoney, h) {
  const colour = signal.severity === 'high' ? RED : signal.severity === 'info' ? TEAL : AMBER;
  const prose = `${signal.body} ${signal.action}`;
  for (const [k, v] of Object.entries(signal.figures || {})) {
    if (v == null) continue;
    const isMoney = /Pence$/.test(k);
    const text = isMoney ? gbp(v) : /Pct$/.test(k) ? signedPct1(v) : null;
    if (!text) continue;
    const safe = pdfSafe(text);
    if (isMoney) allowedMoney.push(safe);
    if ([text, safe, text.replace(/−/g, '-')].some((t) => prose.includes(t))) {
      expected.push({ key: `signal.${signal.id}.${k}`, text: safe });
    }
  }

  if (doc.y > 640) doc.addPage();
  const top = doc.y + 6;
  const padX = 12;
  // measure so the panel fits its content
  doc.font('Helvetica').fontSize(9);
  const bodyH = doc.heightOfString(pdfSafe(signal.body), { width: CW - padX * 2 - 6 });
  const actionH = doc.heightOfString(pdfSafe(`Recommended action: ${signal.action}`), { width: CW - padX * 2 - 6 });
  const h1 = 15 + bodyH + 6 + actionH + 16;

  h.box(X0, top, CW, h1, LIGHT);
  h.box(X0, top, 3.2, h1, colour); // accent bar

  h.txt(`${signal.severity === 'info' ? '' : '! '}${signal.title}`, X0 + padX, top + 7, { size: 10.5, bold: true, color: colour, width: CW - padX * 2 });
  h.txt(signal.body, X0 + padX, top + 22, { size: 9, color: INK, width: CW - padX * 2 - 6 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN).text('Recommended action: ', X0 + padX, doc.y + 4, { continued: true });
  doc.font('Helvetica').fillColor(INK).text(pdfSafe(signal.action), { width: CW - padX * 2 - 6 });
  doc.y = top + h1 + 6;
}

module.exports = { render };
