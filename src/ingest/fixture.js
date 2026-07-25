'use strict';
/**
 * Fixture provider — reads the client's finance workbook.
 *
 * This is what runs until Xero access is granted. It produces exactly the same
 * raw shape as the Xero adapter, so the whole pipeline (transform, both gates,
 * render, deliver) is real and fully exercised today.
 *
 * Read-level messiness is handled here (the workbook's month-label column is
 * unreliable, so labels are derived from row order rather than trusted).
 * Value-level quality checks live in transform/clean.js.
 */
const path = require('path');
const XLSX = require('xlsx');
const { addMonths } = require('../period');

const P = (pounds) => Math.round(Number(pounds) * 100); // → integer pence

function findRow(rows, predicate) {
  return rows.find((r) => predicate(String(r[0] == null ? '' : r[0])));
}
const startsWith = (s) => (label) => label.toLowerCase().startsWith(s.toLowerCase());
const includes = (s) => (label) => label.toLowerCase().includes(s.toLowerCase());

async function pull(cfg, win, escalation = 1) {
  const file = path.resolve(cfg._root, cfg.dataSource.fixture.path);
  const wb = XLSX.readFile(file, { cellDates: false });

  // ---------- Monthly Revenue History ----------
  const mSheet = wb.Sheets['Monthly Revenue History'];
  if (!mSheet) throw new Error('Workbook is missing the "Monthly Revenue History" sheet');
  const mRows = XLSX.utils.sheet_to_json(mSheet, { header: 1, blankrows: false });

  // Locate the header row, then read revenue (col 1) and units (col 2).
  const hIdx = mRows.findIndex((r) => String(r[0] || '').toLowerCase() === 'month');
  if (hIdx < 0) throw new Error('Could not locate the header row of "Monthly Revenue History"');

  // The first data row carries a trustworthy label; later labels are patchy, so
  // the series is rebuilt by incrementing from the first one (row order is sound).
  const dataRows = [];
  for (let i = hIdx + 1; i < mRows.length; i++) {
    const r = mRows[i];
    const rev = Number(r[1]);
    const units = Number(r[2]);
    if (!Number.isFinite(rev) || rev <= 0) continue; // skips the footnote row
    dataRows.push({ labelAsRead: r[0] == null ? null : String(r[0]).trim(), revenue: rev, units });
  }
  const firstLabel = dataRows.map((d) => d.labelAsRead).find((l) => /^\d{4}-\d{2}$/.test(l || ''));
  if (!firstLabel) throw new Error('No usable month label found to anchor the monthly series');

  const months = dataRows.map((d, i) => ({
    period: addMonths(firstLabel, i),
    revenuePence: P(d.revenue),
    units: Number.isFinite(d.units) ? d.units : null,
    labelAsRead: d.labelAsRead, // kept so clean.js can audit label drift
  }));

  // ---------- Annual Financial Summary ----------
  const aSheet = wb.Sheets['Annual Financial Summary'];
  if (!aSheet) throw new Error('Workbook is missing the "Annual Financial Summary" sheet');
  const aRows = XLSX.utils.sheet_to_json(aSheet, { header: 1, blankrows: false });
  const headerRow = aRows.find((r) => String(r[1] || '').toUpperCase().startsWith('FY'));
  if (!headerRow) throw new Error('Could not locate the FY header row of the annual summary');

  const cols = [];
  for (let c = 1; c < headerRow.length; c++) {
    const key = String(headerRow[c] || '').trim();
    if (key) cols.push({ c, key });
  }
  const pick = (pred) => findRow(aRows, pred) || [];
  const revRow = pick(startsWith('Revenue'));
  const cogsRow = pick(startsWith('Cost of goods sold'));
  const grossRow = pick(startsWith('Gross profit'));
  const mktRow = pick(startsWith('Marketing'));
  const fulRow = pick(startsWith('Fulfilment'));
  const feeRow = pick(startsWith('Platform'));
  const fndRow = pick(includes("Founders' compensation"));
  const sftRow = pick(startsWith('Software'));
  const opexRow = pick(startsWith('Total operating'));
  const netRow = pick(startsWith('Net profit'));

  const annual = cols.map(({ c, key }) => {
    const yearMatch = key.match(/(\d{4})/);
    return {
      key: key.replace(/\*/g, '').replace(/\s+/g, ' ').trim(),
      year: yearMatch ? Number(yearMatch[1]) : null,
      partial: /ytd/i.test(key),
      annualOnly: /\*/.test(String(headerRow[c])), // FY2021-2023 have no monthly split
      revenuePence: P(revRow[c] || 0),
      cogsPence: P(cogsRow[c] || 0),
      grossPence: P(grossRow[c] || 0),
      opex: {
        marketingPence: P(mktRow[c] || 0),
        fulfilmentPence: P(fulRow[c] || 0),
        feesPence: P(feeRow[c] || 0),
        foundersPence: P(fndRow[c] || 0),
        softwarePence: P(sftRow[c] || 0),
        totalPence: P(opexRow[c] || 0),
      },
      netPence: P(netRow[c] || 0),
    };
  });

  // ---------- Assumptions ----------
  const sSheet = wb.Sheets['Assumptions'];
  const sRows = sSheet ? XLSX.utils.sheet_to_json(sSheet, { header: 1, blankrows: false }) : [];
  const rate = (needle, fallback) => {
    const row = findRow(sRows, includes(needle));
    const v = row ? Number(row[1]) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };
  const fixedRow = (needle) => findRow(sRows, includes(needle)) || [];
  const fixedHeader = findRow(sRows, (l) => l.toLowerCase().startsWith('cost line')) || [];
  const fixedByYear = {};
  const fnd = fixedRow("Founders' compensation");
  const sft = fixedRow('Software, subscriptions');
  for (let c = 1; c < fixedHeader.length; c++) {
    const y = String(fixedHeader[c] || '').trim();
    if (!/^\d{4}$/.test(y)) continue;
    fixedByYear[y] = {
      foundersMonthlyPence: P(fnd[c] || 0),
      softwareMonthlyPence: P(sft[c] || 0),
    };
  }

  return {
    source: 'fixture',
    grain: cfg.dataSource.fixture.grain || 'month',
    pulledAt: new Date().toISOString(),
    currency: cfg.business.currency,
    escalationUsed: escalation,
    months,
    annual,
    assumptions: {
      cogsPct: rate('Cost of goods sold, % of revenue', 0.42),
      marketingPct: rate('Marketing & advertising, % of revenue', 0.14),
      fulfilmentPct: rate('Fulfilment & shipping, % of revenue', 0.09),
      feesPct: rate('Platform & payment processing fees', 0.035),
      fixedByYear,
    },
    provenance: {
      kind: 'workbook',
      file: cfg.dataSource.fixture.path,
      sheets: ['Monthly Revenue History', 'Annual Financial Summary', 'Assumptions'],
      note:
        'Figures read from the client-supplied finance workbook. Replaced by a live Xero pull ' +
        'once access is granted — same shape, no pipeline change.',
    },
  };
}

module.exports = { pull };
