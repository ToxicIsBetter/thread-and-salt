'use strict';
/**
 * Maintainer notifications. Deliberately go to US, never to the client: a failed run is
 * silent to Mara and Jonah and loud to whoever maintains the automation.
 * Falls back to a written file when Graph is not configured.
 *
 * Two kinds, and the distinction is the point:
 *   'failure' → ALERT.txt  — something is wrong, go and look
 *   'notice'  → NOTICE.txt — a cadence could not run yet and that is expected
 * Both are still recorded and still sent, so nothing goes dark; but only one of them
 * says "investigate". Labelling an expected skip as a failure is how a maintainer
 * learns to ignore the alerts that matter.
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

async function sendAlert({ cfg, subject, reason, history, outDir, mode, kind = 'failure' }) {
  const notice = kind === 'notice';
  const headline = notice
    ? `Thread & Salt reporting run SKIPPED — nothing was sent, and nothing is wrong.`
    : `Thread & Salt reporting run FAILED — no report was sent to the client.`;
  const text =
    `${headline}\n\n` +
    `Reason: ${reason}\n\n` +
    `Attempt history:\n${summarise(history || [])}\n\n` +
    `Full detail: ${path.join(outDir, 'verification.json')}\n`;

  const file = path.join(outDir, notice ? 'NOTICE.txt' : 'ALERT.txt');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, text);

  if (mode === 'live' && (cfg.alerts.to || []).length) {
    try {
      const token = await getToken(cfg);
      await graphFetch(token, `/users/${encodeURIComponent(cfg.deliver.email.senderUpn)}/sendMail`, {
        method: 'POST',
        json: {
          message: {
            subject: `${notice ? '[NOTICE]' : '[ALERT]'} ${subject}`,
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
