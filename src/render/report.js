'use strict';
/**
 * Renders the management-accounts pack as .docx, in the exact shape of the
 * signed-off sample: title block, At a glance KPIs, P&L summary, revenue trend
 * (two charts) + quarterly table, the insight box, and notes.
 *
 * Returns { file, expected } where `expected` is the figure ledger GATE 2 uses to
 * prove every number reached the document intact.
 */
const fs = require('fs');
const path = require('path');
const docx = require('docx');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, Header, Footer, PageNumber, ImageRun, TabStopType, LevelFormat,
} = docx;
const { gbp, gbpParen, pct1, signedPct1, int, slug } = require('../format');
const { renderCharts } = require('./charts');

const NAVY = '1F3A4D', TEAL = '2E6E7E', SAND = 'F1ECE2', LIGHT = 'F7F4EE',
  GREY = '5A5A5A', RULE = 'C9BFA8', RED = 'B4553F', GREEN = '3B6E4B';
const FONT = 'Calibri';
const CW = 9360;

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 110 },
  children: [new TextRun({ text: t, bold: true, size: 28, color: NAVY, font: FONT })],
  border: { bottom: { color: RULE, size: 8, space: 6, style: BorderStyle.SINGLE } } });
const T = (t, o = {}) => new TextRun({ text: t, size: o.size ?? 21, bold: o.bold, italics: o.italics, color: o.color ?? '222222', font: FONT });
const P = (runs, o = {}) => new Paragraph({ spacing: { after: o.after ?? 120, line: 276 }, alignment: o.align,
  children: (Array.isArray(runs) ? runs : [runs]).map((r) => (typeof r === 'string' ? T(r) : r)) });
const spacer = (h = 80) => new Paragraph({ spacing: { after: h }, children: [] });

function cell(text, { w, fill, bold, color, align, size } = {}) {
  const arr = Array.isArray(text) ? text : [text];
  return new TableCell({ width: { size: w, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
    margins: { top: 46, bottom: 46, left: 100, right: 100 },
    children: arr.map((c) => (typeof c === 'string'
      ? new Paragraph({ alignment: align, spacing: { after: 0 },
          children: [new TextRun({ text: c, bold, size: size ?? 19, color: color ?? '222222', font: FONT })] })
      : c)) });
}
function table(cols, rows) {
  return new Table({ columnWidths: cols, width: { size: cols.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: RULE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E4DECF' }, insideVertical: { style: BorderStyle.NONE } }, rows });
}
function kpi(label, value, sub, subColor) {
  return new TableCell({ width: { size: 2340, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: SAND },
    margins: { top: 120, bottom: 120, left: 130, right: 130 },
    children: [
      new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: label, size: 15, color: GREY, font: FONT, allCaps: true, characterSpacing: 20 })] }),
      new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: value, bold: true, size: 30, color: NAVY, font: FONT })] }),
      new Paragraph({ children: [new TextRun({ text: sub, size: 16, color: subColor || TEAL, font: FONT, bold: true })] }),
    ] });
}
const img = (file, w, h) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60, before: 40 },
  children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width: w, height: h } })] });

/**
 * @param {object} model  report model from transform/pnl.js
 * @param {object[]} signals from insight/signals.js
 * @param {string} dir  attempt output directory
 * @param {object} opts { escalation }
 */
async function render(model, signals, dir, opts = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const charts = renderCharts(model, dir);

  const expected = [];      // figures that MUST appear in the document
  const allowedMoney = [];  // additional money strings that are legitimately traceable
  const note = (key, text) => { expected.push({ key, text: String(text) }); return String(text); };

  const cadenceTitle = model.meta.cadence.charAt(0).toUpperCase() + model.meta.cadence.slice(1);
  const cols = model.pnlColumns;

  // ---- KPI strip (period-specific) ----
  const kpiRevenue = note('headline.revenue', gbp(model.period.revenuePence));
  const kpiUnits = model.period.units != null ? note('headline.units', int(model.period.units)) : '—';
  const kpiPrior = model.headline.priorPct != null ? note('headline.priorPct', signedPct1(model.headline.priorPct)) : '—';
  const kpiYoy = model.headline.yoyPct != null ? note('headline.yoyPct', signedPct1(model.headline.yoyPct)) : '—';
  const kpiNetMargin = note('headline.netMargin', pct1(model.headline.netMarginPct));

  // ---- P&L rows ----
  const plRow = (label, values, { bold, fill, color, indent } = {}) =>
    new TableRow({ children: [
      cell((indent ? '   ' : '') + label, { w: 3360, fill, bold, color }),
      ...values.map((v) => cell(v, { w: 2000, fill, bold, color, align: AlignmentType.RIGHT })),
    ] });

  const pl = (getter, key, fmt = gbp) => cols.map((c, i) => note(`pnl.${key}.${cols[i].key}`, fmt(getter(c))));

  const doc = new Document({
    creator: 'Negative Zero',
    title: `${model.meta.business} — ${cadenceTitle} Management Accounts — ${model.meta.periodLabel}`,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    numbering: { config: [{ reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•',
      alignment: AlignmentType.LEFT, style: { run: { color: TEAL }, paragraph: { indent: { left: 360, hanging: 210 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1360, bottom: 1200, left: 1440, right: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CW }],
        border: { bottom: { color: RULE, size: 4, space: 4, style: BorderStyle.SINGLE } },
        children: [new TextRun({ text: model.meta.business.toUpperCase(), bold: true, size: 15, color: NAVY, font: FONT }),
          new TextRun({ text: `\t${cadenceTitle} Management Accounts`, size: 15, color: GREY, font: FONT })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CW }],
        children: [new TextRun({ text: `Generated automatically from ${model.meta.source === 'xero' ? 'Xero' : 'the finance workbook'} · ${model.meta.generatedAt.slice(0, 10)}`, size: 14, color: GREY, font: FONT }),
          new TextRun({ children: ['\tPage ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 14, color: GREY, font: FONT })] })] }) },
      children: [
        // ---------- title ----------
        new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: 'Management Accounts', bold: true, size: 46, color: NAVY, font: FONT })] }),
        new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: `${cadenceTitle} pack — ${model.meta.periodLabel}`, size: 22, color: TEAL, font: FONT, italics: true })] }),
        new Paragraph({ border: { bottom: { color: RULE, size: 10, space: 6, style: BorderStyle.SINGLE } }, spacing: { after: 150 },
          children: [new TextRun({ text: `Period: ${model.meta.start} to ${model.meta.end}  ·  Currency: ${model.meta.currency}  ·  Basis: management information (ex-VAT)`, size: 17, color: GREY, font: FONT })] }),

        // ---------- at a glance ----------
        H1('At a glance'),
        P([
          T(`${model.meta.periodLabel} revenue was `), T(kpiRevenue, { bold: true }),
          T(`, ${model.headline.priorPct == null ? '' : `${signedPct1(model.headline.priorPct)} on the ${model.headline.priorLabel}`}`),
          T(`${model.headline.yoyPct == null ? '' : ` and ${signedPct1(model.headline.yoyPct)} on the ${model.headline.yoyLabel}`}. `),
          T(`Net margin for the period was ${kpiNetMargin}.`),
        ]),
        spacer(40),
        new Table({ columnWidths: [2340, 2340, 2340, 2340], width: { size: 9360, type: WidthType.DXA },
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 8, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.SINGLE, size: 8, color: 'FFFFFF' } },
          rows: [new TableRow({ children: [
            kpi('Revenue', kpiRevenue, model.meta.periodLabel, TEAL),
            kpi('Units sold', kpiUnits, model.period.units != null ? 'in the period' : 'awaiting unit data', TEAL),
            kpi(`vs ${model.headline.priorLabel}`, kpiPrior, 'sequential change', model.headline.priorPct >= 0 ? GREEN : RED),
            kpi(`vs ${model.headline.yoyLabel}`, kpiYoy, 'year-on-year', model.headline.yoyPct >= 0 ? GREEN : RED),
          ] })] }),
        spacer(120),

        // ---------- P&L ----------
        H1('Profit & loss summary'),
        P('Revenue, cost of goods, operating costs and profit at annual level. A year-to-date column is a part-year figure and not directly comparable to a full year.'),
        table([3360, 2000, 2000, 2000], [
          new TableRow({ tableHeader: true, children: [
            cell('£', { w: 3360, fill: NAVY, bold: true, color: 'FFFFFF' }),
            ...cols.map((c) => cell(c.key, { w: 2000, fill: NAVY, bold: true, color: 'FFFFFF', align: AlignmentType.RIGHT })),
          ] }),
          plRow('Revenue', pl((c) => c.revenuePence, 'revenue'), { bold: true, fill: LIGHT }),
          plRow('Cost of goods sold', pl((c) => c.cogsPence, 'cogs'), { indent: true }),
          plRow('Gross profit', pl((c) => c.grossPence, 'gross'), { bold: true, color: NAVY }),
          plRow('Gross margin', cols.map((c) => note(`pnl.grossMargin.${c.key}`, pct1((c.grossPence / c.revenuePence) * 100))), { fill: LIGHT, color: GREY }),
          plRow('Marketing & advertising', pl((c) => c.opex.marketingPence, 'marketing'), { indent: true }),
          plRow('Fulfilment & shipping', pl((c) => c.opex.fulfilmentPence, 'fulfilment'), { indent: true }),
          plRow('Platform & payment fees', pl((c) => c.opex.feesPence, 'fees'), { indent: true }),
          plRow("Founders' compensation", pl((c) => c.opex.foundersPence, 'founders'), { indent: true }),
          plRow('Software & other overhead', pl((c) => c.opex.softwarePence, 'software'), { indent: true }),
          plRow('Total operating expenses', pl((c) => c.opexTotalPence, 'opexTotal'), { fill: LIGHT }),
          plRow('Net profit', pl((c) => c.netPence, 'net'), { bold: true, fill: SAND, color: NAVY }),
          plRow('Net margin', cols.map((c) => note(`pnl.netMargin.${c.key}`, pct1((c.netPence / c.revenuePence) * 100))), { bold: true, color: TEAL }),
        ]),
        spacer(50),
        P([T('Read this: ', { bold: true, color: NAVY }), T(`gross margin holds at ${pct1((cols[cols.length - 1].grossPence / cols[cols.length - 1].revenuePence) * 100)}, so the business keeps a consistent slice of every sale. Because some costs are fixed, a soft period squeezes net margin a little harder than the revenue drop alone.`)]),

        new Paragraph({ children: [new PageBreak()] }),

        // ---------- trend ----------
        H1('Revenue trend'),
        P(`Monthly revenue across the available history (${model.monthlySeries[0].period} onward). The rhythm is clear: a Q4 lift each November–December, softer summers, and steady year-on-year growth.`),
        img(charts.monthly, 620, 214),
        spacer(30),
        img(charts.quarterly, 620, 200),
        spacer(30),
        table([2340, ...model.quarters.years.map(() => Math.floor(7020 / model.quarters.years.length))], [
          new TableRow({ tableHeader: true, children: [
            cell('Quarter', { w: 2340, fill: NAVY, bold: true, color: 'FFFFFF' }),
            ...model.quarters.years.map((y) => cell(`FY${y}`, { w: Math.floor(7020 / model.quarters.years.length), fill: NAVY, bold: true, color: 'FFFFFF', align: AlignmentType.RIGHT })),
          ] }),
          ...model.quarters.rows.map((row, i) => new TableRow({ children: [
            cell(row.quarter, { w: 2340, fill: i % 2 === 0 ? LIGHT : undefined, bold: true }),
            ...model.quarters.years.map((y) => {
              const c = row.byYear[y];
              const w = Math.floor(7020 / model.quarters.years.length);
              if (!c) return cell('—', { w, fill: i % 2 === 0 ? LIGHT : undefined, align: AlignmentType.RIGHT, color: GREY });
              const txt = note(`quarter.${y}.${row.quarter}`, gbp(c.revenuePence)) + (c.monthCount < 3 ? ' *' : '');
              return cell(txt, { w, fill: i % 2 === 0 ? LIGHT : undefined, align: AlignmentType.RIGHT, color: c.monthCount < 3 ? RED : '222222', bold: c.monthCount < 3 });
            }),
          ] })),
        ]),
        P([T('* an incomplete quarter — fewer than three months of data.', { size: 16, color: GREY, italics: true })], { after: 60 }),

        // ---------- insight ----------
        H1('What we flagged this period'),
        ...(signals.length === 0
          ? [P('Nothing unusual this period — revenue, margin and growth are all within their normal range.')]
          : signals.slice(0, 3).map((s) => insightBox(s, expected, allowedMoney))),
        spacer(100),

        // ---------- assumptions + notes ----------
        H1('Assumptions & notes'),
        P([T('Modelling rates. ', { bold: true, color: NAVY }),
          T(`Cost of goods ${pct1((model.assumptions.cogsPct || 0) * 100)} of revenue; marketing ${pct1((model.assumptions.marketingPct || 0) * 100)}; fulfilment ${pct1((model.assumptions.fulfilmentPct || 0) * 100)}; platform & payment fees ${pct1((model.assumptions.feesPct || 0) * 100)}. Founders' compensation and software/overhead are fixed monthly amounts. Every figure here is calculated from source data and reconciles to the accounts.`)]),
        ...(model.quality.fixes || []).map((f) => new Paragraph({ numbering: { reference: 'b', level: 0 }, spacing: { after: 50 },
          children: [T(f, { size: 17, color: GREY })] })),
        new Paragraph({ spacing: { before: 60 }, border: { top: { color: RULE, size: 4, space: 6, style: BorderStyle.SINGLE } },
          children: [new TextRun({ text: 'Notes.  ', bold: true, size: 16, color: GREY, font: FONT }),
            new TextRun({ text: `Management information for internal decisions — not audited or statutory accounts, and shown ex-VAT. Source: ${model.meta.source === 'xero' ? 'live Xero pull' : 'client finance workbook'}. Generated automatically; every figure is verified against source before this pack is sent.`, size: 16, color: GREY, font: FONT })] }),
      ],
    }],
  });

  const fileName = `${slug(model.meta.business)}-${model.meta.cadence}-${slug(model.meta.periodLabel)}.docx`;
  const file = path.join(dir, fileName);
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(file, buf);

  return { file, charts, expected, allowedMoney, requiredSections: [
    'At a glance', 'Profit & loss summary', 'Revenue trend', 'What we flagged this period', 'Assumptions & notes',
  ] };
}

function insightBox(signal, expected, allowedMoney) {
  const colour = signal.severity === 'high' ? RED : signal.severity === 'info' ? TEAL : 'B07A2F';
  // Every money/percentage the signal *quotes* must reach the document (→ expected),
  // and every figure the signal *could* quote must be traceable to the model
  // (→ allowedMoney), so the box can neither drop a figure nor invent one.
  const prose = `${signal.body} ${signal.action}`;
  for (const [k, v] of Object.entries(signal.figures || {})) {
    if (v == null) continue;
    const isMoney = /Pence$/.test(k);
    const text = isMoney ? gbp(v) : /Pct$/.test(k) ? signedPct1(v) : null;
    if (!text) continue;
    if (isMoney) allowedMoney.push(text);
    const variants = [text, text.replace(/−/g, '-'), text.replace(/-/g, '−')];
    if (variants.some((t) => prose.includes(t))) {
      expected.push({ key: `signal.${signal.id}.${k}`, text });
    }
  }
  return new Table({ columnWidths: [CW], width: { size: CW, type: WidthType.DXA },
    borders: { top: { style: BorderStyle.SINGLE, size: 12, color: colour }, bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 12, color: colour }, right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [new TableCell({ width: { size: CW, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: LIGHT }, margins: { top: 150, bottom: 150, left: 200, right: 200 },
      children: [
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${signal.severity === 'info' ? 'ℹ' : '⚠'}  ${signal.title}`, bold: true, size: 22, color: colour, font: FONT })] }),
        new Paragraph({ spacing: { after: 70 }, children: [new TextRun({ text: signal.body, size: 20, color: '222222', font: FONT })] }),
        new Paragraph({ children: [new TextRun({ text: 'Recommended action: ', bold: true, size: 20, color: GREEN, font: FONT }),
          new TextRun({ text: signal.action, size: 20, color: '222222', font: FONT })] }),
      ] })] })] });
}

module.exports = { render };
