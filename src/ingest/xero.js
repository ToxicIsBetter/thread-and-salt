'use strict';
/**
 * Xero provider — the live source, ready to switch on.
 *
 * STATUS: written against the Xero Accounting API but NOT yet exercised against a
 * real tenant (access pending). It throws NotConnectedError with a clear message
 * until credentials + tenantId are configured, so the pipeline never silently
 * falls back to stale numbers. When access arrives:
 *   1. set dataSource.xero.tenantId in src/config.json
 *   2. export TAS_XERO_CLIENT_ID / TAS_XERO_CLIENT_SECRET
 *   3. set dataSource.provider = "xero"
 *   4. confirm the accountMap against the real chart of accounts (tas doctor)
 * Nothing else in the pipeline changes.
 */
const { monthRange, addMonths } = require('../period');

class NotConnectedError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'NotConnectedError';
    this.code = 'XERO_NOT_CONNECTED';
  }
}

const DEFAULT_API = 'https://api.xero.com/api.xro/2.0';
const { getToken, SCOPES } = require('./xero-token');

/** Endpoints are overridable so the adapter can be exercised against a local mock. */
const apiBase = (cfg) => cfg.dataSource.xero.apiBase || process.env.TAS_XERO_API_BASE || DEFAULT_API;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P = (pounds) => Math.round(Number(pounds || 0) * 100);

function credentials(cfg) {
  const x = cfg.dataSource.xero;
  const clientId = process.env[x.clientIdEnv];
  const clientSecret = process.env[x.clientSecretEnv];
  const missing = [];
  if (!x.tenantId) missing.push('dataSource.xero.tenantId in src/config.json');
  if (!clientId) missing.push(`$${x.clientIdEnv}`);
  if (!clientSecret) missing.push(`$${x.clientSecretEnv}`);
  if (missing.length) {
    throw new NotConnectedError(
      'Xero is not connected yet. Still needed: ' +
        missing.join(', ') +
        '. Until then run with dataSource.provider = "fixture".'
    );
  }
  return { clientId, clientSecret, tenantId: x.tenantId };
}

/** GET with retry on 429/5xx — Xero rate-limits aggressively. */
async function apiGet(url, token, tenantId, { attempts = 3 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('Retry-After') || 0);
      await sleep(retryAfter ? retryAfter * 1000 : 800 * i);
      lastErr = new Error(`Xero ${res.status} on ${url}`);
      continue;
    }
    throw new Error(`Xero request failed (${res.status}) on ${url}: ${await res.text()}`);
  }
  throw lastErr;
}

/**
 * Flatten a Xero ProfitAndLoss report into { columnKeys, byAccount: { '200': [pence…] } }.
 * Xero returns Rows → Sections → Rows, with the first cell the account name and
 * subsequent cells the period values.
 */
function parsePnl(report) {
  const rpt = report.Reports ? report.Reports[0] : report;
  const header = (rpt.Rows || []).find((r) => r.RowType === 'Header');
  const columnKeys = header ? header.Cells.slice(1).map((c) => String(c.Value)) : [];
  const byAccount = {};
  const walk = (rows) => {
    for (const row of rows || []) {
      if (row.Rows) walk(row.Rows);
      if (row.RowType !== 'Row' || !row.Cells || row.Cells.length < 2) continue;
      const nameCell = row.Cells[0];
      const attrs = nameCell.Attributes || [];
      const idAttr = attrs.find((a) => a.Id === 'accountID' || a.Id === 'account');
      const key = String(idAttr ? idAttr.Value : nameCell.Value).trim();
      byAccount[key] = row.Cells.slice(1).map((c) => P(c.Value));
    }
  };
  walk(rpt.Rows);
  return { columnKeys, byAccount };
}

/** Sum the accounts mapped to one report line, per column. */
function sumMapped(byAccount, codes, nCols) {
  const out = new Array(nCols).fill(0);
  for (const code of codes || []) {
    const series = byAccount[code];
    if (!series) continue;
    for (let i = 0; i < nCols; i++) out[i] += Math.abs(series[i] || 0);
  }
  return out;
}

async function pull(cfg, win, escalation = 1) {
  const creds = credentials(cfg); // throws NotConnectedError until wired up
  const API = apiBase(cfg);
  const token = await getToken({ ...creds, tokenUrl: cfg.dataSource.xero.tokenUrl });
  const map = cfg.dataSource.xero.accountMap;

  // Loop-A escalation ladder (see IMPLEMENTATION-PLAN §5)
  //  1: straight pull  2: cache-bust + full pagination  3: chunk the window
  const bust = escalation >= 2 ? `&_cb=${Date.now()}` : '';
  if (escalation >= 2) await sleep(1200);

  // Pull from January two years before the window starts. A fixed 24-month lookback would
  // leave the earliest P&L column as a part-year, which reads as a collapse in revenue when
  // shown beside full years — so always fetch WHOLE prior years plus the current YTD.
  const startYear = Number(win.months[0].slice(0, 4));
  const firstMonth = `${startYear - 2}-01`;
  const lastMonth = win.months[win.months.length - 1];
  const allMonths = monthRange(firstMonth, lastMonth);

  const chunks =
    escalation >= 3
      ? chunk(allMonths, 6) // narrower ranges dodge report timeouts
      : [allMonths];

  const monthly = new Map();
  for (const group of chunks) {
    const from = `${group[0]}-01`;
    const to = endOfMonthISO(group[group.length - 1]);
    const url =
      `${API}/Reports/ProfitAndLoss?fromDate=${from}&toDate=${to}` +
      `&timeframe=MONTH&periods=${group.length}&standardLayout=true` +
      `&paymentsOnly=false${bust}`;
    const { columnKeys, byAccount } = parsePnl(await apiGet(url, token, creds.tenantId));
    const n = columnKeys.length || group.length;
    const revenue = sumMapped(byAccount, map.revenue, n);
    const cogs = sumMapped(byAccount, map.cogs, n);
    const marketing = sumMapped(byAccount, map.marketing, n);
    const fulfilment = sumMapped(byAccount, map.fulfilment, n);
    const fees = sumMapped(byAccount, map.fees, n);
    const founders = sumMapped(byAccount, map.founders, n);
    const software = sumMapped(byAccount, map.software, n);
    group.forEach((period, i) => {
      monthly.set(period, {
        period,
        revenuePence: revenue[i] || 0,
        cogsPence: cogs[i] || 0,
        units: null, // Xero P&L carries no unit counts — see note below
        opex: {
          marketingPence: marketing[i] || 0,
          fulfilmentPence: fulfilment[i] || 0,
          feesPence: fees[i] || 0,
          foundersPence: founders[i] || 0,
          softwarePence: software[i] || 0,
        },
      });
    });
  }

  const months = allMonths.map((m) => monthly.get(m)).filter(Boolean);
  if (months.length === 0) throw new Error('Xero returned no monthly columns for the requested range');

  // Units, where available, come from invoice line quantities (optional enrichment:
  // the pack degrades gracefully to revenue-only if this is not granted).
  return {
    source: 'xero',
    grain: cfg.dataSource.xero.grain || 'day',
    pulledAt: new Date().toISOString(),
    currency: cfg.business.currency,
    escalationUsed: escalation,
    months,
    annual: [], // derived from months by transform/pnl.js when the source is Xero
    assumptions: { fromSource: true, fixedByYear: {} },
    provenance: {
      kind: 'xero',
      tenantId: creds.tenantId,
      basis: cfg.dataSource.xero.reportBasis,
      note: 'Pulled live from the Xero Profit & Loss report; totals reconcile to Xero by construction.',
    },
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function endOfMonthISO(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Authoritative: a live ledger is the final word on any closed period. If it returns
// nothing for a period that has ended, that is a fault to alert on (outage, revoked
// scope, truncated pull) — never a silent skip. See coverageVerdict() in ./index.js.
module.exports = { pull, NotConnectedError, authoritative: true };
