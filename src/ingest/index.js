'use strict';
/**
 * Ingest adapter layer.
 *
 * Every provider returns the SAME raw shape, so the rest of the pipeline is
 * source-agnostic. Switching from the fixture workbook to live Xero is a
 * one-line config change (dataSource.provider = "xero"), no pipeline edits.
 *
 * Raw contract:
 * {
 *   source, grain, pulledAt, currency,
 *   months:  [{ period:'YYYY-MM', revenuePence, units }],
 *   annual:  [{ key:'FY2024', year, revenuePence, cogsPence, opex:{...}, netPence, partial }],
 *   assumptions: { cogsPct, marketingPct, fulfilmentPct, feesPct, fixedByYear:{ '2024': {founders, software} } },
 *   provenance: { … how to trace each figure back to source … }
 * }
 */
const fixture = require('./fixture');
const xero = require('./xero');

const PROVIDERS = { fixture, xero };

/**
 * @param {object} cfg
 * @param {object} win  window from period.js
 * @param {number} escalation  1..3 — retry rung (see IMPLEMENTATION-PLAN Loop A)
 */
async function ingest(cfg, win, escalation = 1) {
  const name = cfg.dataSource.provider;
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown data provider "${name}" (expected: fixture | xero)`);
  const raw = await provider.pull(cfg, win, escalation);

  // Provider contract enforcement — fail fast and loudly rather than let a
  // malformed pull reach the transform stage.
  if (!raw || !Array.isArray(raw.months) || raw.months.length === 0) {
    throw new Error(`Provider "${name}" returned no monthly data`);
  }
  for (const m of raw.months) {
    if (!/^\d{4}-\d{2}$/.test(m.period)) throw new Error(`Bad period key from "${name}": ${m.period}`);
    if (!Number.isFinite(m.revenuePence)) throw new Error(`Non-numeric revenue for ${m.period}`);
  }
  raw.source = name;
  return raw;
}

/** Does the configured source have fine enough grain for this cadence? */
function grainSufficient(cfg, win) {
  const provider = cfg.dataSource.provider;
  const grain = cfg.dataSource[provider] ? cfg.dataSource[provider].grain : 'month';
  if (win.requiresGrain === 'day') return grain === 'day';
  return true;
}

module.exports = { ingest, grainSufficient, PROVIDERS };
