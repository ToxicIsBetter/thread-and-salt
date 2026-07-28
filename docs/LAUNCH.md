# Launch runbook — from here to live

The pipeline is built and verified. What remains is plumbing it into the client's own
accounts. This is the ordered sequence, with who does what and roughly how long.

| Phase | What happens | Owner | Time | Blocking? |
|---|---|---|---|---|
| **0** | Collect the access details | Jonah (we ask) | ~10 min of his time | ⛔ **blocks everything** |
| **1** | Create the Xero connection + Entra app | Jonah, guided by us on the call | 30–45 min | ⛔ blocks 2 |
| **2** | Configure and prove it against real data | us | ~30 min | ⛔ blocks 3 |
| **3** | Hand over the repo + install the routine | us, in their account | ~20 min | — |
| **4** | Sign-off, rotate, hand over | both | ~30 min | — |

Nothing here needs new code. Everything below is configuration.

---

## Phase 0 — What we need from Jonah

Send the access request (`docs/kickoff-access-request.md`) and collect these. Nothing can
start until the first two rows exist.

| # | What | Where it goes | Notes |
|---|---|---|---|
| 1 | Xero **tenant ID**, Custom Connection **client ID** + **secret** | `dataSource.xero.tenantId`, env vars | read-only scopes (Phase 1) |
| 2 | Entra **tenant ID**, app **client ID** + **secret** | `entra.*`, env var | app-only, admin-consented |
| 3 | The mailbox reports send **from** | `tas sender …` | a dedicated `reports@` is best |
| 4 | The **two recipient addresses** (Mara, Jonah) | `tas recipients set …` | changeable any time after |
| 5 | Which **drive** holds the archive | `tas drive-owner …` | OneDrive/SharePoint |
| 6 | **Chart-of-accounts codes** | `dataSource.xero.accountMap` | the one thing needing his eyes |
| 7 | A **git remote they own** + their **Claude Pro** account | Phase 3 | ownership transfers here |

Item 6 matters: we map his Xero account codes onto the seven report lines (revenue, COGS,
marketing, fulfilment, fees, founders' comp, software). Get this wrong and the numbers are
wrong — GATE 1 will catch it, but confirming it once with him up front saves a cycle.

---

## Phase 1 — Create the two connections *(with Jonah, on a call)*

### 1a. Xero — a read-only Custom Connection
1. Xero Developer portal → **New app → Custom Connection**.
2. Scopes, read-only only:
   `accounting.reports.read`, `accounting.transactions.read`, `accounting.settings.read`.
3. Authorise it against the live organisation (or the sandbox first).
4. Copy the **client ID** and **client secret**, and note the **tenant ID**.

Read-only is deliberate: a leaked credential could read the accounts but could never alter
the books, move money, or touch bank feeds.

### 1b. Entra ID — an app that can send and file
1. Entra admin centre → **App registrations → New registration** (single tenant).
2. **Certificates & secrets → New client secret** — copy it once, it is not shown again.
3. **API permissions → Microsoft Graph → Application permissions**, then **Grant admin consent**:
   - `Mail.Send`
   - `Files.ReadWrite.All` (or `Sites.Selected` scoped to one site — tighter, preferred)
4. Restrict `Mail.Send` with an **ApplicationAccessPolicy** to just the reports mailbox, so
   the app cannot send as anyone else in the tenant.
5. Use a **dedicated `reports@` mailbox**, not a founder's personal one.

### 1c. Their Claude account
- **Claude Pro** (~£20/month) in their name.
- **MFA on, unique password, login not shared.** This is the highest-value control in the
  whole setup — see [`CLIENT-SETUP.md §2.2`](./CLIENT-SETUP.md).

---

## Phase 2 — Configure and prove it *(us)*

```bash
# credentials in the environment, never in the repo
export TAS_XERO_CLIENT_ID="…"
export TAS_XERO_CLIENT_SECRET="…"
export TAS_GRAPH_CLIENT_SECRET="…"
```

In `src/config.json`: set `dataSource.xero.tenantId`, `entra.tenantId`, `entra.clientId`,
confirm `dataSource.xero.accountMap`, then switch the source over:

```json
"dataSource": { "provider": "xero" }
```

Addresses via the CLI (validated on write):

```bash
node bin/tas.js sender      reports@threadandsalt.co.uk
node bin/tas.js drive-owner reports@threadandsalt.co.uk
node bin/tas.js recipients set "Mara <mara@threadandsalt.co.uk>" "Jonah <jonah@threadandsalt.co.uk>"
node bin/tas.js doctor       # everything should now read green
```

Then prove it in three escalating steps — **do not skip the middle one**:

```bash
node bin/tas.js run monthly --no-deliver   # 1. GATE 1 green = figures reconcile to Xero
node bin/tas.js run monthly --dryrun       # 2. inspect output/<run>/outbox before anyone sees it
node bin/tas.js run monthly --live         # 3. the first real email
```

Step 1 is the important one: GATE 1 passing against live Xero data is the evidence that our
computed P&L equals Xero's own, to the penny. If the `accountMap` is wrong, it fails here —
before anything is sent.

**Milestone M1:** we review that first pack, then Jonah signs it off.

---

## Phase 3 — Hand over the repo and install the routine *(in their account)*

1. **Push the repo to a git remote they own.** Ownership transfers here.
2. **Connect that repo to their Claude account** so routines can clone it.
3. **Create one routine** (not five):

   | Setting | Value |
   |---|---|
   | Schedule | `0 7 * * 1-7` (daily, 07:00 UTC) |
   | Prompt | the text in [`CLIENT-SETUP.md §2.3`](./CLIENT-SETUP.md) |
   | Cloud Environment | **Custom** network access + the three env vars |

4. **Cloud Environment — both settings are mandatory:**
   - **Network access → Custom**, allowlisting `identity.xero.com`, `api.xero.com`,
     `login.microsoftonline.com`, `graph.microsoft.com`. The default *Trusted* environment
     blocks these and the run fails with `403 host_not_allowed`.
   - **Environment variables**: the three credentials. Note they are stored in **plain text**
     — the trade-off and mitigations are in [`CLIENT-SETUP.md §2.2`](./CLIENT-SETUP.md).
5. **Run now**, and confirm all three: the PDF arrives at both addresses, the file appears in
   the drive folder, and the log ends `✓ DELIVERED`.

The routine handles every cadence — it asks the calendar what's due (`run-due`) and does
nothing on most days.

---

## Phase 4 — Sign-off and handover

- [ ] First pack reviewed by us and signed off by Jonah (**M1**)
- [ ] Routine installed and proved with **Run now** (**M2**)
- [ ] `node bin/tas.js selftest` green — 36 checks (**M3**)
- [ ] `node bin/tas.js doctor` all green
- [ ] **Both secrets rotated** — we will have seen them during setup
- [ ] Alert address is one **we** monitor, not theirs
- [ ] One-page plain-English guide handed to the founders
- [ ] Weekly cadence confirmed working (it starts by itself once Xero is live)

---

## What happens when something breaks

Worth walking Jonah through once, so the failure behaviour is not a surprise:

- A failed check means **the founders receive nothing** — no half-right report is ever sent.
  The run retries (3 ingest attempts, 5 render attempts, 2 full restarts) and then writes
  `ALERT.txt` and emails **us**.
- Every run leaves `output/<run>/verification.json`: every check, every attempt, the receipts.
- The next scheduled run is independent, so a transient failure self-corrects next cadence.
- Roughly once a year Xero or Microsoft may ask them to re-authorise — they click *allow*.
  `doctor` reports it, and the optional care plan covers doing it for them.

## Pausing or stopping

- **Pause:** disable the routine in their Claude account. Nothing else changes.
- **Stop sending, keep generating:** set `deliver.mode` to `"dryrun"` — packs are still
  produced and verified, just not emailed.
- **Revoke everything:** kill the Xero connection and the Entra secret. The reports stop
  immediately; no data is retained anywhere but their own mailbox and drive.

---

## What can happen today, without waiting

The pipeline already runs end to end against the finance workbook in dry-run, so the demo,
the sample packs, and the founder guide need none of the above:

```bash
node bin/tas.js run-all --as-of 2026-08-03   # four real packs, both gates green
node bin/tas.js selftest                     # the safety machinery, fault-injected
```
