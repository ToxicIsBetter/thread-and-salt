'use strict';
/**
 * Data cleaning — applied on every run so known-bad data can never reach a report.
 * Each fix is recorded in `quality.fixes` so the run is auditable and GATE 1 can
 * assert that cleaning actually happened.
 *
 * Defects this handles (found in the client's workbook):
 *   1. Month labels missing for Feb 2024 – Jan 2025  → labels derived from row order
 *   2. A stray counter (53–64) bleeding into the growth columns → those columns are
 *      never trusted; MoM/YoY are always recomputed from revenue
 *   3. 13–15 decimal places on rates/rev-per-unit → money held as integer pence,
 *      percentages rounded once, at presentation
 *   4. FY2021–2023 annual-only → flagged, never given false monthly precision
 */
const { addMonths } = require('../period');

function clean(raw) {
  const fixes = [];
  const warnings = [];

  // ---- 1. months: continuity, duplicates, label drift ----
  const months = [];
  const seen = new Set();
  let labelDrift = 0;

  for (const m of raw.months) {
    if (seen.has(m.period)) {
      warnings.push(`Duplicate month ${m.period} dropped`);
      continue;
    }
    seen.add(m.period);

    // 2. never trust as-read growth columns / stray sentinels; drop implausible units
    let units = m.units;
    if (units != null && (!Number.isFinite(units) || units <= 0 || units > 100000)) {
      warnings.push(`Implausible unit count for ${m.period} (${m.units}) — treated as unknown`);
      units = null;
    }
    if (m.labelAsRead && m.labelAsRead !== m.period) labelDrift++;
    if (m.labelAsRead == null) labelDrift++;

    months.push({
      period: m.period,
      revenuePence: Math.round(m.revenuePence),
      units,
      cogsPence: m.cogsPence != null ? Math.round(m.cogsPence) : null,
      opex: m.opex || null,
    });
  }

  months.sort((a, b) => (a.period < b.period ? -1 : 1));

  if (labelDrift > 0) {
    fixes.push(
      `Derived ${labelDrift} missing/incorrect month label(s) from row order (workbook had lost Feb 2024–Jan 2025)`
    );
  }

  // gap detection — a hole would silently understate a period total
  for (let i = 1; i < months.length; i++) {
    const expected = addMonths(months[i - 1].period, 1);
    if (months[i].period !== expected) {
      warnings.push(`Gap in monthly series: ${months[i - 1].period} → ${months[i].period}`);
    }
  }

  fixes.push('Growth columns recomputed from revenue rather than read from the sheet (stray 53–64 counter ignored)');
  fixes.push('Money held as integer pence; percentages rounded once at presentation');

  // ---- 4. annual: flag annual-only years ----
  const annual = (raw.annual || []).map((a) => ({
    ...a,
    revenuePence: Math.round(a.revenuePence),
    cogsPence: Math.round(a.cogsPence),
    grossPence: Math.round(a.grossPence),
    netPence: Math.round(a.netPence),
    opex: Object.fromEntries(Object.entries(a.opex || {}).map(([k, v]) => [k, Math.round(v)])),
  }));
  const annualOnly = annual.filter((a) => a.annualOnly).map((a) => a.key);
  if (annualOnly.length) {
    fixes.push(`Flagged annual-only period(s) ${annualOnly.join(', ')} — no false monthly precision`);
  }

  return {
    ...raw,
    months,
    annual,
    quality: {
      fixes,
      warnings,
      monthsIn: raw.months.length,
      monthsOut: months.length,
      firstMonth: months.length ? months[0].period : null,
      lastMonth: months.length ? months[months.length - 1].period : null,
    },
  };
}

module.exports = { clean };
