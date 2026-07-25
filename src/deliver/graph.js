'use strict';
/**
 * Microsoft Graph client (Entra ID app-only auth).
 *
 * Auth: OAuth2 client credentials against the client's Entra tenant, so reports
 * send unattended from a real Microsoft 365 mailbox with nobody logged in.
 *
 * Entra app registration needs these APPLICATION permissions (admin consent):
 *   Mail.Send          — send the report email
 *   Files.ReadWrite.All — file the archive copy in OneDrive/SharePoint
 * Recommended: scope Mail.Send to just the sending mailbox with an
 * ApplicationAccessPolicy so the app cannot send as anyone else.
 *
 * STATUS: written to the documented Graph contract but not yet run against a live
 * tenant (credentials pending). Until they exist, delivery runs in dry-run mode.
 */
const GRAPH = 'https://graph.microsoft.com/v1.0';

class GraphNotConfiguredError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'GraphNotConfiguredError';
    this.code = 'GRAPH_NOT_CONFIGURED';
  }
}

function credentials(cfg) {
  const { tenantId, clientId, clientSecretEnv } = cfg.entra;
  const clientSecret = process.env[clientSecretEnv];
  const missing = [];
  if (!tenantId) missing.push('entra.tenantId in src/config.json');
  if (!clientId) missing.push('entra.clientId in src/config.json');
  if (!clientSecret) missing.push(`$${clientSecretEnv}`);
  if (missing.length) {
    throw new GraphNotConfiguredError(`Microsoft Graph is not configured yet. Still needed: ${missing.join(', ')}`);
  }
  return { tenantId, clientId, clientSecret };
}

async function getToken(cfg) {
  const { tenantId, clientId, clientSecret } = credentials(cfg);
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: cfg.entra.scope || 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) throw new Error(`Entra token request failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function graphFetch(token, urlPath, { method = 'GET', json, body, headers = {} } = {}) {
  const res = await fetch(urlPath.startsWith('http') ? urlPath : `${GRAPH}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : body,
  });
  if (res.status === 202 || res.status === 204) return { ok: true };
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph ${method} ${urlPath} failed (${res.status}): ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}

module.exports = { GRAPH, getToken, graphFetch, credentials, GraphNotConfiguredError };
