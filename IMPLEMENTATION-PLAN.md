# Thread & Salt — Implementation Plan

**Automated management accounts from Xero → inbox + drive, on five cadences, self-managed.**
This is the build plan for the Core in the final proposal. It turns the existing prototype
(`build_report.js`, `make_charts.py`, verified data model) into a live, scheduled pipeline the
client never has to touch.

> **Build note:** we are building the whole thing in **one working session**. The 3-week timeline in
> the proposal is client-facing pacing only — ignore it here. Phases below are ordered build steps,
> not a calendar.

---

## 1. Architecture at a glance

```
                    ┌──────────────────────────────────────────────────────┐
   SCHEDULE         │  Claude routine fires (weekly / monthly / quarterly /  │
   (5 routines) ───▶│  mid-yearly / yearly) — runs on Anthropic's cloud      │
                    └───────────────────────────┬──────────────────────────┘
                                                │  invokes "generate-report" skill with {cadence}
                                                ▼
   ┌─────────────┐  read   ┌──────────────┐   ┌──────────────┐   ✅GATE 1
   │   XERO      │────────▶│ 1. INGEST    │──▶│ 2. TRANSFORM │──▶ VERIFY NUMBERS
   │ (source of  │ P&L,    │  map accounts│   │ clean+compute│   (recompute,
   │  truth)     │ invoices│              │   │ →JSON        │    reconcile)
   └─────────────┘         └──────▲───────┘   └──────────────┘        │
                                  │                                   │ FAIL → LOOP A
                                  └───────────────────────────────────┤ (re-ingest, max 3)
                                  ▲                                   │
                                  │                            PASS ▼
                                  │                        ┌──────────────┐
                                  │                        │ 3. RENDER    │◀──┐
                                  │                        │ charts+docx  │   │ FAIL → LOOP B
                                  │                        └──────┬───────┘   │ (re-render, max 5)
                                  │                               ▼           │
                                  │                        ✅GATE 2 ──────────┘
                                  │                    VERIFY RENDER
                                  │                   (read docx back,
                                  │                    diff vs JSON)
                                  │                               │
              LOOP C (failsafe):  │                        PASS ▼
              5× GATE 2 failures  │                 ┌──────────────┐      ┌──────────────┐
              → restart whole ────┘                 │ 4. DELIVER   │─────▶│ Gmail + Drive│
              pipeline (max 2)                      │ email + drive│      │  (client's)  │
                                                    └──────────────┘      └──────────────┘
```

**Design principle — split the maths from the model.** All figures are computed by deterministic
code, never by the LLM eyeballing numbers. Claude orchestrates the run, drives the Xero/Gmail/Drive
connectors, and writes the plain-English narrative. Two automated verification gates (§ Phase 3 and
Phase 5) guarantee the numbers are right *and* land in the document unchanged — this is what makes
"every figure reconciles to Xero" a true statement.

**Design principle — self-healing, but bounded.** A failed gate never sends a wrong report and never
silently gives up: it re-runs the stage that could plausibly fix it (§ Retry & self-healing policy).
Every loop is attempt-capped, each retry *escalates* rather than repeating identical work, and when
all loops are exhausted the run alerts a human instead of delivering.

**Everything runs under the client's own account** (Claude Pro + their Xero + their Drive), so at
handover there is nothing to transfer and no dependency on us.

---

## 2. Repository layout (target)

```
thread-and-salt/
├── src/
│   ├── config.json              # account-map, recipients, drive folder id, thresholds
│   ├── ingest/
│   │   └── xero.js              # pull P&L + invoices for a date range via Xero
│   ├── transform/
│   │   ├── clean.js            # data-quality fixes (see §Data-quality fixes)
│   │   └── pnl.js              # deterministic P&L, margins, MoM/YoY, quarterly, seasonality
│   ├── verify/
│   │   ├── numbers.js          # GATE 1 — accuracy checks on the computed JSON
│   │   └── render.js           # GATE 2 — read-back diff of the generated docx vs JSON
│   ├── render/
│   │   ├── charts.py           # parameterised from make_charts.py
│   │   └── report.js           # parameterised from build_report.js (period-driven)
│   ├── insight/
│   │   └── signals.js          # rule-based flags for Core (agentic in stretch)
│   ├── deliver/
│   │   ├── email.js            # Gmail send-with-attachment
│   │   ├── drive.js            # save to dated folder
│   │   └── alert.js            # failure/exhaustion alert to us (never to the client)
│   ├── retry.js                 # loop policy: caps, escalation ladders, backoff
│   └── run.js                   # orchestrator: run({cadence, asOf}) — gates + loops A/B/C
├── skills/
│   └── generate-report/SKILL.md # Claude Code skill wrapping run.js (what routines call)
├── routines/
│   └── schedules.md             # the 5 cron definitions + prompts
├── output/                       # generated packs + verification.json (git-ignored)
└── (existing) scripts/, deliverables/, data/
```

Reuse: `build_report.js` → `src/render/report.js`; `make_charts.py` → `src/render/charts.py`;
the verified figures/assumptions become the reconciliation fixtures for the gates.

---

## 3. Build phases

### Phase 0 — Kickoff & access
- Confirm: Xero (read scope), the send-from email account, the target Drive + folder.
- Connect the three MCP connectors under the **client's** account; store nothing but a `config.json`
  (account map, recipient list, drive folder id) — no secrets in the repo.
- Decide the fiscal-year start (assumed calendar-year here) so "yearly" and YTD are correct.

### Phase 1 — Ingest from Xero
- `src/ingest/xero.js`: given a date range, pull the **Profit & Loss** report and invoice/line data.
- Build the **account map**: Xero chart-of-accounts codes → report lines (Revenue, COGS, Marketing,
  Fulfilment, Platform & payment fees, Founders' comp, Software & other). Confirm the map with Jonah once.

### Phase 2 — Transform & compute
- `src/transform/clean.js`: apply the data-quality fixes (see below).
- `src/transform/pnl.js`: deterministic computation of the full P&L, gross/net margin, MoM & YoY
  growth, quarterly roll-ups, seasonality markers, and period-appropriate windows (see §4).
- Output a **fixed-shape JSON** (a schema) so every render is identical and comparable.

### Phase 3 — ✅ GATE 1: Verify the numbers  *(new — accuracy double-check)*
Prove the computed figures are correct **before** anything is rendered. `src/verify/numbers.js` runs
these automated checks against the Phase-2 JSON; **any failure alerts us and stops the run** (never
sends a wrong report):
- **Cross-foot the P&L** — Revenue − COGS = Gross profit; Gross − Total opex = Net profit; the five
  opex lines sum to Total opex; every column and row ties out.
- **Independent recomputation** — margins and MoM/YoY growth are re-derived by a second, separate code
  path and must equal the primary path within a tiny tolerance.
- **Aggregation ties** — Σ months = quarter = half = year for the overlapping window; YTD = Σ months to date.
- **Reconcile to Xero** — computed Revenue / COGS / opex / Net equal Xero's own P&L report totals **to the penny**.
- **Sanity bounds** — no negatives/NaN where impossible; margins in plausible range; units × rev-per-unit ≈ revenue.
- **Regression fixtures** — historical periods still reproduce the verified figures (FY2024 £588,800 …
  FY2026-YTD £347,342, net margins 23.2% / 23.1% / 22.1%).
- **Independent second-pass cross-check (agentic)** — a Claude verification pass re-derives the headline
  numbers straight from the raw Xero pull and confirms they match the code path, catching any shared-logic bug.
- **Output:** `verification.json` with pass/fail per check; a green result is required to proceed.

**🔁 LOOP A — on failure, go back to Ingest.** If any check fails, the run does **not** proceed to render.
It loops back to **Phase 1 (Ingest)** and re-pulls from Xero, then re-transforms and re-verifies —
because the most common real cause is a bad *read* (a partial/paginated response, a rate-limited call,
or a mid-sync Xero state), which a fresh pull genuinely fixes. Up to **3 attempts**, each escalating:

| Attempt | What's different |
|---|---|
| 1 | Re-pull the same window after a short backoff — clears transient/rate-limited responses |
| 2 | Re-pull with cache bypassed and pagination forced to completion — catches truncated reads |
| 3 | Re-pull the window in narrower date chunks and stitch — catches Xero report timeouts/limits |

If the raw pull comes back **byte-identical** to a previous attempt and the same check fails again, the
loop skips ahead to the next escalation rung rather than burning an attempt on identical work. After
3 attempts it **stops and alerts** (§ Retry & self-healing policy) — no report is rendered or sent.

### Phase 4 — Render the pack
- `src/render/charts.py`: parameterised charts for the requested window.
- `src/render/report.js`: the docx in the sample's exact shape — At-a-glance KPIs, full P&L,
  revenue trend + quarterly table, insight box, notes. Emits `.docx` (and `.pdf` if LibreOffice present).

### Phase 5 — ✅ GATE 2: Verify the rendered pack  *(new — render double-check)*
Prove the document faithfully reflects the verified numbers — catch rendering drift, transposition,
truncation or a missing section. `src/verify/render.js` parses the **generated file** and checks:
- **Read-back diff** — extract every numeric cell from the produced `.docx` and assert it equals the
  source JSON figure (formatted). **Zero tolerance** on any mismatch.
- **Structural completeness** — all required sections/tables present (At a glance, P&L, revenue trend,
  quarterly, insight, notes); no empty tables; no `undefined`/placeholder tokens.
- **Charts embedded & correct** — both PNGs present as valid media and generated for the requested window.
- **Insight consistency** — the signal shown in the box matches exactly what `signals.js` computed
  (same figures, same direction).
- **Integrity** — file opens, page count sane.
- **Output:** appended to `verification.json`. Delivery is unreachable unless this gate is green.

**🔁 LOOP B — on mismatch, go back to Render.** If the rendered pack doesn't match the verified JSON, the
numbers are already known-good, so re-ingesting would be pointless — the fault is in rendering. The run
loops back to **Phase 4 (Render)** and rebuilds the document, then re-verifies. Up to **5 attempts**, each
escalating (a plain repeat of a deterministic render would fail identically, so every rung changes something):

| Attempt | What's different |
|---|---|
| 1 | Re-render from the same JSON — clears a transient file-write/lock/partial-flush |
| 2 | Regenerate the charts, then re-render — catches a missing/corrupt PNG or wrong-window chart |
| 3 | Wipe the output dir + temp artifacts and render clean — catches stale/leftover files |
| 4 | Re-serialise the JSON and render via the strict formatter path — catches formatting/rounding drift |
| 5 | Final attempt with full diagnostics captured (per-cell expected-vs-actual diff) for the alert |

**🔁 LOOP C — failsafe: 5 render failures restart everything.** If GATE 2 still fails after all 5 render
attempts, the run treats the verified JSON itself as suspect and **restarts the whole pipeline from
Phase 1 (Ingest)** — fresh pull, fresh transform, GATE 1, render, GATE 2. Up to **2 full restarts**
(3 total end-to-end passes). If the final pass still fails, the run **stops and alerts** — the client is
never sent an unverified report and never sees a broken one.

- **Then M1 — first report, both gates green, reviewed by us and signed off by the client** (human sign-off
  sits on top of the two automated gates).

### Phase 6 — Deliver
- `src/deliver/email.js`: email the pack **as an attachment** to the recipient list, subject
  `Thread & Salt — {Cadence} management accounts — {period}`.
- `src/deliver/drive.js`: save the same file into a dated folder,
  e.g. `/Thread & Salt Reports/2026/2026-07 Monthly/`.
- `src/run.js`: orchestrate the whole flow for a given `{cadence, asOf}`, enforcing both gates and all
  three loops. Delivery is unreachable unless both gates pass:

```
run({cadence, asOf}):
  for pass in 1..3:                          # LOOP C — failsafe restarts (1 initial + 2)
      for ingestAttempt in 1..3:             # LOOP A — bad data → re-ingest
          raw  = ingest(cadence, asOf, escalation=ingestAttempt)
          json = transform(clean(raw))
          if verifyNumbers(json).pass: break
          if ingestAttempt == 3: alert("GATE 1 exhausted"); return FAILED
      for renderAttempt in 1..5:             # LOOP B — bad render → re-render
          doc = render(json, escalation=renderAttempt)
          if verifyRender(doc, json).pass:
              deliver(doc)                   # email + drive — only reachable here
              return DELIVERED
      # 5 render failures → fall through to the next full pass (LOOP C)
  alert("GATE 2 exhausted after 3 full passes"); return FAILED
```

- Every attempt writes to its own directory and appends to `verification.json`, so the alert carries the
  full history (which check failed, on which attempt, expected vs actual). Nothing is emailed to the
  client until both gates are green — a failed run is silent to them and loud to us.

### Phase 7 — Package as a skill & schedule
- Wrap `run.js` in a Claude Code **skill** (`generate-report`) that takes one argument, the cadence.
- Stand up the **five routines** (§6). Dry-run each once with a fixed `asOf` date to prove delivery.
- Founder training + one-page plain-English guide. **M2 — automated cadence live.**

### Phase 8 — Harden & hand over
- Failure handling: on a gate failure, Xero auth lapse, or non-reconciling total, the run **emails an
  alert instead of sending a report**. Retry-once on transient errors.
- Full handover: everything under the client's account, documented; ownership transfers outright. **M3.**

### Phase 9 — Optional upgrade: proactive insight agent
- Replace rule-based `signals.js` with an agentic loop: observe → analyse → recommend → repeat. Rides
  the same routines, gates and delivery; adds a prioritised note to each email.

---

## 4. What each cadence computes

| Routine | Window pulled from Xero | Report emphasis |
|---|---|---|
| **Weekly** | the last completed 7 days | quick pulse vs prior week / same week last year |
| **Monthly** | the last completed month | the full management-accounts pack (the sample's shape) |
| **Quarterly** | the last 3 months | trend + seasonality, quarter vs prior quarters/years |
| **Mid-yearly** | the last 6 months | half-year checkpoint vs plan and prior year |
| **Yearly** | the last full year | annual P&L, growth, margin, the year in full |

Same template every time — only the window and the emphasis paragraph change. Both gates run on every cadence.

---

## 5. Retry & self-healing policy

All three loops in one place. The rule: **retry what could plausibly fix it, escalate each time, cap
everything, and alert a human when exhausted.**

| Loop | Trigger | Returns to | Cap | On exhaustion |
|---|---|---|---|---|
| **A — data** | GATE 1 fail (numbers wrong) | Ingest (re-pull + re-transform) | 3 attempts | Stop + alert; nothing rendered |
| **B — render** | GATE 2 fail (doc ≠ JSON) | Render (rebuild doc) | 5 attempts | Trigger Loop C |
| **C — failsafe** | Loop B exhausted (5× GATE 2 fail) | Ingest — full pipeline restart | 2 restarts (3 passes total) | Stop + alert; client sent nothing |

**Worst case is bounded:** 3 passes × (3 ingest + 5 render attempts) = at most 9 ingests and 15 renders,
plus a **global wall-clock timeout** (default 20 min) as an ultimate backstop that stops the run and
alerts regardless of where it is. There is no path that loops forever.

**Why each loop returns where it does.** GATE 1 failures are usually a bad *read* from Xero, so a fresh
pull can genuinely fix them — hence back to Ingest. GATE 2 failures happen when the numbers are already
verified, so the fault lies in rendering — hence back to Render only. If rendering keeps failing anyway,
the verified JSON itself becomes suspect, which is what Loop C's full restart tests.

**Deterministic-failure detection.** Re-running identical code on identical input produces an identical
failure, so each retry rung must change something (the escalation ladders in Phases 3 and 5). If inputs
hash the same as a prior attempt and the same check fails, the loop advances to the next rung instead of
wasting the attempt.

**Idempotency & safety.** Each attempt writes to its own output directory; nothing is emailed or saved to
the drive until both gates are green, so no partial or duplicate report can ever reach the client. A run
that ends in `FAILED` is silent to the client and alerts us with the full attempt history. Because the
next scheduled run is independent, a transient failure self-corrects at the next cadence anyway.

---

## Data-quality fixes (baked into `clean.js`)

Applied on every run so bad data never reaches a report:
- **Restore/derive period labels** from the date range, not a fragile text column (the workbook had lost
  Feb 2024–Jan 2025).
- **Drop stray/sentinel values & column drift** (the 53–64 counter that had crept into the 2024 growth columns).
- **Round consistently** — whole £ for money, one-decimal % for rates.
- **Flag, don't fake, missing history** — pre-2024 is annual-only; never invent monthly precision.
- **Reconcile or refuse** — enforced by GATE 1.

---

## 6. Setting it up in Routines (so the client does nothing)

The five routines are configured **by us at handover, under the client's account**, then left running.
The client's involvement after that is: *open the email.*

Each routine is a scheduled cloud agent that runs one line:

> "Run the `generate-report` skill for the **{cadence}** cadence."

The skill does ingest → clean → compute → **verify numbers** → render → **verify render** → email + save,
end to end, unattended. If either gate fails it alerts instead of sending.

### The five schedules

Times are UTC, set a few days after each period closes so transactions have settled. Adjust the day if
the client prefers (e.g. Monday morning for weekly).

| Routine | Cron | Fires | Covers |
|---|---|---|---|
| Weekly | `0 7 * * 1` | Every Monday 07:00 | previous 7 days |
| Monthly | `0 7 3 * *` | 3rd of each month | previous calendar month |
| Quarterly | `0 7 3 1,4,7,10 *` | 3rd of Jan/Apr/Jul/Oct | previous 3 months |
| Mid-yearly | `0 7 4 1,7 *` | 4th of Jan & Jul | previous 6 months |
| Yearly | `0 8 5 1 *` | 5th of January | previous full year |

(Staggering the day/hour avoids two heavy runs colliding on 1 Jan.)

### How to create them (once, at handover)

**Option A — Claude Code / scheduled cloud agents (what we'll use to build & install):**
1. Ensure the `generate-report` skill is present in the client's project and the Xero/Gmail/Drive
   connectors are authorised under their account.
2. Create one routine per row above — in Claude Code this is the **`schedule`** skill / a scheduled
   agent; give each the cron expression and the prompt *"Run the generate-report skill for the
   {cadence} cadence."*
3. Dry-run each routine once with a fixed past date to confirm an email + a drive file both land and
   `verification.json` is green.

**Option B — Claude.ai Scheduled Tasks (client-facing, Pro):**
1. In the client's Claude Pro account, open the project that holds the skill + connectors.
2. Add a **Scheduled task** for each cadence with the schedule above and the same one-line prompt.
3. Confirm the first live send, then leave it.

Either way the routines persist on Anthropic's cloud and fire whether or not anyone is logged in.

### What the client ever has to do
- **Normally:** nothing. Reports arrive by email and appear in the drive folder.
- **Once a year or so:** if Xero asks them to re-authorise, click "allow." The optional care plan covers this.

---

## 7. Trust, privacy, cost (as promised in the proposal)
- **Deterministic maths**, double-checked by two automated gates and reconciled to Xero every run;
  first report human-signed-off.
- **Data stays theirs**, never used to train models; runs under their account; access revocable.
- **Running cost:** Claude **Pro (~£15–£18/mo)** covers this workload comfortably; Max only if the
  stretch agent is later used heavily.

---

## 8. Definition of done
- [ ] Xero connected; account map confirmed.
- [ ] **GATE 1 green** — computed numbers cross-foot, recompute, reconcile to Xero to the penny, pass fixtures.
- [ ] One pack generated in the sample's exact shape.
- [ ] **GATE 2 green** — every figure in the document read-back matches the JSON; all sections + charts present.
- [ ] **Loops A/B/C implemented and tested by fault injection** — corrupt a Xero pull → Loop A recovers;
      corrupt a render → Loop B recovers; force 5 render failures → Loop C restarts; exhaust all →
      alert fires and nothing is delivered.
- [ ] Global wall-clock timeout enforced; no unbounded path.
- [ ] First report signed off (M1).
- [ ] Email + drive delivery working for a real run (M2).
- [ ] All five routines installed under the client's account and dry-run green.
- [ ] Failure/gate alerts wired; guide written; handover complete (M3).
```
