# Go-live checklist — switching on Xero and the two Entra ID mailboxes

The pipeline is built and working end to end today against the client's finance
workbook, in dry-run delivery. This is the short list of what turns it live.
Run `node bin/tas.js doctor` at any point to see exactly what is still outstanding.

---

## 1. Connect Xero (when access is granted)

> **A Xero MCP connector on the routine will NOT be used.** Connectors are tools for *Claude*;
> the pipeline is a Node process that authenticates to `api.xero.com` itself with OAuth client
> credentials. It cannot see Claude's tools, and nothing in the code looks for them. Xero is
> reached only via the three items below.
>
> This is deliberate. Routing figures through a connector would mean a language model relaying
> financial data into the pipeline, which breaks the rule the whole design rests on — no model
> ever touches a number — and would make GATE 1's "reconciles to Xero to the penny" claim
> meaningless, because the source itself would be a paraphrase.
>
> If `provider` is set to `"xero"` without credentials, the run stops with
> `Xero is not connected yet. Still needed: …` and sends nothing. There is no silent fallback.

Nothing in the pipeline changes — the Xero adapter already exists and returns the same
shape as the workbook reader.

1. Create a Xero **Custom Connection** (app-only, no user interaction) with scopes:
   `accounting.reports.read`, `accounting.transactions.read`, `accounting.settings.read`.
2. Provide the credentials as environment variables (never in the repo):
   ```bash
   export TAS_XERO_CLIENT_ID="…"
   export TAS_XERO_CLIENT_SECRET="…"
   ```
3. In `src/config.json`:
   - set `dataSource.xero.tenantId` to the Xero tenant id
   - flip `dataSource.provider` from `"fixture"` to `"xero"`
4. Confirm the **account map** matches the real chart of accounts —
   `dataSource.xero.accountMap` maps account codes onto the seven report lines
   (revenue, cogs, marketing, fulfilment, fees, founders, software). This is the one
   thing that genuinely needs a human eye; ask Jonah to confirm the codes once.
5. Verify:
   ```bash
   node bin/tas.js run monthly --no-deliver
   ```
   GATE 1 must pass, which means the computed totals reconcile to Xero's own P&L.

**What Xero unlocks:** the **weekly** cadence (it needs daily grain, which the workbook
does not have) starts working automatically — no code change.

---

## 2. Connect the two Microsoft Entra ID mailboxes

Delivery uses Microsoft Graph with app-only auth, so reports send unattended from a real
Microsoft 365 mailbox with nobody logged in.

### Register the app in Entra ID

1. **Entra admin centre → App registrations → New registration** (single tenant).
2. **Certificates & secrets → New client secret.** Copy it once.
3. **API permissions → Microsoft Graph → Application permissions**, then *Grant admin consent*:
   - `Mail.Send` — send the report email
   - `Files.ReadWrite.All` — file the archive copy in OneDrive/SharePoint
4. Recommended hardening: create an **ApplicationAccessPolicy** limiting `Mail.Send` to
   just the sending mailbox, so the app cannot send as anyone else in the tenant.

### Point the pipeline at it

```bash
export TAS_GRAPH_CLIENT_SECRET="…"
```

In `src/config.json` set `entra.tenantId` and `entra.clientId`.

### Set the two addresses

Your two Entra ID emails go in as the **recipients**; the mailbox reports send *from* is
set separately (it can be one of the two, or a dedicated `reports@` mailbox):

```bash
node bin/tas.js recipients set "Mara <mara@threadandsalt.co.uk>" "Jonah <jonah@threadandsalt.co.uk>"
node bin/tas.js sender reports@threadandsalt.co.uk
node bin/tas.js drive-owner reports@threadandsalt.co.uk
```

Then confirm and do one real send:

```bash
node bin/tas.js doctor
node bin/tas.js run monthly --live
```

Delivery switches from dry-run to live **automatically** once credentials and real
(non-placeholder) addresses are present — `--live` just forces it.

---

## 3. Changing the emails later — by design, not an afterthought

Recipients and the sending mailbox are configuration, validated on write, and picked up
by the next scheduled run. No redeploy, no code edit, no downtime:

```bash
node bin/tas.js recipients list                       # who gets it now
node bin/tas.js recipients add "accountant@firm.co.uk" # e.g. loop in their accountant
node bin/tas.js recipients remove "old@address.co.uk"
node bin/tas.js recipients set "New Owner <new@x.co.uk>"   # replace the whole list
node bin/tas.js sender reports@newdomain.co.uk         # change the sending mailbox
```

Guardrails: addresses are format-checked, duplicates are rejected, and the tool refuses
to remove the last recipient (reports would go nowhere).

---

## 4. Install the routines

Once `doctor` is clean and one live send has been confirmed, install the five scheduled
routines — see [`routines/schedules.md`](../routines/schedules.md).

---

## 5. Handover verification

```bash
node bin/tas.js selftest    # 36 checks: both gates, all three retry loops, fault injection
node bin/tas.js run-all     # every cadence end to end
node bin/tas.js doctor      # all connections green
```

Then hand over: everything runs under the client's own account, and ownership transfers
outright.
