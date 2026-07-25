'use strict';
/**
 * Config load/save + validation, and the recipient-management API.
 * Recipients (and the sending mailbox) are data, never code — they can be changed
 * at any time with `tas recipients …` / `tas sender …` without touching the pipeline.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
require('./env').loadEnv(ROOT); // pick up the git-ignored .env before anything reads process.env
const CONFIG_PATH = path.join(__dirname, 'config.json');

function load() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  cfg._root = ROOT;
  return cfg;
}

function save(cfg) {
  const out = { ...cfg };
  delete out._root;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(out, null, 2) + '\n');
  return out;
}

// ---------- email validation ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function assertEmail(addr) {
  if (!EMAIL_RE.test(String(addr || '').trim())) {
    throw new Error(`Not a valid email address: "${addr}"`);
  }
  return String(addr).trim();
}

// ---------- recipient management (change any time) ----------
function listRecipients(cfg) {
  return cfg.deliver.email.recipients.slice();
}

/** Replace the whole recipient list. Accepts "Name <a@b.com>" or "a@b.com". */
function setRecipients(cfg, entries) {
  if (!entries || entries.length === 0) throw new Error('At least one recipient is required.');
  cfg.deliver.email.recipients = entries.map(parseRecipient);
  return cfg;
}

function addRecipient(cfg, entry) {
  const r = parseRecipient(entry);
  const existing = cfg.deliver.email.recipients.find(
    (x) => x.address.toLowerCase() === r.address.toLowerCase()
  );
  if (existing) throw new Error(`${r.address} is already a recipient.`);
  cfg.deliver.email.recipients.push(r);
  return cfg;
}

function removeRecipient(cfg, address) {
  const addr = String(address).toLowerCase();
  const before = cfg.deliver.email.recipients.length;
  cfg.deliver.email.recipients = cfg.deliver.email.recipients.filter(
    (x) => x.address.toLowerCase() !== addr
  );
  if (cfg.deliver.email.recipients.length === before) {
    throw new Error(`${address} is not currently a recipient.`);
  }
  if (cfg.deliver.email.recipients.length === 0) {
    throw new Error('Refusing to remove the last recipient — reports would go nowhere.');
  }
  return cfg;
}

function parseRecipient(entry) {
  if (entry && typeof entry === 'object') {
    return { name: entry.name || '', address: assertEmail(entry.address) };
  }
  const s = String(entry).trim();
  const m = s.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), address: assertEmail(m[2]) };
  return { name: '', address: assertEmail(s) };
}

/** The mailbox reports are sent *from* (an Entra ID / Microsoft 365 mailbox). */
function setSender(cfg, upn) {
  cfg.deliver.email.senderUpn = assertEmail(upn);
  return cfg;
}

/** Where the archive copy is filed. Defaults to the sender's own drive. */
function setDriveOwner(cfg, upn) {
  cfg.deliver.drive.driveOwnerUpn = assertEmail(upn);
  return cfg;
}

// ---------- readiness ----------
/**
 * What is wired up and what is still pending. Drives the auto delivery mode:
 * live only when credentials + real addresses are present, otherwise dry-run.
 */
function readiness(cfg) {
  const placeholder = (a) => /example\.com|example$|\.example$/i.test(String(a));
  const graphCreds =
    !!cfg.entra.tenantId && !!cfg.entra.clientId && !!process.env[cfg.entra.clientSecretEnv];
  const smtpCreds = !!process.env.TAS_SMTP_USER && !!process.env.TAS_SMTP_PASS &&
    (!!process.env.TAS_SMTP_HOST || !!(cfg.deliver.email.smtp && (cfg.deliver.email.smtp.host || cfg.deliver.email.smtp.preset)));
  const provider = cfg.deliver.email.provider || 'microsoft-graph';
  const mailCreds = provider === 'smtp' ? smtpCreds : graphCreds;
  const recips = cfg.deliver.email.recipients;
  const realRecipients = recips.length > 0 && recips.every((r) => !placeholder(r.address));
  const senderish = cfg.deliver.email.senderUpn || process.env.TAS_SMTP_FROM || process.env.TAS_SMTP_USER;
  const realSender = !!senderish && !placeholder(senderish);

  const xero = cfg.dataSource;
  const xeroReady =
    !!xero.xero.tenantId &&
    !!process.env[xero.xero.clientIdEnv] &&
    !!process.env[xero.xero.clientSecretEnv];

  return {
    graphCreds,
    smtpCreds,
    mailProvider: provider,
    mailCreds,
    realRecipients,
    realSender,
    emailReady: mailCreds && realRecipients && realSender,
    xeroReady,
    dataProvider: cfg.dataSource.provider,
    effectiveDeliveryMode:
      cfg.deliver.mode === 'live' || cfg.deliver.mode === 'dryrun'
        ? cfg.deliver.mode
        : mailCreds && realRecipients && realSender
        ? 'live'
        : 'dryrun',
  };
}

module.exports = {
  ROOT,
  CONFIG_PATH,
  load,
  save,
  assertEmail,
  parseRecipient,
  listRecipients,
  setRecipients,
  addRecipient,
  removeRecipient,
  setSender,
  setDriveOwner,
  readiness,
};
