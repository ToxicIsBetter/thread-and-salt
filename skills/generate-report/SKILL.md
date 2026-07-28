---
name: generate-report
description: Generate, verify and deliver a Thread & Salt management-accounts pack for one cadence (weekly, monthly, quarterly, midyearly or yearly). Pulls the figures from the configured source, verifies them, renders the document, verifies the document, then emails it and files it in the drive. Use when a scheduled routine fires or when someone asks for a report for a given period.
---

# Generate a management-accounts pack

Runs the whole pipeline unattended; safe to invoke repeatedly — nothing is sent unless both
verification gates pass.

> **Scope note.** Claude **Routines cannot load Skills**, so the scheduled runs do *not* call
> this file — they run `node bin/tas.js run <cadence>` from a prompt instead (see
> [`../../docs/CLIENT-SETUP.md`](../../docs/CLIENT-SETUP.md) §2.3). This skill is for
> interactive Claude Code sessions: ad-hoc packs, backfills, and diagnosing a failed run.

## How to run it

One command, from the project root. `<cadence>` is one of
`weekly | monthly | quarterly | midyearly | yearly`:

```bash
node bin/tas.js run <cadence>
```

Useful variations:

```bash
node bin/tas.js run monthly --as-of 2026-08-03   # treat this date as "today" (backfill / testing)
node bin/tas.js run monthly --no-deliver         # generate + verify only, don't email or file
node bin/tas.js run-due                          # whatever is due today
node bin/tas.js run-all                          # every cadence in sequence
node bin/tas.js doctor                           # what's connected, what's pending
```

## What it does

1. **Ingest** — pulls figures for the period from the configured source
   (Xero when connected; the client finance workbook until then).
2. **Clean** — repairs known data defects (missing period labels, stray values,
   inconsistent rounding) and flags anything it cannot repair.
3. **Compute** — deterministic P&L: revenue, COGS, gross profit, five operating-cost
   lines, net profit, margins, month-on-month and year-on-year growth, quarterly
   roll-ups. No figure is ever estimated by a language model.
4. **GATE 1 — verify the numbers.** Cross-foots every column, re-derives margins and
   growth by an independent code path, checks aggregation ties, reconciles to source,
   applies sanity bounds, and replays known-good historical fixtures.
5. **Render** — the PDF pack in the signed-off house shape, with two charts (PDF is what the
   founders receive; `--format docx` produces an editable Word version if ever needed).
6. **GATE 2 — verify the document.** Reads the generated file back off disk and proves
   every figure, section and chart arrived intact and that no untraceable number appears.
7. **Deliver** — emails the pack as an attachment to the configured recipients from the
   client's Microsoft 365 / Entra ID mailbox, and files a copy in their cloud drive
   under `/Thread & Salt Reports/<year>/<period>/`.

## Interpreting the result

- Exit code `0` and `✓ DELIVERED` — the report was verified and sent. Nothing to do.
- `✗ FAILED_NUMBERS` / `✗ FAILED_RENDER` — a gate could not be satisfied after all
  retries. **The client was sent nothing.** An alert was written to
  `output/<run>/ALERT.txt` and emailed to the maintainer. Read
  `output/<run>/verification.json` for the failing check and every attempt.
- `⚠ SKIPPED_NO_GRAIN` — this cadence needs finer-grained data than the current source
  has (the weekly pack needs daily data, i.e. Xero). Expected until Xero is connected;
  it starts working on its own afterwards.
- `⚠ SKIPPED_NO_DATA` — the source has no figures for this period at all (the workbook
  ends July 2026). Not a fault and not retryable: the period simply is not there yet. A
  `NOTICE.txt` is filed instead of an `ALERT.txt`, and the exit code is 0. Resolves itself
  once Xero is connected. Note this fires only for a **non-authoritative** source; a live
  Xero returning nothing for a closed period is treated as a genuine failure, because it is.

Do not try to "fix" a failed run by editing figures or re-sending manually — the point
of the gates is that a questionable number never reaches the founders. Diagnose from
`verification.json`, fix the cause, and re-run the same command.

## Retry behaviour (already built in — do not add your own loops)

- GATE 1 fails → re-ingests and recomputes, up to 3 escalating attempts.
- GATE 2 fails → re-renders, up to 5 escalating attempts.
- 5 render failures → restarts the whole pipeline from ingest, up to 2 times.
- A 20-minute wall-clock cap stops any run that hangs.

## Changing who receives the reports

Recipients are configuration, not code, and can be changed at any time:

```bash
node bin/tas.js recipients list
node bin/tas.js recipients set "Mara <mara@threadandsalt.co.uk>" "Jonah <jonah@threadandsalt.co.uk>"
node bin/tas.js recipients add "accountant@theirfirm.co.uk"
node bin/tas.js recipients remove "old@address.co.uk"
node bin/tas.js sender reports@threadandsalt.co.uk
```

The next scheduled run picks up the change automatically. No redeploy, no code edit.
