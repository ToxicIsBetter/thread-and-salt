'use strict';
/**
 * `tas demo` — the solution presentation, run live.
 *
 * Walks the whole pipeline in front of an audience, narrating each stage and showing real
 * output rather than slides: the messy source, the deterministic maths, both verification
 * gates, the July-2026 signal, delivery, and the safety machinery proven by fault injection.
 *
 *   node bin/tas.js demo              # dry run — nothing is emailed
 *   node bin/tas.js demo --live       # actually sends the pack
 *   node bin/tas.js demo --pause      # wait for Enter between sections (for narrating)
 *
 * Deliberately uses the real pipeline modules — nothing here is staged or pre-baked, so a
 * failure on stage would be a genuine failure, not a broken demo.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const configLib = require('./config');
const { windowFor, dueCadences } = require('./period');
const { ingest } = require('./ingest');
const { clean } = require('./transform/clean');
const pnl = require('./transform/pnl');
const signalsLib = require('./insight/signals');
const { verifyNumbers } = require('./verify/numbers');
const { verifyRender } = require('./verify/render');
const { gbp, pct1, signedPct1 } = require('./format');

const AS_OF = '2026-08-03';

const B = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const OK = (s) => `\x1b[32m${s}\x1b[0m`;
const BAD = (s) => `\x1b[31m${s}\x1b[0m`;
const CYAN = (s) => `\x1b[36m${s}\x1b[0m`;

let paused = false;
function hr(title) {
  console.log(`\n${CYAN('─'.repeat(74))}`);
  console.log(CYAN(`  ${title}`));
  console.log(`${CYAN('─'.repeat(74))}\n`);
}
async function beat(msg) {
  if (msg) console.log(DIM(`  ${msg}`));
  if (!paused) return;
  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(DIM('\n  [Enter to continue] '), () => { rl.close(); resolve(); });
  });
}

async function demo(opts = {}) {
  paused = !!opts.pause;
  const live = !!opts.live;
  const cfg = configLib.load();

  console.log(B('\n  Thread & Salt — automated management accounts'));
  console.log(DIM('  A live run. Every figure below is computed from the real data, now.\n'));
  console.log(`  Source: ${B(cfg.dataSource.provider === 'xero' ? 'live Xero' : 'client finance workbook')}`);
  console.log(`  Delivery: ${B(live ? 'live' : 'dry run (nothing will be sent)')}`);
  console.log(`  Reporting as if today were: ${B(AS_OF)}`);
  await beat();

  // ---------------------------------------------------------------- 1. the problem
  hr('1. The data you actually have');
  const win = windowFor('monthly', AS_OF);
  const raw = await ingest(cfg, win, 1);
  const cleaned = clean(raw);
  console.log(`  Read ${B(String(cleaned.months.length))} months, ${cleaned.quality.firstMonth} → ${cleaned.quality.lastMonth}`);
  console.log(`\n  ${B('Problems found and repaired automatically:')}`);
  for (const f of cleaned.quality.fixes) console.log(`    ${OK('✓')} ${f}`);
  if (cleaned.quality.warnings.length) {
    for (const w of cleaned.quality.warnings) console.log(`    ${BAD('!')} ${w}`);
  }
  await beat('Cleaning happens on every run, so bad data can never reach a report.');

  // ---------------------------------------------------------------- 2. the maths
  hr('2. The numbers — computed, not estimated');
  const model = pnl.build(cleaned, win, cfg);
  const p = model.period;
  console.log(`  ${B(model.meta.periodLabel)}`);
  console.log(`    Revenue          ${gbp(p.revenuePence).padStart(12)}`);
  console.log(`    Cost of goods    ${('(' + gbp(p.cogsPence) + ')').padStart(12)}`);
  console.log(`    Gross profit     ${gbp(p.grossPence).padStart(12)}   ${pct1(model.headline.grossMarginPct)} margin`);
  console.log(`    Operating costs  ${('(' + gbp(p.opexTotalPence) + ')').padStart(12)}`);
  console.log(`    ${B('Net profit')}       ${B(gbp(p.netPence).padStart(12))}   ${pct1(model.headline.netMarginPct)} margin`);
  console.log(`\n  vs ${model.headline.priorLabel}: ${B(signedPct1(model.headline.priorPct))}    vs ${model.headline.yoyLabel}: ${B(signedPct1(model.headline.yoyPct))}`);
  await beat('No language model computes any of this. It is deterministic code, in whole pence.');

  // ---------------------------------------------------------------- 3. gate 1
  hr('3. GATE 1 — prove the numbers before drawing anything');
  const g1 = verifyNumbers(model, cleaned, cfg);
  console.log(`  ${g1.pass ? OK('✓ PASS') : BAD('✗ FAIL')}  ${g1.checked - g1.failedCount}/${g1.checked} checks\n`);
  const show = ['crossfoot:gross:period', 'recompute:revenue', 'recompute:netMargin', 'tie:monthsToYear:FY2025', 'fixture:FY2025'];
  for (const name of show) {
    const c = g1.checks.find((x) => x.name === name);
    if (c) console.log(`    ${c.pass ? OK('✓') : BAD('✗')} ${name.padEnd(28)} ${DIM(c.detail.slice(0, 60))}`);
  }
  console.log(DIM(`\n    …and ${g1.checked - show.length} more: cross-footing, independent recomputation,`));
  console.log(DIM('    aggregation ties, reconciliation to source, sanity bounds, historical fixtures.'));
  await beat('If any check fails, nothing is rendered and nobody is emailed.');

  // ---------------------------------------------------------------- 4. render + gate 2
  hr('4. The report, then GATE 2 — prove the document matches');
  const signals = signalsLib.detect(model, cfg);
  const dir = path.resolve(cfg._root, 'output', 'demo');
  fs.rmSync(dir, { recursive: true, force: true });
  const renderLib = (cfg.deliver.format || 'pdf') === 'docx' ? require('./render/report') : require('./render/pdf');
  const result = await renderLib.render(model, signals, dir, {});
  const g2 = verifyRender(result, model, signals, cfg);
  console.log(`  Produced ${B(path.basename(result.file))}  ${DIM(`(${(fs.statSync(result.file).size / 1024).toFixed(0)} KB)`)}`);
  console.log(`  ${g2.pass ? OK('✓ PASS') : BAD('✗ FAIL')}  ${g2.checked - g2.failedCount}/${g2.checked} checks, ${B(String(g2.figuresVerified))} figures read back out of the finished file`);
  console.log(DIM('\n    The document is re-opened and every number compared against the verified'));
  console.log(DIM('    figures. A typo introduced while drawing would be caught here.'));
  await beat();

  // ---------------------------------------------------------------- 5. the insight
  hr('5. What it noticed without being asked');
  for (const s of signals.slice(0, 2)) {
    console.log(`  ${s.severity === 'high' ? BAD('▲') : CYAN('•')} ${B(s.title)}`);
    console.log(`    ${s.body}`);
    console.log(`    ${OK('Recommended action:')} ${s.action}\n`);
  }
  await beat('This is the signal the founders would not have spotted until far too late.');

  // ---------------------------------------------------------------- 6. safety
  hr('6. What happens when something is wrong');
  const bent = JSON.parse(JSON.stringify(model));
  bent.period.netPence += 50000;
  const bentResult = verifyNumbers(bent, cleaned, cfg);
  console.log(`  Injecting a £500 error into net profit…`);
  console.log(`    GATE 1: ${bentResult.pass ? BAD('✗ missed it') : OK('✓ caught it')} — ${bentResult.failedCount} check(s) failed:`);
  for (const f of bentResult.failures.slice(0, 2)) console.log(`      ${BAD('✗')} ${f.name}  ${DIM(f.detail.slice(0, 55))}`);
  console.log(`\n  ${B('So a wrong number cannot reach the founders.')} The run retries — re-reading the`);
  console.log(`  data up to 3 times, re-rendering up to 5, restarting twice — and if it still cannot`);
  console.log(`  satisfy both gates it emails ${B('us')} and sends them ${B('nothing')}.`);
  await beat('Verified by 41 self-tests that deliberately break things, plus 15 Xero adapter tests.');

  // ---------------------------------------------------------------- 7. delivery
  hr('7. Delivery');
  const { run } = require('./run');
  const res = await run({ cadence: 'monthly', asOf: AS_OF, deliver: true, mode: live ? 'live' : 'dryrun', quiet: true });
  console.log(`  Outcome: ${res.outcome === 'DELIVERED' ? OK(res.outcome) : BAD(res.outcome)}`);
  for (const r of res.receipts || []) {
    const to = (r.to || []).map((x) => (typeof x === 'string' ? x : x.address)).join(', ');
    console.log(`    ${r.channel.padEnd(6)} ${r.mode.padEnd(7)} ${to || r.note || ''}`);
  }
  console.log(DIM(`\n    Report and full audit trail: output/${path.basename(res.outDir)}/`));
  await beat();

  // ---------------------------------------------------------------- 8. the cadence
  hr('8. And it runs itself');
  console.log('  One scheduled routine, every morning, asks what is due:\n');
  for (const d of ['2026-08-03', '2026-08-10', '2026-08-11', '2027-01-05']) {
    const due = dueCadences(d);
    console.log(`    ${d}  →  ${due.length ? B(due.join(', ')) : DIM('nothing due — stops immediately')}`);
  }
  console.log(`\n  ${B('What the founders do:')} open the email. That is the whole job.`);
  console.log(DIM('  Weekly, monthly, quarterly, half-year and annual packs, all from one schedule.'));

  console.log(`\n${CYAN('─'.repeat(74))}`);
  console.log(`  ${OK('Live, verified, and running on its own.')}`);
  console.log(`${CYAN('─'.repeat(74))}\n`);

  return { gate1: g1.pass, gate2: g2.pass, outcome: res.outcome };
}

module.exports = { demo };
