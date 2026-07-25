'use strict';
/**
 * Emails the pack as an attachment to the configured recipients, from the
 * client's Entra ID mailbox via Microsoft Graph.
 *
 * Recipients live in config (src/config.json → deliver.email.recipients) and can be
 * changed any time with `tas recipients …` — no code change, no redeploy.
 *
 * When Graph credentials or real addresses are absent, this writes the exact
 * message it *would* send into output/outbox/ so the pipeline is fully testable.
 */
const fs = require('fs');
const path = require('path');
const { getToken, graphFetch } = require('./graph');
const { gbp, signedPct1, pct1 } = require('../format');

function subjectFor(cfg, model) {
  const cadence = model.meta.cadence.charAt(0).toUpperCase() + model.meta.cadence.slice(1);
  return (cfg.deliver.email.subjectTemplate || 'Management accounts — {period}')
    .replace('{cadence}', cadence)
    .replace('{period}', model.meta.periodLabel)
    .replace('{business}', model.meta.business);
}

function bodyHtml(model, signals) {
  const h = model.headline;
  const line = (label, value) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#5A5A5A">${label}</td><td style="padding:4px 0;font-weight:600;color:#1F3A4D">${value}</td></tr>`;
  const signalHtml = signals.length
    ? `<div style="margin:18px 0;padding:14px 16px;border-left:4px solid ${
        signals[0].severity === 'high' ? '#B4553F' : '#2E6E7E'
      };background:#F7F4EE">
         <div style="font-weight:700;color:#1F3A4D;margin-bottom:6px">${escapeHtml(signals[0].title)}</div>
         <div style="color:#222;margin-bottom:8px">${escapeHtml(signals[0].body)}</div>
         <div style="color:#3B6E4B"><strong>Recommended action:</strong> ${escapeHtml(signals[0].action)}</div>
       </div>`
    : `<p style="color:#3B6E4B">Nothing unusual this period — revenue, margin and growth are all within their normal range.</p>`;

  return `<div style="font-family:Segoe UI,Calibri,sans-serif;font-size:15px;color:#222;max-width:640px">
    <p>Morning both,</p>
    <p>Your <strong>${escapeHtml(model.meta.cadence)}</strong> management accounts for
       <strong>${escapeHtml(model.meta.periodLabel)}</strong> are attached, and filed in the shared drive.</p>
    <table style="border-collapse:collapse;margin:14px 0">
      ${line('Revenue', gbp(model.period.revenuePence))}
      ${line(`vs ${escapeHtml(h.priorLabel)}`, h.priorPct == null ? '—' : signedPct1(h.priorPct))}
      ${line(`vs ${escapeHtml(h.yoyLabel)}`, h.yoyPct == null ? '—' : signedPct1(h.yoyPct))}
      ${line('Net profit', gbp(model.period.netPence))}
      ${line('Net margin', pct1(h.netMarginPct))}
    </table>
    ${signalHtml}
    <p style="color:#5A5A5A;font-size:13px">Generated automatically from ${
      model.meta.source === 'xero' ? 'Xero' : 'your finance data'
    }. Every figure is checked against source before this email is sent — nothing is sent if a check fails.</p>
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * @param {object} args { cfg, model, signals, file, mode: 'live'|'dryrun', outDir }
 * @returns {Promise<object>} delivery receipt
 */
async function sendReport({ cfg, model, signals, file, mode, outDir }) {
  const email = cfg.deliver.email;
  const subject = subjectFor(cfg, model);
  const html = bodyHtml(model, signals);
  const attachmentName = path.basename(file);
  const recipients = email.recipients.map((r) => ({
    emailAddress: { address: r.address, name: r.name || undefined },
  }));

  if (mode !== 'live') {
    const dir = path.join(outDir, 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    const stem = attachmentName.replace(/\.(docx|pdf)$/i, '');
    const preview = path.join(dir, `${stem}.email.html`);
    const meta = {
      wouldSendFrom: email.senderUpn,
      to: email.recipients,
      cc: email.cc,
      subject,
      attachment: attachmentName,
      note: 'DRY RUN — Microsoft Graph credentials / real addresses not yet configured.',
    };
    fs.writeFileSync(preview, `<!-- ${JSON.stringify(meta, null, 2)} -->\n${html}`);
    fs.writeFileSync(path.join(dir, `${stem}.email.json`), JSON.stringify(meta, null, 2));
    fs.copyFileSync(file, path.join(dir, attachmentName));
    return { channel: 'email', mode: 'dryrun', preview, ...meta };
  }

  const token = await getToken(cfg);
  const contentBytes = fs.readFileSync(file).toString('base64');
  await graphFetch(token, `/users/${encodeURIComponent(email.senderUpn)}/sendMail`, {
    method: 'POST',
    json: {
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: recipients,
        ccRecipients: (email.cc || []).map((a) => ({ emailAddress: { address: a } })),
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: attachmentName,
            contentType: path.extname(attachmentName).toLowerCase() === '.pdf'
              ? 'application/pdf'
              : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            contentBytes,
          },
        ],
      },
      saveToSentItems: true,
    },
  });

  return {
    channel: 'email',
    mode: 'live',
    sentFrom: email.senderUpn,
    to: email.recipients.map((r) => r.address),
    subject,
    attachment: attachmentName,
  };
}

module.exports = { sendReport, subjectFor, bodyHtml };
