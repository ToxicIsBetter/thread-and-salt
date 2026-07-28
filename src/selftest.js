'use strict';
/**
 * Self-test — proves the safety machinery actually works by injecting faults,
 * which is the only way to trust a retry loop you hope never to see fire.
 *
 * Covers the definition-of-done items in IMPLEMENTATION-PLAN §8:
 *   • GATE 1 catches corrupted numbers and does not pass them through
 *   • GATE 2 catches a document that disagrees with the model
 *   • Loop B re-renders, Loop C restarts, and an exhausted run alerts + delivers nothing
 *   • happy path still delivers, with both gates green
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const configLib = require('./config');
const { windowFor } = require('./period');
const { ingest, coverageVerdict } = require('./ingest');
const { clean } = require('./transform/clean');
const pnl = require('./transform/pnl');
const signalsLib = require('./insight/signals');
const { verifyNumbers } = require('./verify/numbers');
const { verifyRender } = require('./verify/render');
const docxLib = require('./render/report');
const pdfLib = require('./render/pdf');

const AS_OF = '2026-08-03';
const results = [];

function assert(name, condition, detail = '') {
  results.push({ name, pass: !!condition, detail });
  console.log(`  ${condition ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function selftest() {
  const cfg = configLib.load();
  // Test the format the client actually receives, not whichever module happens to load.
  const format = (cfg.deliver.format || 'pdf').toLowerCase();
  const reportLib = format === 'docx' ? docxLib : pdfLib;
  console.log(`  (delivery format under test: ${format})`);
  const win = windowFor('monthly', AS_OF);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-selftest-'));

  console.log('\nThread & Salt — pipeline self-test\n');

  // ---------- baseline ----------
  console.log('baseline (clean data)');
  const raw = await ingest(cfg, win, 1);
  const cleaned = clean(raw);
  const model = pnl.build(cleaned, win, cfg);
  const signals = signalsLib.detect(model, cfg);
  const g1 = verifyNumbers(model, cleaned, cfg);
  assert('GATE 1 passes on clean data', g1.pass, `${g1.checked} checks`);

  const rendered = await reportLib.render(model, signals, path.join(tmp, 'ok'), {});
  const g2 = verifyRender(rendered, model, signals, cfg);
  assert('GATE 2 passes on a faithful render', g2.pass, `${g2.checked} checks, ${g2.figuresVerified} figures`);
  assert('a signal was detected for July 2026', signals.length > 0, signals.map((s) => s.id).join(', '));
  assert(
    'the July 2026 decline is the headline signal',
    signals[0] && signals[0].id === 'yoy-decline',
    signals[0] && signals[0].title
  );

  // ---------- GATE 1 fault injection ----------
  console.log('\nGATE 1 — fault injection');

  const bentNet = JSON.parse(JSON.stringify(model));
  bentNet.period.netPence += 50000; // £500 that doesn't cross-foot
  assert('catches a net profit that does not cross-foot', !verifyNumbers(bentNet, cleaned, cfg).pass);

  const bentOpex = JSON.parse(JSON.stringify(model));
  bentOpex.pnlColumns[0].opex.marketingPence += 100000;
  assert('catches opex lines that do not sum to the total', !verifyNumbers(bentOpex, cleaned, cfg).pass);

  const bentGrowth = JSON.parse(JSON.stringify(model));
  bentGrowth.headline.yoyPct = 12.3; // contradicts the underlying revenue
  assert('catches a growth rate that contradicts the data', !verifyNumbers(bentGrowth, cleaned, cfg).pass);

  const bentHistory = JSON.parse(JSON.stringify(model));
  const fy2025 = bentHistory.annualCols.find((c) => c.key.includes('2025'));
  if (fy2025) fy2025.revenuePence += 1000000;
  assert('catches drift from the known-good historical fixtures', !verifyNumbers(bentHistory, cleaned, cfg).pass);

  const bentSource = JSON.parse(JSON.stringify(cleaned));
  bentSource.months[bentSource.months.length - 1].revenuePence += 999900;
  const modelFromBent = pnl.build(bentSource, win, cfg);
  assert(
    'catches monthly data that no longer reconciles to the annual source',
    !verifyNumbers(modelFromBent, bentSource, cfg).pass
  );

  // ---------- GATE 2 fault injection ----------
  console.log('\nGATE 2 — fault injection');

  const missingFigure = { ...rendered, expected: [...rendered.expected, { key: 'injected.absent', text: '£999,999' }] };
  assert('catches a figure missing from the document', !verifyRender(missingFigure, model, signals, cfg).pass);

  const missingSection = { ...rendered, requiredSections: [...rendered.requiredSections, 'Cash flow statement'] };
  assert('catches a missing report section', !verifyRender(missingSection, model, signals, cfg).pass);

  const truncated = path.join(tmp, 'truncated.docx');
  fs.writeFileSync(truncated, fs.readFileSync(rendered.file).slice(0, 4000));
  assert('catches a truncated / unreadable document', !verifyRender({ ...rendered, file: truncated }, model, signals, cfg).pass);

  assert(
    'catches a document that was never written',
    !verifyRender({ ...rendered, file: path.join(tmp, 'nope.docx') }, model, signals, cfg).pass
  );

  const wrongSignal = [{ ...signals[0], title: 'Watch — a signal that was never computed' }];
  assert('catches an insight box that disagrees with the computed signal', !verifyRender(rendered, model, wrongSignal, cfg).pass);

  // ---------- loop behaviour ----------
  console.log('\nretry loops (end to end)');
  const { run } = require('./run');

  const happy = await run({ cadence: 'monthly', asOf: AS_OF, deliver: true, mode: 'dryrun', quiet: true, outRoot: path.join(tmp, 'out') });
  assert('happy path delivers', happy.outcome === 'DELIVERED', happy.outcome);
  assert('happy path used a single pass', happy.journal.attempts.filter((a) => a.loop === 'B').length === 1);

  // Force GATE 2 to fail forever by demanding an impossible figure, and confirm the
  // loops escalate, restart, exhaust, alert — and deliver nothing.
  const origRender = reportLib.render;
  reportLib.render = async (m, s, dir, o) => {
    const r = await origRender(m, s, dir, o);
    return { ...r, expected: [...r.expected, { key: 'injected.impossible', text: '£123,456,789' }] };
  };
  let forced;
  try {
    forced = await run({ cadence: 'monthly', asOf: AS_OF, deliver: true, mode: 'dryrun', quiet: true, outRoot: path.join(tmp, 'forced') });
  } finally {
    reportLib.render = origRender;
  }
  const bAttempts = forced.journal.attempts.filter((a) => a.loop === 'B');
  const passes = new Set(forced.journal.attempts.map((a) => a.pass));
  assert('an unfixable render fails the run', forced.outcome === 'FAILED_RENDER', forced.outcome);
  assert(
    `Loop B tried ${cfg.retry.renderAttempts}× per pass`,
    bAttempts.length === cfg.retry.renderAttempts * (1 + cfg.retry.fullRestarts),
    `${bAttempts.length} render attempts total`
  );
  assert(`Loop C restarted the pipeline ${cfg.retry.fullRestarts}×`, passes.size === 1 + cfg.retry.fullRestarts, `${passes.size} passes`);
  assert('nothing was emailed or filed on failure', !fs.existsSync(path.join(forced.outDir, 'outbox')));
  assert('an alert was written for us', fs.existsSync(path.join(forced.outDir, 'ALERT.txt')));
  assert('the journal records every attempt', fs.existsSync(path.join(forced.outDir, 'verification.json')));

  // ---------- weekly grain guard ----------
  console.log('\ngrain guard');
  const weekly = await run({ cadence: 'weekly', asOf: AS_OF, deliver: true, mode: 'dryrun', quiet: true, outRoot: path.join(tmp, 'weekly') });
  assert('weekly is skipped (not faked) while only monthly data exists', weekly.outcome === 'SKIPPED_NO_GRAIN', weekly.outcome);

  // ---------- coverage guard ----------
  // "No data for this period yet" must not look like "the pipeline is broken". The
  // workbook ends July 2026, so the September run (asking for August) is the first
  // real-world case: it has to skip calmly, not raise a monthly false alarm.
  console.log('\ncoverage guard');
  const beyond = await run({
    cadence: 'monthly', asOf: '2026-09-03', deliver: true, mode: 'dryrun', quiet: true,
    outRoot: path.join(tmp, 'beyond'),
  });
  assert('a period past the end of the source skips, not fails', beyond.outcome === 'SKIPPED_NO_DATA', beyond.outcome);
  assert(
    'the skip does not burn the ingest retry ladder',
    beyond.journal.attempts.length === 0,
    `${beyond.journal.attempts.length} attempts`
  );
  assert('nothing was delivered for an uncovered period', !fs.existsSync(path.join(beyond.outDir, 'outbox')));
  assert('a skip is filed as a NOTICE, not an ALERT', fs.existsSync(path.join(beyond.outDir, 'NOTICE.txt')));
  assert('a skip raises no ALERT.txt to chase', !fs.existsSync(path.join(beyond.outDir, 'ALERT.txt')));

  // The discriminator that keeps the skip safe. A static workbook can legitimately not
  // contain a month; a live ledger cannot — an empty pull from Xero means something is
  // wrong, so it must still fail loudly.
  const winAug = windowFor('monthly', '2026-09-03');
  const oldOnly = { months: [{ period: '2024-01', revenuePence: 1 }] };
  assert(
    'a non-authoritative source missing the month reports uncovered',
    coverageVerdict(cfg, oldOnly, winAug).covered === false
  );
  const xeroCfg = { ...cfg, dataSource: { ...cfg.dataSource, provider: 'xero' } };
  assert(
    'an authoritative source (Xero) is never silently skipped',
    coverageVerdict(xeroCfg, oldOnly, winAug).covered === true
  );
  // Partial coverage is the dangerous middle case — a total built from 1 of 3 months
  // would be wrong but plausible, so it must reach GATE 1 and fail there.
  const winQ = windowFor('quarterly', '2026-08-03'); // May–Jul 2026
  const partial = { months: [{ period: '2026-07', revenuePence: 1 }] };
  assert(
    'partial coverage reaches GATE 1 rather than skipping',
    coverageVerdict(cfg, partial, winQ).covered === true
  );

  // ---------- recipient management ----------
  console.log('\nrecipient management');
  const c2 = configLib.load();
  configLib.setRecipients(c2, ['Mara <mara@test.example>', 'Jonah <jonah@test.example>']);
  assert('recipients can be replaced', c2.deliver.email.recipients.length === 2);
  configLib.addRecipient(c2, 'accountant@test.example');
  assert('a recipient can be added', c2.deliver.email.recipients.length === 3);
  configLib.removeRecipient(c2, 'accountant@test.example');
  assert('a recipient can be removed', c2.deliver.email.recipients.length === 2);
  let rejected = false;
  try { configLib.addRecipient(c2, 'not-an-email'); } catch { rejected = true; }
  assert('an invalid address is rejected', rejected);
  let lastGuard = false;
  try {
    const solo = configLib.setRecipients(configLib.load(), ['only@test.example']);
    configLib.removeRecipient(solo, 'only@test.example');
  } catch { lastGuard = true; }
  assert('refuses to remove the last recipient', lastGuard);
  // NB: uses in-memory config only — src/config.json is never written by the self-test

  fs.rmSync(tmp, { recursive: true, force: true });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${failed.length === 0 ? '✓ all' : `✗ ${failed.length} of`} ${results.length} self-tests ${failed.length === 0 ? 'passed' : 'FAILED'}`);
  if (failed.length) {
    for (const f of failed) console.log(`   ✗ ${f.name}`);
    process.exitCode = 1;
  }
  return { total: results.length, failed: failed.length };
}

module.exports = { selftest };
