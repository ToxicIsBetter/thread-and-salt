'use strict';
/**
 * A local stand-in for the Xero API, so the Xero adapter can be proven without a Xero
 * account, subscription or sandbox.
 *
 * It speaks the real response shapes:
 *   POST /connect/token              → an access token
 *   GET  /api.xro/2.0/Reports/ProfitAndLoss?timeframe=MONTH&periods=N
 *                                    → Rows/Sections/Cells with accountID attributes
 *   GET  /api.xro/2.0/Accounts       → a chart of accounts
 *
 * The figures come from the client's own finance workbook, so if the adapter parses and
 * maps correctly, the resulting report must reproduce the known-good totals
 * (FY2024 £588,800 · FY2025 £638,802 · FY2026 YTD £347,342). That makes this a real test of
 * parsing, account mapping and reconciliation — not just a smoke test.
 *
 * What it deliberately does NOT prove: that the client's actual chart of accounts maps
 * correctly. Only their real Xero can prove that.
 */
const http = require('http');
const XLSX = require('xlsx');
const path = require('path');

const ACCOUNTS = [
  { Code: '200', Name: 'Sales — online', Type: 'REVENUE', Class: 'REVENUE' },
  { Code: '201', Name: 'Sales — retail store', Type: 'REVENUE', Class: 'REVENUE' },
  { Code: '300', Name: 'Cost of goods sold', Type: 'DIRECTCOSTS', Class: 'EXPENSE' },
  { Code: '400', Name: 'Marketing & advertising', Type: 'OVERHEADS', Class: 'EXPENSE' },
  { Code: '404', Name: 'Platform & payment fees', Type: 'OVERHEADS', Class: 'EXPENSE' },
  { Code: '425', Name: 'Fulfilment & shipping', Type: 'OVERHEADS', Class: 'EXPENSE' },
  { Code: '477', Name: "Founders' compensation", Type: 'OVERHEADS', Class: 'EXPENSE' },
  { Code: '485', Name: 'Software, subscriptions & other', Type: 'OVERHEADS', Class: 'EXPENSE' },
];

/** Read the workbook's monthly revenue/units so the mock serves realistic figures. */
function loadWorkbookMonths(root) {
  const file = path.join(root, 'data', 'Scenario-2-Thread-Salt-Finance-History.xlsx');
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Monthly Revenue History'], { header: 1, blankrows: false });
  const hIdx = rows.findIndex((r) => String(r[0] || '').toLowerCase() === 'month');
  const out = [];
  let anchor = null;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const rev = Number(rows[i][1]);
    if (!Number.isFinite(rev) || rev <= 0) continue;
    const label = String(rows[i][0] || '').trim();
    if (!anchor && /^\d{4}-\d{2}$/.test(label)) anchor = label;
    out.push(rev);
  }
  // rebuild month keys by incrementing from the anchor (the sheet's labels are unreliable)
  const keys = [];
  let [y, m] = anchor.split('-').map(Number);
  for (let i = 0; i < out.length; i++) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return keys.map((period, i) => ({ period, revenue: out[i] }));
}

const RATES = { cogs: 0.42, marketing: 0.14, fulfilment: 0.09, fees: 0.035 };
const FIXED = {
  2024: { founders: 3200, software: 850 },
  2025: { founders: 3500, software: 950 },
  2026: { founders: 3700, software: 950 },
};

function monthLabel(period) {
  const d = new Date(`${period}-01T00:00:00Z`);
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Build a Xero ProfitAndLoss report for the requested months. */
function profitAndLoss(months) {
  const row = (code, name, values) => ({
    RowType: 'Row',
    Cells: [
      { Value: name, Attributes: [{ Id: 'accountID', Value: code }] },
      ...values.map((v) => ({ Value: v.toFixed(2), Attributes: [{ Id: 'accountID', Value: code }] })),
    ],
  });

  const rev = months.map((m) => m.revenue);
  const cogs = rev.map((r) => r * RATES.cogs);
  const mkt = rev.map((r) => r * RATES.marketing);
  const ful = rev.map((r) => r * RATES.fulfilment);
  const fee = rev.map((r) => r * RATES.fees);
  const fnd = months.map((m) => (FIXED[m.period.slice(0, 4)] || FIXED[2026]).founders);
  const sft = months.map((m) => (FIXED[m.period.slice(0, 4)] || FIXED[2026]).software);

  return {
    Status: 'OK',
    Reports: [
      {
        ReportID: 'ProfitAndLoss',
        ReportName: 'Profit and Loss',
        ReportType: 'ProfitAndLoss',
        ReportTitles: ['Profit and Loss', 'Thread & Salt (mock)'],
        Rows: [
          { RowType: 'Header', Cells: [{ Value: '' }, ...months.map((m) => ({ Value: monthLabel(m.period) }))] },
          {
            RowType: 'Section', Title: 'Income',
            Rows: [
              row('200', 'Sales — online', rev.map((v) => v * 0.85)),
              row('201', 'Sales — retail store', rev.map((v) => v * 0.15)),
            ],
          },
          { RowType: 'Section', Title: 'Less Cost of Sales', Rows: [row('300', 'Cost of goods sold', cogs)] },
          {
            RowType: 'Section', Title: 'Less Operating Expenses',
            Rows: [
              row('400', 'Marketing & advertising', mkt),
              row('425', 'Fulfilment & shipping', ful),
              row('404', 'Platform & payment fees', fee),
              row('477', "Founders' compensation", fnd),
              row('485', 'Software, subscriptions & other', sft),
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Start the mock. Resolves with { url, close() }.
 * @param {string} root project root (to locate the workbook)
 */
function start(root) {
  const all = loadWorkbookMonths(root);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'POST' && url.pathname.endsWith('/connect/token')) {
      if (!req.headers.authorization || !req.headers.authorization.startsWith('Basic ')) {
        return send(401, { error: 'invalid_client' });
      }
      return send(200, { access_token: 'mock-token', token_type: 'Bearer', expires_in: 1800 });
    }

    if (req.headers.authorization !== 'Bearer mock-token') return send(401, { Detail: 'Unauthorized' });
    if (!req.headers['xero-tenant-id']) return send(400, { Detail: 'Xero-tenant-id header missing' });

    if (url.pathname.endsWith('/Reports/ProfitAndLoss')) {
      const from = url.searchParams.get('fromDate');
      const to = url.searchParams.get('toDate');
      const months = all.filter((m) => (!from || m.period >= from.slice(0, 7)) && (!to || m.period <= to.slice(0, 7)));
      if (months.length === 0) return send(200, profitAndLoss([]));
      return send(200, profitAndLoss(months));
    }

    if (url.pathname.endsWith('/Accounts')) return send(200, { Accounts: ACCOUNTS });

    return send(404, { Detail: `mock-xero has no route for ${url.pathname}` });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        apiBase: `http://127.0.0.1:${port}/api.xro/2.0`,
        tokenUrl: `http://127.0.0.1:${port}/connect/token`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { start, profitAndLoss, loadWorkbookMonths, ACCOUNTS };
