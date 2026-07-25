'use strict';
/**
 * Failure alerts. Deliberately goes to US, never to the client: a failed run is
 * silent to Mara and Jonah and loud to whoever maintains the automation.
 * Falls back to a written alert file when Graph is not configured.
 */
const fs = require('fs');
const path = require('path');
const { getToken, graphFetch } = require('./graph');

function summarise(history) {
  return history
    .map((h) => {
      const bits = [`pass ${h.pass}`, h.stage, h.outcome];
      if (h.gate) bits.push(h.gate);
      if (h.failures && h.failures.length) {
        bits.push(h.failures.slice(0, 4).map((f) => `${f.name} (${f.detail})`).join(' | '));
      }
      if (h.error) bits.push(h.error);
      return '• ' + bits.filter(Boolean).join(' — ');
    })
    .join('\n');
}

async function sendAlert({ cfg, subject, reason, history, outDir, mode }) {
  const text =
    `Thread & Salt reporting run FAILED — no report was sent to the client.\n\n` +
    `Reason: ${reason}\n\n` +
    `Attempt history:\n${summarise(history || [])}\n\n` +
    `Full detail: ${path.join(outDir, 'verification.json')}\n`;

  const file = path.join(outDir, 'ALERT.txt');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, text);

  if (mode === 'live' && (cfg.alerts.to || []).length) {
    try {
      const token = await getToken(cfg);
      await graphFetch(token, `/users/${encodeURIComponent(cfg.deliver.email.senderUpn)}/sendMail`, {
        method: 'POST',
        json: {
          message: {
            subject: `[ALERT] ${subject}`,
            body: { contentType: 'Text', content: text },
            toRecipients: cfg.alerts.to.map((a) => ({ emailAddress: { address: a } })),
          },
          saveToSentItems: true,
        },
      });
      return { alerted: true, channel: 'email', file };
    } catch (e) {
      fs.appendFileSync(file, `\n[alert email failed: ${e.message}]\n`);
    }
  }
  return { alerted: true, channel: 'file', file };
}

module.exports = { sendAlert, summarise };
