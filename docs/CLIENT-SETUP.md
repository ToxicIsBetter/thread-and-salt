# Setting it up in the client's Claude account

**One account, one subscription, one place.** Everything runs as a Claude **Routine** in
Mara & Jonah's own Claude account: the schedule, the Xero connection, and delivery to
their inbox and drive. No second service, no separate hosting bill, no extra login.

Routines execute on **Anthropic-managed cloud infrastructure**, so the reports arrive with
both laptops closed. Created at **claude.ai/code/routines** or via `/schedule` in the CLI.

---

## 1. What you install: one routine, not five

The five report cadences are driven by **a single daily routine**. It wakes up, asks the
calendar what's due, and runs only that — usually nothing at all:

```
node bin/tas.js run-due
```

| Day | What `run-due` does |
|---|---|
| Most days | nothing — exits immediately |
| Mondays | the weekly pack |
| 3rd of the month | the monthly pack (+ quarterly in Jan/Apr/Jul/Oct) |
| 4th of Jan & Jul | the mid-yearly pack |
| 5th of January | the yearly pack |

**Why one instead of five:** one thing to install and monitor, no clashing schedules in
January, and it uses at most **1 routine run per day**. Pro's daily routine-run cap is
reportedly 5 across the account, so this leaves headroom for manual runs and the optional
insight agent later. (Five separate routines also fit — the most that ever coincide is 3,
on Monday 3 January 2028 — but there is no benefit in the extra moving parts.)

**Schedule:** daily, `0 7 * * 1-7` (07:00 UTC). Minimum routine interval is 1 hour, so
daily is comfortably within limits.

---

## 2. Create the routine

### 2.1 Connect the repo
Connect the git repo holding this project to their Claude account so the routine can clone it.

### 2.2 Configure the Cloud Environment — two settings that matter

When creating the routine you pick a **Cloud Environment**. Two things must be set, or the
run will fail:

**a) Network access — required.** The default *Trusted* environment blocks arbitrary hosts
(outbound requests fail `403 host_not_allowed`). Set network access to **Custom** and
allowlist what the configured transport actually needs:

```
smtp.gmail.com        # delivery — current production transport, port 587
identity.xero.com     # Xero auth — once Xero is connected
api.xero.com          # Xero data — once Xero is connected
```

Add `login.microsoftonline.com` and `graph.microsoft.com` **only** if delivery is switched to
Microsoft Graph, which requires a mailbox inside an Entra tenant.

Verify inside the sandbox, not just locally: `node bin/tas.js preflight`. Delivery uses raw
SMTP on **port 587** — an environment that allows only HTTPS will block it, and that must be
discovered here rather than on the 3rd of the month.

**b) Environment variables — required.** One secret now, two more once Xero is connected:

```
TAS_SMTP_PASS=…            # Google App Password for the reports mailbox (needs 2FA on that account)
TAS_XERO_CLIENT_ID=…       # once Xero access is granted
TAS_XERO_CLIENT_SECRET=…   # once Xero access is granted
```

The SMTP username is not a separate variable — it defaults to `deliver.email.senderUpn`.
`TAS_GRAPH_CLIENT_SECRET` is needed only if delivery moves to Microsoft Graph.

> ### ⚠️ Read this before entering credentials
> Claude Code has **no encrypted secrets store today** — routine environment variables are
> stored as plain text and are readable by anyone who can edit that environment. The
> official docs warn against putting secrets there. For a two-person business where both
> founders own the account this is usually an acceptable, informed trade-off, but it must
> be an explicit decision, not a surprise.

#### Exactly what is stored there

Only these three values — nothing else:

| Variable | Sensitivity | What it permits if exposed |
|---|---|---|
| `TAS_SMTP_PASS` | **sensitive** | send mail **as the reports mailbox** — and, because that mailbox is also the archive, read the reports already in it. Revocable instantly, and it grants nothing else on the account. |
| `TAS_XERO_CLIENT_ID` | low — an identifier | nothing on its own |
| `TAS_XERO_CLIENT_SECRET` | **sensitive** | **read** the accounts. Cannot edit the books, move money, or touch bank feeds. |

**What is *not* stored there:** none of the financial data, none of the reports, no customer
information. Those exist only while a run is executing, and the finished pack goes to their
own mailbox and their own drive. What sits in the environment are *keys*, not the books —
though a key could of course be used to fetch the books, which is why the scoping matters.

Our code never prints, logs or writes these values: they are read from the environment at
the moment of use, and the run journal (`verification.json`) and alert files contain
figures and check results only. Secrets are never committed — the repo holds no credentials.

#### Who can actually see them

The environment config lives inside their Claude account, so in practice it is
**whoever can sign into that Claude account**:

- Mara and Jonah, as the account owners — plus us during setup.
- Anyone they later add to the account/workspace with rights to edit that environment. On a
  Team/Enterprise plan the seat/role model widens this — worth confirming against their plan
  if they ever move off Pro.
- Anyone who compromises the account: reused or weak password, no MFA, a stolen session.

It is *not* exposed to the public internet, to other Claude users, or through the git repo.
Realistically, the threat model is "someone gets into their Claude login."

#### Reducing the blast radius

- **MFA on the Claude account**, a unique password, and don't share the login. This is the
  single highest-value control, because account access *is* the exposure.
- **A dedicated reports mailbox**, never a founder's personal one — currently
  `report.tands@gmail.com`. Worst-case "send as" abuse is then limited to that address.
- **2FA on the reports mailbox itself.** It holds every pack indefinitely, so it is a store of
  the client's financial history, not just a sender.
- **Xero: read-only.** A Custom Connection limited to `accounting.reports.read`,
  `accounting.transactions.read`, `accounting.settings.read`.
- **App passwords are single-purpose** — revoke and reissue in seconds, with no effect on
  anything else the account can do.
- **Rotate both secrets at handover** (we will have seen them during setup), and whenever
  someone with account access leaves.
- **Revocation is instant** — either credential can be killed in Xero or Entra at any time,
  and the reports simply stop until it is replaced.

If the client is not comfortable with plaintext storage, say so now: the alternative is
hosting the schedule outside Claude, which breaks the one-account requirement. That is a
genuine trade-off between simplicity and secret hygiene, and it is theirs to make.

#### Why delivery is Gmail SMTP, not Microsoft Graph

This reversed during the build, so the reasoning is worth recording.

Graph was the original plan, on the assumption reports would send from a Microsoft 365
mailbox on the client's own domain. Production instead sends from **`report.tands@gmail.com`**,
a dedicated mailbox that both sends the packs and receives them — so the mailbox *is* the
archive. **Graph cannot serve that address at all:** it only sends as mailboxes inside an
Entra tenant. With a Gmail sender, SMTP is not a compromise, it is the only route.

Consequences, stated plainly:

- Reports arrive **from a gmail.com address**, not the client's domain. Fine for an internal
  archive; less ideal as the client-facing sender.
- Delivery needs **outbound SMTP on port 587**, which a restricted sandbox may block —
  hence `preflight`.
- There is **no separate drive copy** (`drive.provider: "none"`): a routine's sandbox is
  discarded after every run, so a local archive path would silently lose every pack. The
  mailbox retains them instead.

Switching to same-domain sending later means: register an Entra app with `Mail.Send`
(admin-consented, scoped by ApplicationAccessPolicy to one mailbox), set
`deliver.email.provider` to `"microsoft-graph"`, and swap the allowlist entries. No pipeline
changes — both transports are implemented and interchangeable.

### 2.3 The routine prompt

> **Note:** routines **cannot load Claude Code Skills** — skills are repo-tied and don't
> load in a routine. The instruction therefore lives in the prompt below.
> `skills/generate-report/SKILL.md` remains useful for interactive Claude Code sessions.

```
Generate any Thread & Salt management accounts that are due today.

In the cloned repository, run:
    npm ci --omit=dev
    node bin/tas.js preflight
    node bin/tas.js run-due

Then report what happened:
- "Nothing due …" — say so. That is the normal outcome on most days. Stop there.
- "✓ DELIVERED" — name the pack(s) produced and confirm the email and drive copy went out.
- "FAILED_NUMBERS" or "FAILED_RENDER" — the founders were deliberately sent nothing. Read
  output/<run>/verification.json, summarise which named check failed and its detail, and
  say that an alert was written. Do NOT edit any figures, do NOT retry by hand, and do NOT
  email the founders yourself.
- "SKIPPED_NO_GRAIN" — the weekly pack is waiting on the Xero connection. Expected until
  Xero is live; nothing to fix.
- "SKIPPED_NO_DATA" — the source holds no figures for that period yet (the workbook ends
  July 2026, so every month after it skips until Xero is live). Nothing is broken and
  nothing needs chasing: a NOTICE was filed rather than an alert. Say so and stop there.
- "FAILED_DELIVERY" — the pack was generated AND verified, but could not be sent. Quote the
  error and the preflight output: a blocked SMTP port is the usual cause. Do not re-render
  and do not try another route.

Always report the preflight result too, even when nothing was due — it is how we know this
environment can still reach the mail server.

The pipeline does its own verification and retrying. Never add your own retry loops, and
never compute, correct or estimate a financial figure yourself.
```

That last paragraph is load-bearing: the whole point of the two verification gates is that
no unverified number reaches the founders, so the routine must not "helpfully" patch a
failed run.

### 2.4 Prove it
Use **Run now** and confirm end to end:
- an email with the **PDF** attached arrives at **both** addresses
- the file appears in the drive folder
- the run log ends `✓ DELIVERED`

Test on a date when something is actually due, e.g. locally first:
```bash
node bin/tas.js run-due --as-of 2026-08-03
```

---

## 3. Prerequisites before any of this works

1. **Xero connected** — [`GO-LIVE.md §1`](./GO-LIVE.md). Read-only scopes; `accountMap`
   confirmed with Jonah once.
2. **Entra app registered** — [`GO-LIVE.md §2`](./GO-LIVE.md). `Mail.Send` +
   file-write permission, admin-consented.
3. **Both recipient addresses set:**
   ```bash
   node bin/tas.js recipients set "Mara <mara@…>" "Jonah <jonah@…>"
   node bin/tas.js sender reports@…
   ```
4. **Green locally:**
   ```bash
   node bin/tas.js doctor && node bin/tas.js selftest && node bin/tas.js run monthly --live
   ```

---

## 4. What the founders actually experience

- The pack lands in both inboxes as an attachment, and in their drive, on schedule.
- Nothing to install, open, or remember. One subscription, one account.
- If a check ever fails they receive **nothing**, and we get the alert.
- To change who receives it — one command, picked up by the next run:
  ```bash
  node bin/tas.js recipients set "Mara <mara@…>" "Jonah <jonah@…>" "accountant@firm.co.uk"
  ```
- Roughly once a year Xero or Microsoft may ask them to re-authorise: click *allow*.

---

## 5. Handover checklist

- [ ] Repo in an account they own
- [ ] Xero connected (read-only); `accountMap` confirmed; GATE 1 green on live data
- [ ] Entra app consented; `Mail.Send` scoped to the one mailbox; both recipients set
- [ ] Cloud Environment: **Custom network access** with the four hosts allowlisted
- [ ] Three env vars set; **plaintext-storage trade-off explicitly accepted**; credentials rotated
- [ ] One daily routine installed (`run-due`, `0 7 * * 1-7`)
- [ ] **Run now** proved: email with attachment + drive copy + `✓ DELIVERED`
- [ ] `selftest` green (36 checks); `doctor` all green
- [ ] Alert address is one **we** monitor, not theirs
- [ ] One-page plain-English guide handed to the founders
