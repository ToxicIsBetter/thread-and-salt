'use strict';
/**
 * SMTP transport — the alternative to Microsoft Graph.
 *
 * Why both exist: Graph app-only auth is the right production path (unattended, no user
 * password, scoped by policy) but it needs an Entra app registration with admin consent.
 * SMTP with an app password needs neither, so it gets a real send working immediately —
 * including from Google Workspace, which Graph cannot serve at all.
 *
 * Selected with deliver.email.provider = "smtp".
 * Credentials come from the environment (or the git-ignored .env):
 *   TAS_SMTP_HOST, TAS_SMTP_PORT, TAS_SMTP_USER, TAS_SMTP_PASS  (+ optional TAS_SMTP_FROM)
 */
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

/** Well-known hosts, so only an address + app password is really needed. */
const PRESETS = {
  'microsoft-365': { host: 'smtp.office365.com', port: 587, secure: false },
  outlook: { host: 'smtp.office365.com', port: 587, secure: false },
  gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
  'google-workspace': { host: 'smtp.gmail.com', port: 587, secure: false },
};

function settings(cfg) {
  const s = (cfg.deliver.email.smtp || {});
  const preset = s.preset ? PRESETS[s.preset] : null;
  const host = process.env.TAS_SMTP_HOST || s.host || (preset && preset.host);
  const port = Number(process.env.TAS_SMTP_PORT || s.port || (preset && preset.port) || 587);
  const user = process.env.TAS_SMTP_USER || s.user;
  // Google displays app passwords as "abcd efgh ijkl mnop"; the spaces are for readability
  // only and must not be sent, so strip all whitespace before authenticating.
  const pass = (process.env.TAS_SMTP_PASS || '').replace(/\s+/g, '') || undefined;
  const from = process.env.TAS_SMTP_FROM || s.from || cfg.deliver.email.senderUpn || user;

  const missing = [];
  if (!host) missing.push('TAS_SMTP_HOST (or deliver.email.smtp.preset)');
  if (!user) missing.push('TAS_SMTP_USER');
  if (!pass) missing.push('TAS_SMTP_PASS');
  if (missing.length) {
    const e = new Error(`SMTP is not configured. Still needed: ${missing.join(', ')}`);
    e.code = 'SMTP_NOT_CONFIGURED';
    throw e;
  }
  return { host, port, secure: port === 465, auth: { user, pass }, from };
}

function isConfigured(cfg) {
  try {
    settings(cfg);
    return true;
  } catch {
    return false;
  }
}

function transport(cfg) {
  const s = settings(cfg);
  return { tx: nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, auth: s.auth }), from: s.from };
}

/** Prove the credentials work before running a whole pipeline against them. */
async function verify(cfg) {
  const { tx, from } = transport(cfg);
  await tx.verify();
  return { ok: true, from };
}

async function sendMail({ cfg, to, cc, subject, html, attachmentPath }) {
  const { tx, from } = transport(cfg);
  const info = await tx.sendMail({
    from,
    to: to.map((r) => (r.name ? `"${r.name}" <${r.address}>` : r.address)).join(', '),
    cc: (cc || []).join(', ') || undefined,
    subject,
    html,
    attachments: attachmentPath
      ? [{ filename: path.basename(attachmentPath), content: fs.readFileSync(attachmentPath) }]
      : [],
  });
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, from };
}

module.exports = { sendMail, verify, isConfigured, settings, PRESETS };
