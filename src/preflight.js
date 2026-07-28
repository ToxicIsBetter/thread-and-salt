'use strict';
/**
 * Connectivity preflight — run this wherever the pipeline will actually execute
 * (especially inside a routine's cloud sandbox, which allowlists egress by domain).
 *
 * It exists because a Gmail sender needs raw SMTP on port 587, and a sandbox that only
 * permits HTTPS would break delivery while everything else still appeared to work.
 */
const net = require('net');
const tls = require('tls');

function tcpProbe(host, port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    const done = (ok, detail) => {
      socket.destroy();
      resolve({ host, port, ok, ms: Date.now() - started, detail });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true, 'connected'));
    socket.once('timeout', () => done(false, `timed out after ${timeoutMs}ms`));
    socket.once('error', (e) => done(false, e.code || e.message));
  });
}

async function httpsProbe(host, timeoutMs = 8000) {
  const started = Date.now();
  try {
    const res = await fetch(`https://${host}/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { host, port: 443, ok: true, ms: Date.now() - started, detail: `HTTP ${res.status}` };
  } catch (e) {
    const msg = String(e.message || e);
    // A TLS/HTTP error still proves the host was reachable; only network denial matters.
    const reachable = /certificate|protocol|socket hang up|HTTP/i.test(msg);
    return { host, port: 443, ok: reachable, ms: Date.now() - started, detail: msg.slice(0, 90) };
  }
}

async function preflight(cfg) {
  const checks = [];
  const provider = cfg.deliver.email.provider || 'microsoft-graph';

  if (provider === 'smtp') {
    const s = cfg.deliver.email.smtp || {};
    const host = process.env.TAS_SMTP_HOST || s.host || 'smtp.gmail.com';
    const port = Number(process.env.TAS_SMTP_PORT || s.port || 587);
    checks.push({ label: `SMTP  ${host}:${port}`, ...(await tcpProbe(host, port)) });
    // 465 is the implicit-TLS alternative, worth knowing about if 587 is blocked
    checks.push({ label: `SMTP  ${host}:465 (alt)`, ...(await tcpProbe(host, 465)) });
  } else {
    for (const h of ['login.microsoftonline.com', 'graph.microsoft.com']) {
      checks.push({ label: `HTTPS ${h}`, ...(await httpsProbe(h)) });
    }
  }

  if (cfg.dataSource.provider === 'xero') {
    for (const h of ['identity.xero.com', 'api.xero.com']) {
      checks.push({ label: `HTTPS ${h}`, ...(await httpsProbe(h)) });
    }
  }

  return checks;
}

module.exports = { preflight, tcpProbe, httpsProbe };
