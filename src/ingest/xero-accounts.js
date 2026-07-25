'use strict';
/**
 * Lists the Xero chart of accounts, so `dataSource.xero.accountMap` can be filled in from
 * reality instead of guessed. Getting that map wrong is the single biggest risk to the first
 * report being correct — GATE 1 catches it, but this turns a guess into a lookup.
 *
 * Usage:  node bin/tas.js xero-accounts
 */
const { getToken } = require('./xero-token');

const DEFAULT_API = 'https://api.xero.com/api.xro/2.0';

async function listAccounts(cfg) {
  const x = cfg.dataSource.xero;
  const clientId = process.env[x.clientIdEnv];
  const clientSecret = process.env[x.clientSecretEnv];
  const missing = [];
  if (!x.tenantId) missing.push('dataSource.xero.tenantId in src/config.json');
  if (!clientId) missing.push(`$${x.clientIdEnv}`);
  if (!clientSecret) missing.push(`$${x.clientSecretEnv}`);
  if (missing.length) {
    const e = new Error(`Xero is not connected yet. Still needed: ${missing.join(', ')}`);
    e.code = 'XERO_NOT_CONNECTED';
    throw e;
  }

  const API = x.apiBase || process.env.TAS_XERO_API_BASE || DEFAULT_API;
  const token = await getToken({ clientId, clientSecret, tokenUrl: x.tokenUrl });
  const res = await fetch(`${API}/Accounts`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Xero-tenant-id': x.tenantId,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Xero /Accounts failed (${res.status}): ${await res.text()}`);
  const body = await res.json();

  return (body.Accounts || []).map((a) => ({
    code: a.Code,
    name: a.Name,
    type: a.Type,
    class: a.Class,
    reportingCode: a.ReportingCode,
  }));
}

module.exports = { listAccounts };
