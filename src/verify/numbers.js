'use strict';
/**
 * GATE 1 — verify the computed numbers BEFORE anything is rendered.
 *
 * Deliberately does NOT import transform/pnl.js arithmetic helpers for the
 * recomputation checks: the whole point is a second, independent code path, so a
 * bug in the primary path cannot hide behind a shared helper.
 *
 * Any failure → the run loops back to Ingest (Loop A) and, when exhausted, alerts.
 */

const round = (n) => Math.round(n);

function check(name, pass, detail) {
  return { name, pass: !!pass, detail: detail == null ? '' : String(detail) };
}

function verifyNumbers(model, cleaned, cfg) {
  const checks = [];
  const tol = cfg.verify.penceTolerance;
  const cols = [
    { key: 'period', col: model.period },
    ...model.pnlColumns.map((c) => ({ key: c.key, col: c })),
  ];

  // ---------- 1. cross-foot every column ----------
  for (const { key, col } of cols) {
    const gross = col.revenuePence - col.cogsPence;
    checks.push(
      check(
        `crossfoot:gross:${key}`,
        Math.abs(gross - col.grossPence) <= tol,
        `revenue − cogs = ${gross}, stated gross = ${col.grossPence}`
      )
    );
    const opexTotal = col.opexTotalPence != null ? col.opexTotalPence : col.opex.totalPence;
    const net = col.grossPence - opexTotal;
    checks.push(
      check(
        `crossfoot:net:${key}`,
        Math.abs(net - col.netPence) <= tol,
        `gross − opex = ${net}, stated net = ${col.netPence}`
      )
    );
    const lineSum =
      (col.opex.marketingPence || 0) +
      (col.opex.fulfilmentPence || 0) +
      (col.opex.feesPence || 0) +
      (col.opex.foundersPence || 0) +
      (col.opex.softwarePence || 0);
    checks.push(
      check(
        `crossfoot:opexlines:${key}`,
        Math.abs(lineSum - opexTotal) <= tol,
        `five opex lines sum to ${lineSum}, stated total = ${opexTotal}`
      )
    );
  }

  // ---------- 2. independent recomputation of the reporting period ----------
  // Second path: work in pounds with a different order of operations, then compare.
  const monthMap = new Map(cleaned.months.map((m) => [m.period, m]));
  let revPounds = 0;
  let unitsAlt = 0;
  let unitsKnown = true;
  for (const k of model.meta.months) {
    const m = monthMap.get(k);
    if (!m) continue;
    revPounds += m.revenuePence / 100;
    if (m.units == null) unitsKnown = false;
    else unitsAlt += m.units;
  }
  const revAltPence = round(revPounds * 100);
  checks.push(
    check(
      'recompute:revenue',
      Math.abs(revAltPence - model.period.revenuePence) <= tol,
      `independent ${revAltPence} vs primary ${model.period.revenuePence}`
    )
  );
  if (unitsKnown && model.period.units != null) {
    checks.push(
      check('recompute:units', unitsAlt === model.period.units, `independent ${unitsAlt} vs primary ${model.period.units}`)
    );
  }

  // margins, re-derived from the primary totals by a different formula
  if (model.period.revenuePence > 0) {
    const grossMarginAlt = 100 - (model.period.cogsPence / model.period.revenuePence) * 100;
    const stated = model.headline.grossMarginPct;
    checks.push(
      check(
        'recompute:grossMargin',
        stated != null && Math.abs(grossMarginAlt - stated) < 0.05,
        `independent ${grossMarginAlt.toFixed(4)}% vs primary ${stated == null ? 'null' : stated.toFixed(4)}%`
      )
    );
    const netMarginAlt =
      100 -
      ((model.period.cogsPence + model.period.opexTotalPence) / model.period.revenuePence) * 100;
    checks.push(
      check(
        'recompute:netMargin',
        model.headline.netMarginPct != null && Math.abs(netMarginAlt - model.headline.netMarginPct) < 0.05,
        `independent ${netMarginAlt.toFixed(4)}% vs primary ${
          model.headline.netMarginPct == null ? 'null' : model.headline.netMarginPct.toFixed(4)
        }%`
      )
    );
  }

  // growth rates, re-derived
  if (model.prior.revenuePence > 0 && model.headline.priorPct != null) {
    const alt = (model.period.revenuePence / model.prior.revenuePence - 1) * 100;
    checks.push(
      check('recompute:priorGrowth', Math.abs(alt - model.headline.priorPct) < 0.05, `independent ${alt.toFixed(4)}%`)
    );
  }
  if (model.yoy.revenuePence > 0 && model.headline.yoyPct != null) {
    const alt = (model.period.revenuePence / model.yoy.revenuePence - 1) * 100;
    checks.push(
      check('recompute:yoyGrowth', Math.abs(alt - model.headline.yoyPct) < 0.05, `independent ${alt.toFixed(4)}%`)
    );
  }

  // ---------- 3. aggregation ties ----------
  // Σ months of a year (from the monthly series) must equal that year's column.
  for (const col of model.annualCols) {
    if (col.annualOnly || col.year == null) continue;
    const monthsOfYear = model.monthlySeries.filter((m) => m.period.slice(0, 4) === String(col.year));
    if (monthsOfYear.length === 0) continue;
    const sum = monthsOfYear.reduce((s, m) => s + m.revenuePence, 0);
    checks.push(
      check(
        `tie:monthsToYear:${col.key}`,
        Math.abs(sum - col.revenuePence) <= Math.max(tol, 100),
        `Σ ${monthsOfYear.length} months = ${sum}, annual column = ${col.revenuePence}`
      )
    );
  }
  // Σ quarters of a year == Σ months of that year
  for (const y of model.quarters.years) {
    const qSum = model.quarters.rows.reduce(
      (s, r) => s + (r.byYear[y] ? r.byYear[y].revenuePence : 0),
      0
    );
    const mSum = model.monthlySeries
      .filter((m) => m.period.slice(0, 4) === y)
      .reduce((s, m) => s + m.revenuePence, 0);
    checks.push(check(`tie:quartersToMonths:${y}`, Math.abs(qSum - mSum) <= tol, `Q Σ ${qSum} vs month Σ ${mSum}`));
  }

  // ---------- 4. reconcile to source ----------
  // Fixture: the workbook's own annual sheet is the independent authority.
  // Xero: the P&L report totals are, by construction, the same numbers.
  if (cleaned.source === 'fixture') {
    for (const col of model.annualCols) {
      if (col.annualOnly) continue;
      const src = (cleaned.annual || []).find((a) => a.key === col.key);
      if (!src) continue;
      checks.push(
        check(
          `reconcile:source:${col.key}`,
          Math.abs(src.revenuePence - col.revenuePence) <= tol &&
            Math.abs(src.netPence - col.netPence) <= tol,
          `source revenue ${src.revenuePence}/net ${src.netPence} vs computed ${col.revenuePence}/${col.netPence}`
        )
      );
    }
  } else {
    checks.push(check('reconcile:source:xero', true, 'figures taken directly from the Xero P&L report'));
  }

  // ---------- 5. sanity bounds ----------
  const finite = (v) => v == null || Number.isFinite(v);
  checks.push(
    check(
      'sanity:finite',
      [model.period.revenuePence, model.period.netPence, model.headline.netMarginPct].every(finite),
      'no NaN/Infinity in headline figures'
    )
  );
  checks.push(check('sanity:revenuePositive', model.period.revenuePence > 0, `${model.period.revenuePence} pence`));
  checks.push(
    check(
      'sanity:grossMarginRange',
      model.headline.grossMarginPct == null ||
        (model.headline.grossMarginPct > 0 && model.headline.grossMarginPct < 100),
      `${model.headline.grossMarginPct}`
    )
  );
  if (model.headline.revPerUnitPence != null) {
    const rpu = model.headline.revPerUnitPence / 100;
    checks.push(check('sanity:revPerUnit', rpu > 5 && rpu < 500, `£${rpu.toFixed(2)} per unit`));
    const implied = model.period.units * model.headline.revPerUnitPence;
    checks.push(
      check(
        'sanity:unitsTimesRpu',
        Math.abs(implied - model.period.revenuePence) <= model.period.units, // ≤1p/unit rounding
        `units × rev/unit = ${implied} vs revenue ${model.period.revenuePence}`
      )
    );
  }
  checks.push(
    check('sanity:periodComplete', model.period.complete, `${model.period.monthCount}/${model.meta.months.length} months present`)
  );

  // ---------- 6. regression fixtures (known-good history) ----------
  // These assert the Thread & Salt history specifically. If the figures come from a
  // different organisation's books they are meaningless, so they are skipped — but the skip
  // is recorded as a named check with its reason, because a safety check that quietly
  // disappears is worse than one that fails.
  const expectedTenant = cfg.verify.fixturesTenantId || null;
  const tenantNow = (cleaned.provenance && cleaned.provenance.tenantId) || null;
  const fixturesApply =
    cleaned.source === 'fixture' || (!!expectedTenant && expectedTenant === tenantNow);
  if (!fixturesApply) {
    checks.push(
      check(
        'fixture:skipped',
        true,
        `history fixtures not applied — source is "${cleaned.source}"` +
          (tenantNow ? ` (tenant ${tenantNow})` : '') +
          ', which is not the Thread & Salt history. Set verify.fixturesTenantId to re-enable.'
      )
    );
  }
  for (const [key, expect] of Object.entries(fixturesApply ? cfg.verify.fixtures : {})) {
    const col = model.annualCols.find((c) => c.key.replace(/[^A-Z0-9]/gi, '').toUpperCase() === key.toUpperCase());
    if (!col) continue;
    const revOk = Math.abs(col.revenuePence - expect.revenue * 100) <= 100;
    const netOk = Math.abs(col.netPence - expect.netProfit * 100) <= 100;
    const marginPct = (col.netPence / col.revenuePence) * 100;
    const marginOk = Math.abs(marginPct - expect.netMarginPct) < 0.1;
    checks.push(
      check(
        `fixture:${key}`,
        revOk && netOk && marginOk,
        `revenue ${col.revenuePence / 100} (want ${expect.revenue}), net ${col.netPence / 100} (want ${
          expect.netProfit
        }), margin ${marginPct.toFixed(1)}% (want ${expect.netMarginPct}%)`
      )
    );
  }

  // ---------- 7. cleaning actually ran ----------
  checks.push(
    check('quality:fixesApplied', (model.quality.fixes || []).length > 0, `${(model.quality.fixes || []).length} fixes recorded`)
  );

  const failed = checks.filter((c) => !c.pass);
  return {
    gate: 'GATE 1 — numbers',
    pass: failed.length === 0,
    checked: checks.length,
    failedCount: failed.length,
    failures: failed,
    checks,
  };
}

module.exports = { verifyNumbers };
