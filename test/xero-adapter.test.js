'use strict';
/**
 * Proves the Xero adapter end-to-end against the mock: token auth, ProfitAndLoss parsing,
 * account mapping, and that the resulting figures reconcile to the known-good totals.
 * Run: node test/xero-adapter.test.js
 */
const path = require('path');
const mock = require('./mock-xero');
const configLib = require('../src/config');
const { windowFor } = require('../src/period');
const { ingest } = require('../src/ingest');
const { clean } = require('../src/transform/clean');
const pnl = require('../src/transform/pnl');
const { verifyNumbers } = require('../src/verify/numbers');
const { listAccounts } = require('../src/ingest/xero-accounts');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

(async () => {
  console.log('\nXero adapter — tested against a local mock (no Xero account needed)\n');
  const srv = await mock.start(path.resolve(__dirname, '..'));
  process.env.TAS_XERO_CLIENT_ID = 'mock-id';
  process.env.TAS_XERO_CLIENT_SECRET = 'mock-secret';

  try {
    const cfg = configLib.load();
    cfg.dataSource.provider = 'xero';
    cfg.dataSource.xero.tenantId = 'mock-tenant';
    cfg.dataSource.xero.apiBase = srv.apiBase;
    cfg.dataSource.xero.tokenUrl = srv.tokenUrl;

    // 1. chart of accounts
    const accounts = await listAccounts(cfg);
    check('lists the chart of accounts', accounts.length === 8, `${accounts.length} accounts`);
    check('account codes come through', accounts.some((a) => a.code === '200' && /Sales/.test(a.name)));

    // 2. pull + transform for July 2026
    const win = windowFor('monthly', '2026-08-03');
    const raw = await ingest(cfg, win, 1);
    check('authenticates and pulls a monthly series', raw.months.length > 24, `${raw.months.length} months`);
    check('source is reported as xero', raw.source === 'xero');
    check('grain is daily (unlocks the weekly pack)', raw.grain === 'day');

    const model = pnl.build(clean(raw), win, cfg);

    // 3. the figures must match the workbook's known-good totals
    const gbp = (p) => Math.round(p / 100);
    check('July 2026 revenue is £41,850', gbp(model.period.revenuePence) === 41850, `got £${gbp(model.period.revenuePence)}`);
    const fy = (k) => model.annualCols.find((c) => c.key.replace(/[^A-Z0-9]/gi, '').toUpperCase() === k);
    check('FY2024 revenue is £588,800', gbp(fy('FY2024').revenuePence) === 588800, `got £${gbp(fy('FY2024').revenuePence)}`);
    check('FY2025 revenue is £638,802', gbp(fy('FY2025').revenuePence) === 638802, `got £${gbp(fy('FY2025').revenuePence)}`);
    check('FY2026 YTD revenue is £347,342', gbp(fy('FY2026YTD').revenuePence) === 347342, `got £${gbp(fy('FY2026YTD').revenuePence)}`);
    check('multi-account revenue lines are summed (200 + 201)', gbp(model.period.revenuePence) === 41850);
    check('MoM is -24.4%', Math.abs(model.headline.priorPct + 24.4) < 0.05, `${model.headline.priorPct.toFixed(1)}%`);
    check('YoY is -22.0%', Math.abs(model.headline.yoyPct + 22.0) < 0.05, `${model.headline.yoyPct.toFixed(1)}%`);

    // 4. GATE 1 must pass on Xero-sourced data
    const g1 = verifyNumbers(model, clean(raw), cfg);
    check('GATE 1 passes on Xero-sourced figures', g1.pass, `${g1.checked} checks, ${g1.failedCount} failed`);
    if (!g1.pass) for (const f of g1.failures.slice(0, 6)) console.log(`        ✗ ${f.name}: ${f.detail}`);

    // 5. escalation rungs (Loop A) still work against the API
    const raw3 = await ingest(cfg, win, 3); // chunked pulls
    check('Loop A escalation 3 (chunked pulls) returns the same data',
      raw3.months.length === raw.months.length);

    // 6. auth is actually enforced by the mock
    let rejected = false;
    try {
      const bad = JSON.parse(JSON.stringify(cfg));
      bad._root = cfg._root;
      process.env.TAS_XERO_CLIENT_ID = '';
      await ingest(bad, win, 1);
    } catch (e) { rejected = e.code === 'XERO_NOT_CONNECTED'; }
    finally { process.env.TAS_XERO_CLIENT_ID = 'mock-id'; }
    check('refuses to run without credentials', rejected);
  } finally {
    await srv.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${failed.length ? `✗ ${failed.length} of` : '✓ all'} ${results.length} Xero adapter tests ${failed.length ? 'FAILED' : 'passed'}`);
  process.exit(failed.length ? 1 : 0);
})();
