'use strict';
/**
 * Deterministic P&L computation. All money is integer pence; no floating-point
 * money ever reaches a comparison. The LLM never computes any figure here —
 * this module is the single source of arithmetic truth, and GATE 1 re-checks it.
 */
const { priorYearMonths, priorPeriodMonths, monthName } = require('../period');

const OPEX_LINES = [
  { key: 'marketingPence', label: 'Marketing & advertising', pct: 'marketingPct' },
  { key: 'fulfilmentPence', label: 'Fulfilment & shipping', pct: 'fulfilmentPct' },
  { key: 'feesPence', label: 'Platform & payment fees', pct: 'feesPct' },
  { key: 'foundersPence', label: "Founders' compensation", fixed: 'foundersMonthlyPence' },
  { key: 'softwarePence', label: 'Software & other overhead', fixed: 'softwareMonthlyPence' },
];

/** Per-month derivation: prefer actuals from the source, else model from assumptions. */
function deriveMonth(m, assumptions) {
  const rev = m.revenuePence;
  const cogs = m.cogsPence != null ? m.cogsPence : Math.round(rev * assumptions.cogsPct);
  const fixed = assumptions.fixedByYear ? assumptions.fixedByYear[m.period.slice(0, 4)] : null;
  const opex = {};
  for (const line of OPEX_LINES) {
    if (m.opex && m.opex[line.key] != null) {
      opex[line.key] = m.opex[line.key];
    } else if (line.pct) {
      opex[line.key] = Math.round(rev * (assumptions[line.pct] || 0));
    } else {
      opex[line.key] = fixed ? fixed[line.fixed] || 0 : 0;
    }
  }
  const opexTotal = OPEX_LINES.reduce((s, l) => s + opex[l.key], 0);
  return {
    period: m.period,
    units: m.units,
    revenuePence: rev,
    cogsPence: cogs,
    grossPence: rev - cogs,
    opex,
    opexTotalPence: opexTotal,
    netPence: rev - cogs - opexTotal,
  };
}

/** Aggregate a set of month keys into one column of the P&L. */
function aggregate(derivedByMonth, monthKeys) {
  const rows = monthKeys.map((k) => derivedByMonth.get(k)).filter(Boolean);
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const opex = {};
  for (const line of OPEX_LINES) opex[line.key] = sum((r) => r.opex[line.key]);
  const revenuePence = sum((r) => r.revenuePence);
  const cogsPence = sum((r) => r.cogsPence);
  const opexTotalPence = OPEX_LINES.reduce((s, l) => s + opex[l.key], 0);
  const unitsKnown = rows.every((r) => r.units != null);
  return {
    monthsCovered: rows.map((r) => r.period),
    monthCount: rows.length,
    complete: rows.length === monthKeys.length,
    revenuePence,
    cogsPence,
    grossPence: revenuePence - cogsPence,
    opex,
    opexTotalPence,
    netPence: revenuePence - cogsPence - opexTotalPence,
    units: unitsKnown ? sum((r) => r.units) : null,
  };
}

const pctChange = (now, then) => (then > 0 ? ((now - then) / then) * 100 : null);
const ratioPct = (num, den) => (den > 0 ? (num / den) * 100 : null);

/**
 * Build the full report model for one window.
 * @returns fixed-shape object consumed by render + both verification gates
 */
function build(cleaned, win, cfg) {
  const assumptions = cleaned.assumptions;
  const derivedByMonth = new Map();
  for (const m of cleaned.months) derivedByMonth.set(m.period, deriveMonth(m, assumptions));

  const period = aggregate(derivedByMonth, win.months);
  const prior = aggregate(derivedByMonth, priorPeriodMonths(win.months));
  const yoy = aggregate(derivedByMonth, priorYearMonths(win.months));

  // ---- annual columns for the P&L table ----
  // Fixture supplies an authoritative annual sheet; otherwise derive from months.
  const annualCols =
    cleaned.annual && cleaned.annual.length
      ? cleaned.annual.map((a) => ({
          key: a.key,
          year: a.year,
          partial: a.partial,
          annualOnly: a.annualOnly,
          revenuePence: a.revenuePence,
          cogsPence: a.cogsPence,
          grossPence: a.grossPence,
          opex: a.opex,
          opexTotalPence: a.opex.totalPence,
          netPence: a.netPence,
        }))
      : deriveAnnualFromMonths(derivedByMonth);

  // The report shows the three most recent years (matches the signed-off sample).
  const pnlColumns = annualCols.slice(-3);

  // ---- monthly series (charts + trend narrative) ----
  const monthlySeries = cleaned.months.map((m) => ({
    period: m.period,
    revenuePence: m.revenuePence,
    units: m.units,
  }));

  // ---- quarterly table ----
  const quarters = buildQuarters(monthlySeries);

  const headline = {
    revenuePence: period.revenuePence,
    units: period.units,
    revPerUnitPence: period.units ? Math.round(period.revenuePence / period.units) : null,
    priorPct: pctChange(period.revenuePence, prior.revenuePence),
    yoyPct: pctChange(period.revenuePence, yoy.revenuePence),
    priorLabel: win.compare.priorLabel,
    yoyLabel: win.compare.yoyLabel,
    grossMarginPct: ratioPct(period.grossPence, period.revenuePence),
    netMarginPct: ratioPct(period.netPence, period.revenuePence),
  };

  return {
    schemaVersion: 1,
    meta: {
      business: cfg.business.name,
      cadence: win.cadence,
      periodLabel: win.label,
      periodKind: win.kind,
      start: win.start,
      end: win.end,
      months: win.months,
      currency: cleaned.currency,
      source: cleaned.source,
      grain: cleaned.grain,
      provenance: cleaned.provenance,
      generatedAt: new Date().toISOString(),
    },
    headline,
    period,
    prior,
    yoy,
    pnlColumns,
    annualCols,
    monthlySeries,
    quarters,
    assumptions: {
      cogsPct: assumptions.cogsPct,
      marketingPct: assumptions.marketingPct,
      fulfilmentPct: assumptions.fulfilmentPct,
      feesPct: assumptions.feesPct,
      fixedByYear: assumptions.fixedByYear,
    },
    quality: cleaned.quality,
    opexLines: OPEX_LINES.map((l) => ({ key: l.key, label: l.label })),
  };
}

function deriveAnnualFromMonths(derivedByMonth) {
  const byYear = new Map();
  for (const [period] of derivedByMonth) {
    const y = period.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(period);
  }
  return [...byYear.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([y, months]) => {
      const agg = aggregate(derivedByMonth, months);
      return {
        key: months.length === 12 ? `FY${y}` : `FY${y} YTD`,
        year: Number(y),
        partial: months.length !== 12,
        annualOnly: false,
        revenuePence: agg.revenuePence,
        cogsPence: agg.cogsPence,
        grossPence: agg.grossPence,
        opex: { ...agg.opex, totalPence: agg.opexTotalPence },
        opexTotalPence: agg.opexTotalPence,
        netPence: agg.netPence,
      };
    });
}

function buildQuarters(series) {
  const years = [...new Set(series.map((s) => s.period.slice(0, 4)))].sort();
  const rows = [1, 2, 3, 4].map((q) => {
    const byYear = {};
    for (const y of years) {
      const months = series.filter((s) => {
        const m = Number(s.period.slice(5, 7));
        return s.period.slice(0, 4) === y && Math.ceil(m / 3) === q;
      });
      byYear[y] = months.length
        ? { revenuePence: months.reduce((s, m) => s + m.revenuePence, 0), monthCount: months.length }
        : null;
    }
    return { quarter: `Q${q}`, byYear };
  });
  return { years, rows };
}

module.exports = { build, deriveMonth, aggregate, OPEX_LINES, pctChange, ratioPct };
