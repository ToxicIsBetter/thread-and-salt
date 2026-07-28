'use strict';
/**
 * Discovers the tenant (organisation) a Custom Connection is authorised against, so the
 * tenant ID never has to be copied by hand — a step that is easy to get wrong and produces
 * a confusing 401/403 much later, far from the cause.
 *
 * Usage:  node bin/tas.js xero-connect
 */
const { getToken } = require('./xero-token');

const CONNECTIONS_URL = 'https://api.xero.com/connections';

async function listConnections(cfg) {
  const x = cfg.dataSource.xero;
  const clientId = process.env[x.clientIdEnv];
  const clientSecret = process.env[x.clientSecretEnv];
  const missing = [];
  if (!clientId) missing.push(`$${x.clientIdEnv}`);
  if (!clientSecret) missing.push(`$${x.clientSecretEnv}`);
  if (missing.length) {
    const e = new Error(`Xero credentials missing: ${missing.join(', ')} — put them in .env`);
    e.code = 'XERO_NOT_CONNECTED';
    throw e;
  }

  const token = await getToken({ clientId, clientSecret, tokenUrl: x.tokenUrl });
  const url = x.connectionsUrl || process.env.TAS_XERO_CONNECTIONS_URL || CONNECTIONS_URL;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Xero /connections failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return (Array.isArray(body) ? body : []).map((c) => ({
    tenantId: c.tenantId,
    tenantName: c.tenantName,
    tenantType: c.tenantType,
  }));
}

module.exports = { listConnections };
