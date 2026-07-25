# Click-by-click: setting this up inside the client's Claude account

Literal steps. Assumes you are sitting at a browser about to log into Mara & Jonah's Claude
account, with the credentials from Phase 1 of [`LAUNCH.md`](./LAUNCH.md) in hand.

> Menu labels move around as the product changes. The *sequence* below is what matters:
> connect the repo → configure an environment (network + secrets) → create a routine on a
> schedule → run it once by hand. If a label differs slightly, look for the nearest equivalent.

---

## Part A — Before you log in (do these on your own machine)

These must be done first, or the routine will run and quietly send nothing.

**A1. Put the real addresses and IDs into the config.** The pipeline decides live-vs-dry-run
by looking at whether the addresses are still placeholders. If you skip this, it runs in
dry-run forever and no email is ever sent.

```bash
node bin/tas.js sender      reports@threadandsalt.co.uk
node bin/tas.js drive-owner reports@threadandsalt.co.uk
node bin/tas.js recipients set "Mara <mara@threadandsalt.co.uk>" "Jonah <jonah@threadandsalt.co.uk>"
```

**A2. Edit `src/config.json`** and set:
- `dataSource.provider` → `"xero"`
- `dataSource.xero.tenantId` → their Xero tenant ID
- `dataSource.xero.accountMap` → the account codes Jonah confirmed
- `entra.tenantId` and `entra.clientId` → from the Entra app registration

**A3. Prove it locally before it ever runs in the cloud.**

```bash
export TAS_XERO_CLIENT_ID="…"
export TAS_XERO_CLIENT_SECRET="…"
export TAS_GRAPH_CLIENT_SECRET="…"

node bin/tas.js doctor                     # everything green?
node bin/tas.js run monthly --no-deliver   # GATE 1 green = figures reconcile to Xero
node bin/tas.js run monthly --live         # one real email, to yourself if you prefer
```

**A4. Push the repo to a GitHub account the client owns.** Confirm `src/config.json` is
committed and that **no secrets are in it** — secrets only ever travel as environment
variables.

> **Is GitHub really necessary?** Yes — a routine is *prompt + repository + connectors*, and it
> clones that repo to run. There is no way to paste a whole Node project into a prompt.
> Practical notes:
> - Use a **private repo**. They're free and unlimited on GitHub; only invited people can see it.
> - It holds **no credentials** — only code plus business config (tenant IDs, Xero account
>   codes, the two addresses). Secrets live in the environment, never in git.
> - It should be **their** account, not ours: the proposal promises they own the solution
>   outright and depend on nobody. Hosting it under our account would quietly break that.
> - Setup is ~5 minutes and neither founder ever opens GitHub again.
> - GitHub is the documented repo source. If the client already uses **GitLab or Bitbucket**,
>   check whether it's a supported source before assuming it will work.
>
> **Whose GitHub — theirs, not ours.** Their Claude account authorises the GitHub connection,
> so a repo in our account would mean wiring our personal GitHub into their account, and their
> reporting would depend on our account surviving. Sequence at kickoff:
> 1. Jonah creates a free GitHub account and an **empty private repo** (`thread-and-salt-reports`)
> 2. He invites us as a collaborator so we can push
> 3. We push (below), then connect **their** GitHub in their Claude account
> 4. At handover he removes us as a collaborator — unless they take the care plan
>
> Fallback: create it under our account and use GitHub's *Transfer ownership* afterwards. It
> works, but the transfer must actually happen and the Claude repo connection may need
> re-pointing. Prefer having him create it.
>
> First push, from the project root:
>
> ```bash
> git init
> git add .
> git commit -m "Thread & Salt automated management accounts"
> git branch -M main
> git remote add origin https://github.com/<their-account>/thread-and-salt-reports.git
> git push -u origin main
> ```
>
> `.gitignore` already excludes `node_modules/` and `output/`. Sanity-check before pushing that
> no credentials are staged: `git grep -iE "client_secret|BEGIN .*PRIVATE KEY" $(git ls-files)`
> should return nothing.

---

## Part B — You are now logged into their Claude account

### Step 1 — Check the plan
Open **Settings → Billing** (or the account menu). Confirm **Claude Pro** is active. Routines
need a paid plan; on Free they will not run.

### Step 2 — Connect their GitHub
The routine needs to clone the repo.

1. Go to **claude.ai/code** (Claude Code on the web).
2. Find the repository picker / **Connect GitHub** and authorise the GitHub account that owns
   the repo from step A4.
3. Confirm the repo appears in the list of available repositories.

### Step 3 — Create the Cloud Environment *(the step people skip — don't)*

This is where network access and the credentials live. Look for **Environments** in the
Claude Code web settings, or the **Environment** selector shown while creating a routine.

1. Create a new environment — call it something like `thread-and-salt-reports`.
2. **Network access → Custom.** Then add these four allowed domains:

   ```
   identity.xero.com
   api.xero.com
   login.microsoftonline.com
   graph.microsoft.com
   ```

   The default *Trusted* setting blocks these, and the run dies with
   `403 … x-deny-reason: host_not_allowed`.

3. **Environment variables** — paste in `.env` format:

   ```
   TAS_XERO_CLIENT_ID=…
   TAS_XERO_CLIENT_SECRET=…
   TAS_GRAPH_CLIENT_SECRET=…
   ```

   (These are stored as plain text. The trade-off and the mitigations are in
   [`CLIENT-SETUP.md §2.2`](./CLIENT-SETUP.md) — it should already have been discussed with Jonah.)

4. **Setup script** (if the environment offers one) — so dependencies install once rather
   than on every run:

   ```bash
   npm ci --omit=dev
   ```

5. Save.

### Step 4 — Create a TEST routine first

Do not start with the real schedule. Make a throwaway routine you can trigger by hand, so
you find problems now rather than at 07:00 on the 3rd.

1. Go to **claude.ai/code/routines** → **New routine**.
2. Fill it in:
   - **Name:** `TEST — management accounts`
   - **Repository:** the repo from step 2
   - **Environment:** `thread-and-salt-reports` from step 3
   - **Schedule:** anything — you will trigger it manually and delete it after
   - **Prompt:** paste exactly this (note it names a *specific* cadence and date, so it
     always produces a report rather than deciding nothing is due today):

     ```
     Generate the Thread & Salt monthly management accounts for July 2026.

     In the cloned repository, run:
         npm ci --omit=dev
         node bin/tas.js run monthly --as-of 2026-08-03

     Then tell me exactly what the command printed: whether it ended in "DELIVERED",
     which file it produced, and whether both verification gates passed. If it failed,
     read output/<run>/verification.json and tell me which named check failed and its
     detail. Do not edit any figures and do not retry by hand.
     ```
3. Save, then press **Run now**.

**What you should see:** `GATE 1 ✓ pass`, `GATE 2 ✓ pass`, `✓ DELIVERED`, an email with a PDF
attached, and the file in the drive folder. If so, the plumbing is correct — delete this test
routine and continue.

If it fails, jump to Troubleshooting below. Fix it here, before the real schedule exists.

### Step 5 — Create the REAL routine

1. **New routine** again:
   - **Name:** `Management accounts`
   - **Repository:** same repo
   - **Environment:** same environment
   - **Schedule:** `0 7 * * 1-7` — daily at 07:00 UTC
   - **Prompt:** the production text from [`CLIENT-SETUP.md §2.3`](./CLIENT-SETUP.md), which
     runs `node bin/tas.js run-due`
2. Save.

One routine covers all five cadences. It checks the calendar each morning and, on most days,
does nothing at all: Mondays → weekly; the 3rd → monthly (plus quarterly in Jan/Apr/Jul/Oct);
4 Jan & 4 Jul → mid-yearly; 5 Jan → yearly.

> **Don't judge the real routine by pressing Run now.** On a day when nothing is due it will
> correctly print *"Nothing due …"* and stop. That is success, not failure — which is exactly
> why step 4 exists.

### Step 6 — Delete the test routine
Tidy up so only `Management accounts` remains.

### Step 7 — Confirm and hand over
- Both founders received the PDF from the step-4 run.
- The file is in the drive folder, in a dated subfolder.
- The alert address in `src/config.json` is **ours**, not theirs.
- Rotate both secrets now — you have seen them.
- Log out, and give them the one-page guide.

---

## Verifying it later (nothing to remember day to day)

In their account: **claude.ai/code/routines** → open `Management accounts` → the run history
shows each morning's run. Most say "nothing due"; the report days say `DELIVERED`.

A good quarterly habit (the optional care plan):

```bash
node bin/tas.js doctor      # connections still valid?
node bin/tas.js selftest    # 28 checks on the safety machinery
```

---

## Troubleshooting

| What you see | What it means | Fix |
|---|---|---|
| `403 … host_not_allowed` | Network access is still *Trusted* | Step 3.2 — set **Custom** + the four domains |
| `NotConnectedError: Xero is not connected yet` | Missing env vars or `tenantId` | Step 3.3, and `dataSource.xero.tenantId` in config |
| Log says `delivery: dryrun` and nothing arrives | Addresses are still placeholders, or Graph credentials missing | Step A1, and check `TAS_GRAPH_CLIENT_SECRET` is in the environment |
| `GraphNotConfiguredError` | `entra.tenantId` / `entra.clientId` unset | Step A2 |
| Graph returns `ErrorAccessDenied` on send | Admin consent not granted, or the ApplicationAccessPolicy excludes the mailbox | Redo Phase 1b in `LAUNCH.md` |
| `FAILED_NUMBERS` | GATE 1 rejected the figures — usually a wrong `accountMap` | Read `verification.json`; re-confirm codes with Jonah |
| `FAILED_RENDER` | The document didn't match the verified figures | Read `verification.json`; this is a bug for us, not a config issue |
| `SKIPPED_NO_GRAIN` on weekly | Source has no daily data | Expected until Xero is live; resolves itself |
| `Nothing due …` | Correct behaviour on a non-report day | Not a fault — test with step 4's prompt instead |
| `Cannot find module …` | Dependencies not installed | Add `npm ci --omit=dev` to the setup script or keep it in the prompt |

Whatever the failure: **the founders were sent nothing**, and `output/<run>/verification.json`
records every check and attempt. Diagnose from that file rather than re-sending by hand.
