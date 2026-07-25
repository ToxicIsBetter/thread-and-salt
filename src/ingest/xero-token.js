'use strict';
/** Xero OAuth2 client-credentials token (Custom Connection). Shared by the pull and the account lister. */
const DEFAULT_TOKEN_URL = 'https://identity.xero.com/connect/token';
const SCOPES = 'accounting.reports.read accounting.transactions.read accounting.settings.read';

async function getToken({ clientId, clientSecret, tokenUrl }) {
  const TOKEN_URL = tokenUrl || process.env.TAS_XERO_TOKEN_URL || DEFAULT_TOKEN_URL;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPES }),
  });
  if (!res.ok) throw new Error(`Xero token request failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}
module.exports = { getToken, SCOPES };
