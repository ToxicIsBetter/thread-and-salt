#!/usr/bin/env node
'use strict';
/**
 * tas — Thread & Salt reporting CLI.
 *
 *   tas run <cadence> [--as-of YYYY-MM-DD] [--no-deliver] [--live|--dryrun]
 *   tas recipients list|set|add|remove …      change who gets the reports, any time
 *   tas sender <email>                        the Entra mailbox reports send from
 *   tas drive-owner <email>                   whose drive holds the archive
 *   tas doctor                                what's wired up, what's pending
 *   tas selftest                              fault-inject the retry loops
 */
const path = require('path');
const cfgLib = require('../src/config');
const { CADENCES } = require('../src/period');

const args = process.argv.slice(2);
const cmd = (args.shift() || 'help').toLowerCase();

/**
 * Outcomes that are NOT a failure, so exit 0.
 *
 * A skip means "this cadence cannot run yet, and that is expected" — no grain, or the
 * period is not in the source. The client is sent nothing either way, but a skip must
 * not exit non-zero: the scheduled routine reads the exit code, and a monthly false
 * alarm is how people learn to ignore real ones.
 */
const OK_OUTCOMES = new Set(['DELIVERED', 'SKIPPED_NO_GRAIN', 'SKIPPED_NO_DATA']);

function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, v && !v.startsWith('--') ? 2 : 1);
  return v && !v.startsWith('--') ? v : true;
}
function has(name) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) { args.splice(i, 1); return true; }
  return false;
}

async function main() {
  switch (cmd) {
    case 'run': {
      const cadence = (args.shift() || 'monthly').toLowerCase();
      if (!CADENCES.includes(cadence)) die(`Unknown cadence "${cadence}". Use: ${CADENCES.join(' | ')}`);
      const asOf = flag('as-of') || undefined;
      const format = flag('format') || undefined;
      const noDeliver = has('no-deliver');
      const live = has('live');
      const dry = has('dryrun');
      const { run } = require('../src/run');
      const res = await run({
        cadence,
        asOf,
        format: typeof format === 'string' ? format : undefined,
        deliver: !noDeliver,
        mode: live ? 'live' : dry ? 'dryrun' : undefined,
      });
      process.exitCode = OK_OUTCOMES.has(res.outcome) ? 0 : 1;
      break;
    }

    // What a single daily routine calls: run whatever the calendar says is due.
    case 'run-due': {
      const asOf = flag('as-of') || new Date().toISOString().slice(0, 10);
      const { dueCadences } = require('../src/period');
      const due = dueCadences(asOf);
      if (due.length === 0) {
        console.log(`Nothing due on ${asOf} — no report to generate today.`);
        break;
      }
      console.log(`Due on ${asOf}: ${due.join(', ')}`);
      const { run } = require('../src/run');
      const results = [];
      for (const cadence of due) {
        const res = await run({ cadence, asOf, deliver: !has('no-deliver') });
        results.push({ cadence, outcome: res.outcome });
      }
      console.log('\n── summary ──');
      for (const r of results) console.log(`  ${r.cadence.padEnd(11)} ${r.outcome}`);
      const bad = results.filter((r) => !OK_OUTCOMES.has(r.outcome));
      process.exitCode = bad.length ? 1 : 0;
      break;
    }

    case 'run-all': {
      const asOf = flag('as-of') || undefined;
      const { run } = require('../src/run');
      const results = [];
      for (const cadence of CADENCES) {
        const res = await run({ cadence, asOf, deliver: !has('no-deliver') });
        results.push({ cadence, outcome: res.outcome });
      }
      console.log('\n── summary ──');
      for (const r of results) console.log(`  ${r.cadence.padEnd(11)} ${r.outcome}`);
      break;
    }

    // ---------- recipient management (changeable at any time) ----------
    case 'recipients': {
      const sub = (args.shift() || 'list').toLowerCase();
      const cfg = cfgLib.load();
      if (sub === 'list') {
        console.log(`\nReports are emailed from: ${cfg.deliver.email.senderUpn}`);
        console.log('Recipients:');
        cfgLib.listRecipients(cfg).forEach((r, i) =>
          console.log(`  ${i + 1}. ${r.name ? `${r.name} <${r.address}>` : r.address}`)
        );
        if ((cfg.deliver.email.cc || []).length) console.log(`CC: ${cfg.deliver.email.cc.join(', ')}`);
        console.log('\nChange with:  tas recipients set "Mara <mara@…>" "Jonah <jonah@…>"');
        break;
      }
      if (sub === 'set') {
        if (!args.length) die('Provide at least one recipient, e.g. tas recipients set "Mara <mara@x.com>"');
        cfgLib.save(cfgLib.setRecipients(cfg, args));
        console.log('✓ Recipients updated:');
        cfgLib.listRecipients(cfgLib.load()).forEach((r) => console.log(`  • ${r.name ? `${r.name} <${r.address}>` : r.address}`));
        break;
      }
      if (sub === 'add') {
        if (!args.length) die('Provide the recipient to add.');
        cfgLib.save(cfgLib.addRecipient(cfg, args.join(' ')));
        console.log('✓ Added. Now sending to:');
        cfgLib.listRecipients(cfgLib.load()).forEach((r) => console.log(`  • ${r.address}`));
        break;
      }
      if (sub === 'remove') {
        if (!args.length) die('Provide the email address to remove.');
        cfgLib.save(cfgLib.removeRecipient(cfg, args[0]));
        console.log('✓ Removed. Now sending to:');
        cfgLib.listRecipients(cfgLib.load()).forEach((r) => console.log(`  • ${r.address}`));
        break;
      }
      die(`Unknown subcommand "${sub}". Use: list | set | add | remove`);
      break;
    }

    case 'sender': {
      const upn = args.shift();
      if (!upn) die('Provide the sending mailbox, e.g. tas sender reports@threadandsalt.co.uk');
      const cfg = cfgLib.load();
      cfgLib.save(cfgLib.setSender(cfg, upn));
      console.log(`✓ Reports will send from ${upn}`);
      break;
    }

    case 'drive-owner': {
      const upn = args.shift();
      if (!upn) die('Provide the drive owner, e.g. tas drive-owner reports@threadandsalt.co.uk');
      const cfg = cfgLib.load();
      cfgLib.save(cfgLib.setDriveOwner(cfg, upn));
      console.log(`✓ Archive copies will be filed in ${upn}'s drive`);
      break;
    }


    // ---------- credential helpers ----------
    case 'test-email': {
      // Prove mail credentials work before running a whole pipeline against them.
      const to = args.shift();
      const cfg = cfgLib.load();
      const r = cfgLib.readiness(cfg);
      const provider = r.mailProvider;
      console.log(`\nMail provider: ${provider}   credentials present: ${r.mailCreds ? 'yes' : 'NO'}`);
      if (!r.mailCreds) {
        die(provider === 'smtp'
          ? 'SMTP credentials missing. Set TAS_SMTP_USER / TAS_SMTP_PASS (+ host or preset) in .env'
          : 'Graph credentials missing. Set entra.tenantId, entra.clientId and TAS_GRAPH_CLIENT_SECRET');
      }
      const recipients = to ? [cfgLib.parseRecipient(to)] : cfgLib.listRecipients(cfg);
      const subject = `Thread & Salt — test message (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`;
      const html = '<p>This is a test from the Thread &amp; Salt reporting pipeline.</p>' +
        '<p>If you can read this, mail delivery is working and the next report will arrive the same way.</p>';

      if (provider === 'smtp') {
        const smtp = require('../src/deliver/smtp');
        process.stdout.write('  verifying SMTP connection… ');
        await smtp.verify(cfg);
        console.log('ok');
        const res = await smtp.sendMail({ cfg, to: recipients, cc: [], subject, html });
        console.log(`✓ sent from ${res.from} to ${recipients.map((x) => x.address).join(', ')}`);
        if (res.rejected && res.rejected.length) console.log(`  ! rejected: ${res.rejected.join(', ')}`);
      } else {
        const { getToken, graphFetch } = require('../src/deliver/graph');
        process.stdout.write('  requesting Entra token… ');
        const token = await getToken(cfg);
        console.log('ok');
        await graphFetch(token, `/users/${encodeURIComponent(cfg.deliver.email.senderUpn)}/sendMail`, {
          method: 'POST',
          json: { message: { subject, body: { contentType: 'HTML', content: html },
            toRecipients: recipients.map((x) => ({ emailAddress: { address: x.address } })) }, saveToSentItems: true },
        });
        console.log(`✓ sent from ${cfg.deliver.email.senderUpn} to ${recipients.map((x) => x.address).join(', ')}`);
      }
      break;
    }

    case 'xero-accounts': {
      // Lists the chart of accounts so the accountMap can be filled in from reality
      // rather than guessed — this is the main risk to the first report being right.
      const cfg = cfgLib.load();
      const { getTokenForList, listAccounts } = require('../src/ingest/xero-accounts');
      const accounts = await listAccounts(cfg);
      console.log(`\n${accounts.length} accounts in the Xero chart of accounts:\n`);
      const groups = {};
      for (const a of accounts) {
        (groups[a.type] = groups[a.type] || []).push(a);
      }
      for (const type of Object.keys(groups).sort()) {
        console.log(`  ${type}`);
        for (const a of groups[type]) console.log(`     ${String(a.code || '—').padEnd(8)} ${a.name}`);
      }
      console.log('\nPut the relevant codes into dataSource.xero.accountMap in src/config.json.');
      break;
    }

    // ---------- diagnostics ----------
    case 'doctor': {
      const cfg = cfgLib.load();
      const r = cfgLib.readiness(cfg);
      const tick = (b) => (b ? '✓' : '·');
      console.log(`\n${cfg.business.name} — reporting pipeline status\n`);
      console.log(`  data source            ${cfg.dataSource.provider}${cfg.dataSource.provider === 'fixture' ? '  (workbook — live Xero pending)' : ''}`);
      console.log(`  ${tick(r.xeroReady)} Xero connected        ${r.xeroReady ? 'yes' : 'not yet — set dataSource.xero.tenantId + $TAS_XERO_CLIENT_ID/$TAS_XERO_CLIENT_SECRET'}`);
      console.log(`  mail provider          ${r.mailProvider}`);
      if (r.mailProvider === 'smtp') {
        console.log(`  ${tick(r.smtpCreds)} SMTP credentials      ${r.smtpCreds ? `yes (${process.env.TAS_SMTP_USER})` : 'not yet — set TAS_SMTP_USER / TAS_SMTP_PASS (+ host or preset) in .env'}`);
      } else {
        console.log(`  ${tick(r.graphCreds)} Entra / Graph creds   ${r.graphCreds ? 'yes' : `not yet — set entra.tenantId, entra.clientId, $${cfg.entra.clientSecretEnv}`}`);
      }
      console.log(`  ${tick(r.realSender)} sending mailbox       ${cfg.deliver.email.senderUpn}`);
      console.log(`  ${tick(r.realRecipients)} recipients            ${cfg.deliver.email.recipients.map((x) => x.address).join(', ')}`);
      console.log(`  ${tick(true)} drive target          /${cfg.deliver.drive.rootFolder} (${cfg.deliver.drive.provider}, owner ${cfg.deliver.drive.driveOwnerUpn})`);
      console.log(`\n  delivery mode          ${r.effectiveDeliveryMode}${r.effectiveDeliveryMode === 'dryrun' ? '  (writes to output/…/outbox instead of sending)' : ''}`);
      console.log(`  cadences               ${CADENCES.join(', ')}`);
      console.log(`  weekly cadence         ${cfg.dataSource[cfg.dataSource.provider].grain === 'day' ? 'available' : 'waiting on Xero (needs daily grain)'}`);
      console.log(`  retry policy           ingest ×${cfg.retry.ingestAttempts}, render ×${cfg.retry.renderAttempts}, restarts ×${cfg.retry.fullRestarts}, timeout ${cfg.retry.wallClockMinutes}m\n`);
      break;
    }

    case 'selftest': {
      await require('../src/selftest').selftest();
      break;
    }

    case 'xero-selftest': {
      // Exercises the Xero adapter against a local mock — no Xero account required.
      const { spawnSync } = require('child_process');
      const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'test', 'xero-adapter.test.js')], { stdio: 'inherit' });
      process.exitCode = r.status || 0;
      break;
    }

    default:
      console.log(`
tas — Thread & Salt automated management accounts

  tas run <cadence>            weekly | monthly | quarterly | midyearly | yearly
       --as-of YYYY-MM-DD      pretend "today" is this date (default: today)
       --format pdf|docx       output format (default: pdf, from config)
       --no-deliver            generate + verify only, don't email/file
       --live | --dryrun       force delivery mode (default: auto)
  tas run-due                  run whatever the calendar says is due today
                               (what the single daily routine calls)
  tas run-all                  run every cadence in sequence

  tas recipients list          who currently receives the reports
  tas recipients set A B       replace the recipient list
  tas recipients add X         add one
  tas recipients remove X      remove one
  tas sender <email>           the Entra mailbox reports send FROM
  tas drive-owner <email>      whose drive stores the archive

  tas test-email [address]     send a test message to prove mail credentials work
  tas xero-accounts            list the Xero chart of accounts (to fill in accountMap)
  tas doctor                   what's wired up, what's still pending
  tas selftest                 fault-inject the verification loops
  tas xero-selftest            prove the Xero adapter against a local mock (no Xero needed)
`);
  }
}

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(2);
}

main().catch((e) => {
  console.error(`✗ ${e.stack || e.message}`);
  process.exit(1);
});
