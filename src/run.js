'use strict';
/**
 * Orchestrator. Enforces both verification gates and all three retry loops:
 *
 *   LOOP C (failsafe, max 2 restarts)
 *     └─ LOOP A: ingest → transform → GATE 1        (max 3 attempts, escalating)
 *     └─ LOOP B: render → GATE 2 → deliver          (max 5 attempts, escalating)
 *
 * Delivery is unreachable unless both gates pass. Every attempt is journalled to
 * output/<run>/verification.json.
 */
const fs = require('fs');
const path = require('path');

const configLib = require('./config');
const { windowFor } = require('./period');
const { ingest, grainSufficient } = require('./ingest');
const { clean } = require('./transform/clean');
const pnl = require('./transform/pnl');
const signalsLib = require('./insight/signals');
const { verifyNumbers } = require('./verify/numbers');
const { verifyRender } = require('./verify/render');
const docxLib = require('./render/report');
const pdfLib = require('./render/pdf');
const { sendReport } = require('./deliver/email');
const { saveReport } = require('./deliver/drive');
const { sendAlert } = require('./deliver/alert');
const { slug } = require('./format');

const OUTCOME = {
  DELIVERED: 'DELIVERED',
  FAILED_NUMBERS: 'FAILED_NUMBERS',
  FAILED_RENDER: 'FAILED_RENDER',
  SKIPPED_NO_GRAIN: 'SKIPPED_NO_GRAIN',
  ERROR: 'ERROR',
};

function log(quiet, ...args) {
  if (!quiet) console.log(...args);
}

async function run(opts = {}) {
  const cfg = opts.cfg || configLib.load();
  const cadence = opts.cadence || 'monthly';
  const asOf = opts.asOf || new Date().toISOString().slice(0, 10);
  const quiet = !!opts.quiet;
  const deliverEnabled = opts.deliver !== false;

  const ready = configLib.readiness(cfg);
  const mode = opts.mode || ready.effectiveDeliveryMode;

  const format = (opts.format || cfg.deliver.format || 'pdf').toLowerCase();
  const reportLib = format === 'docx' ? docxLib : pdfLib;

  const win = windowFor(cadence, asOf);
  const runId = `${asOf}_${cadence}_${slug(win.label)}`;
  const outRoot = path.resolve(cfg._root, opts.outRoot || 'output', runId);
  fs.mkdirSync(outRoot, { recursive: true });

  const startedAt = Date.now();
  const wallClockMs = (cfg.retry.wallClockMinutes || 20) * 60 * 1000;
  const history = [];
  const journal = {
    runId,
    cadence,
    asOf,
    window: win,
    startedAt: new Date(startedAt).toISOString(),
    deliveryMode: mode,
    format,
    readiness: ready,
    attempts: [],
  };
  const writeJournal = (extra = {}) => {
    Object.assign(journal, extra);
    fs.writeFileSync(path.join(outRoot, 'verification.json'), JSON.stringify(journal, null, 2));
  };

  const outOfTime = () => Date.now() - startedAt > wallClockMs;

  log(quiet, `\n▶ ${cfg.business.name} — ${cadence} pack for ${win.label}`);
  log(quiet, `  source: ${cfg.dataSource.provider}   format: ${format}   delivery: ${mode}   run: ${runId}`);

  // ---- grain guard: weekly needs daily data (only Xero has it) ----
  if (!grainSufficient(cfg, win)) {
    const reason =
      `The ${cadence} pack needs daily-grain data, but the "${cfg.dataSource.provider}" source is ` +
      `${cfg.dataSource[cfg.dataSource.provider].grain}-grain. This cadence starts working automatically ` +
      `once Xero is connected — no code change needed.`;
    log(quiet, `⚠ SKIPPED — ${reason}`);
    history.push({ stage: 'grain', pass: false, outcome: OUTCOME.SKIPPED_NO_GRAIN, error: reason });
    writeJournal({ outcome: OUTCOME.SKIPPED_NO_GRAIN, reason, finishedAt: new Date().toISOString() });
    await sendAlert({ cfg, subject: `${cadence} pack skipped (needs Xero)`, reason, history, outDir: outRoot, mode });
    return { outcome: OUTCOME.SKIPPED_NO_GRAIN, reason, outDir: outRoot, journal };
  }

  const maxPasses = 1 + (cfg.retry.fullRestarts || 0);

  for (let pass = 1; pass <= maxPasses; pass++) {
    log(quiet, `\n── pass ${pass}/${maxPasses} ──`);

    // ================= LOOP A: data =================
    let model = null;
    let cleaned = null;
    let gate1 = null;

    for (let attempt = 1; attempt <= (cfg.retry.ingestAttempts || 3); attempt++) {
      if (outOfTime()) return await bail(OUTCOME.ERROR, 'Wall-clock timeout exceeded');
      try {
        const raw = await ingest(cfg, win, attempt);
        cleaned = clean(raw);
        model = pnl.build(cleaned, win, cfg);
        gate1 = verifyNumbers(model, cleaned, cfg);

        const rec = {
          pass, loop: 'A', stage: 'ingest+transform', attempt, escalation: attempt,
          gate: gate1.gate, pass_: gate1.pass, checked: gate1.checked,
          failures: gate1.failures.map((f) => ({ name: f.name, detail: f.detail })),
        };
        journal.attempts.push(rec);
        history.push({ ...rec, pass: gate1.pass, outcome: gate1.pass ? 'GATE1_PASS' : 'GATE1_FAIL' });
        writeJournal();

        log(quiet, `  GATE 1 ${gate1.pass ? '✓ pass' : '✗ fail'} (${gate1.checked - gate1.failedCount}/${gate1.checked} checks) [attempt ${attempt}]`);
        if (gate1.pass) break;
        for (const f of gate1.failures.slice(0, 5)) log(quiet, `        ✗ ${f.name}: ${f.detail}`);
      } catch (e) {
        const rec = { pass, loop: 'A', stage: 'ingest+transform', attempt, error: e.message, code: e.code };
        journal.attempts.push(rec);
        history.push({ ...rec, pass: false, outcome: 'INGEST_ERROR' });
        writeJournal();
        log(quiet, `  ingest attempt ${attempt} errored: ${e.message}`);
        if (e.code === 'XERO_NOT_CONNECTED') {
          return await bail(OUTCOME.ERROR, e.message); // no point retrying a missing connection
        }
      }
      if (attempt === (cfg.retry.ingestAttempts || 3)) {
        return await bail(OUTCOME.FAILED_NUMBERS, 'GATE 1 could not be satisfied after all ingest attempts');
      }
    }

    // ================= LOOP B: render =================
    const signals = signalsLib.detect(model, cfg);
    const renderAttempts = cfg.retry.renderAttempts || 5;
    let gate2 = null;

    for (let attempt = 1; attempt <= renderAttempts; attempt++) {
      if (outOfTime()) return await bail(OUTCOME.ERROR, 'Wall-clock timeout exceeded');
      const attemptDir = path.join(outRoot, `pass${pass}`, `render${attempt}`);

      try {
        // escalation ladder — each rung changes something (see IMPLEMENTATION-PLAN §5)
        if (attempt >= 3 && fs.existsSync(attemptDir)) fs.rmSync(attemptDir, { recursive: true, force: true });
        const renderModel = attempt >= 4 ? JSON.parse(JSON.stringify(model)) : model; // strict re-serialise
        fs.mkdirSync(attemptDir, { recursive: true });

        const result = await reportLib.render(renderModel, signals, attemptDir, { escalation: attempt });
        gate2 = verifyRender(result, model, signals, cfg);

        const rec = {
          pass, loop: 'B', stage: 'render', attempt, escalation: attempt, file: result.file,
          gate: gate2.gate, pass_: gate2.pass, checked: gate2.checked, figuresVerified: gate2.figuresVerified,
          failures: gate2.failures.map((f) => ({ name: f.name, detail: f.detail })),
        };
        journal.attempts.push(rec);
        history.push({ ...rec, pass: gate2.pass, outcome: gate2.pass ? 'GATE2_PASS' : 'GATE2_FAIL' });
        writeJournal();

        log(quiet, `  GATE 2 ${gate2.pass ? '✓ pass' : '✗ fail'} (${gate2.checked - gate2.failedCount}/${gate2.checked} checks, ${gate2.figuresVerified || 0} figures) [attempt ${attempt}]`);
        if (!gate2.pass) {
          for (const f of gate2.failures.slice(0, 5)) log(quiet, `        ✗ ${f.name}: ${f.detail}`);
          if (attempt === renderAttempts) break; // → LOOP C
          continue;
        }

        // ---------- both gates green: deliver ----------
        const receipts = [];
        if (deliverEnabled) {
          receipts.push(await sendReport({ cfg, model, signals, file: result.file, mode, outDir: outRoot }));
          receipts.push(await saveReport({ cfg, model, file: result.file, mode, outDir: outRoot }));
        }
        const finalFile = path.join(outRoot, path.basename(result.file));
        fs.copyFileSync(result.file, finalFile);
        fs.writeFileSync(path.join(outRoot, 'report-model.json'), JSON.stringify(model, null, 2));

        writeJournal({
          outcome: OUTCOME.DELIVERED,
          file: finalFile,
          receipts,
          signals: signals.map((s) => ({ id: s.id, severity: s.severity, title: s.title })),
          finishedAt: new Date().toISOString(),
        });

        log(quiet, `\n✓ DELIVERED — ${path.basename(finalFile)}`);
        for (const r of receipts) {
          const to = (r.to || []).map((x) => (typeof x === 'string' ? x : x.address)).join(', ');
          log(quiet, `  ${r.channel}: ${r.mode}${to ? ` → ${to}` : ''}${r.path ? ` → ${r.path}` : ''}`);
        }
        return { outcome: OUTCOME.DELIVERED, file: finalFile, model, signals, gate1, gate2, receipts, outDir: outRoot, journal };
      } catch (e) {
        const rec = { pass, loop: 'B', stage: 'render', attempt, error: e.message };
        journal.attempts.push(rec);
        history.push({ ...rec, pass: false, outcome: 'RENDER_ERROR' });
        writeJournal();
        log(quiet, `  render attempt ${attempt} errored: ${e.message}`);
      }
    }

    log(quiet, `  ⟲ LOOP C — ${renderAttempts} render attempts failed; restarting from ingest`);
  }

  return await bail(OUTCOME.FAILED_RENDER, `GATE 2 could not be satisfied after ${maxPasses} full passes`);

  // ---------- helpers ----------
  async function bail(outcome, reason) {
    log(quiet, `\n✗ ${outcome} — ${reason}`);
    writeJournal({ outcome, reason, finishedAt: new Date().toISOString() });
    const alert = await sendAlert({
      cfg, subject: `${cfg.business.name} ${cadence} run failed (${outcome})`, reason, history, outDir: outRoot, mode,
    });
    log(quiet, `  alert written to ${alert.file}`);
    return { outcome, reason, outDir: outRoot, journal, alert };
  }
}

module.exports = { run, OUTCOME };
