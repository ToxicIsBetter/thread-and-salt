# The five routines — set up once, then never touched

These are the scheduled runs that make the reporting automatic. They are installed
**under the client's own account** at handover, so nothing depends on us afterwards.
After setup, the founders' entire involvement is: *open the email.*

Each routine clones this repo and runs one command:

```
node bin/tas.js run <cadence>
```

> **Correction worth knowing:** Claude **Routines cannot load Claude Code Skills** — skills are
> repo-tied and don't load in a routine. So the instruction lives in the routine's own *prompt*
> (the full prompt text is in [`../docs/CLIENT-SETUP.md`](../docs/CLIENT-SETUP.md) §2.3), not as a
> skill invocation. `skills/generate-report/SKILL.md` remains useful for interactive Claude Code
> sessions.

## Schedules

Times are UTC and deliberately fall a few days after each period closes, so
transactions have settled in Xero before the figures are pulled.

| Routine | Cron | Fires | Window reported |
|---|---|---|---|
| Weekly | `0 7 * * 1` | Every Monday, 07:00 | the previous 7 days |
| Monthly | `0 7 3 * *` | 3rd of each month, 07:00 | the previous calendar month |
| Quarterly | `0 7 3 1,4,7,10 *` | 3rd of Jan / Apr / Jul / Oct | the previous 3 months |
| Mid-yearly | `0 7 4 1,7 *` | 4th of Jan and Jul | the previous 6 months |
| Yearly | `0 8 5 1 *` | 5th of January, 08:00 | the previous full year |

The days and hours are staggered so the January runs (yearly + mid-yearly + quarterly +
monthly all land in the same week) never collide.

> **Note on the weekly routine.** It needs daily-grain data, which only Xero provides.
> Until Xero is connected it reports `SKIPPED_NO_GRAIN` and notifies us rather than
> inventing numbers — then starts working by itself once Xero is live. Either install it
> now and expect skips, or add it at the same time as the Xero connection.

> **Note on every other cadence, until Xero is live.** The workbook ends at **July 2026**,
> so any period after it reports `SKIPPED_NO_DATA` — a clean skip, exit 0, no alert. In
> practice: the first real run (Mon 3 Aug 2026) delivers the July pack, and every monthly
> run after that skips quietly until Xero is connected. Windows that are only *partly*
> covered are different — the Q3 quarterly on 3 Oct 2026 has July but not Aug/Sep, and
> that **does** fail loudly, because a quarter's total built from one month would be
> wrong but plausible.

## Installing it — one routine

Everything lives in the client's own Claude account: one subscription, one place. Routines
execute on Anthropic-managed cloud infrastructure, so they fire with the laptops closed.

**Install a single daily routine**, not five. It asks the calendar what's due and runs only
that — nothing at all on most days:

| Setting | Value |
|---|---|
| Schedule | `0 7 * * 1-7` (daily, 07:00 UTC) |
| Command | `node bin/tas.js run-due` |
| Prompt | see [`../docs/CLIENT-SETUP.md`](../docs/CLIENT-SETUP.md) §2.3 |
| Cloud Environment | **Custom** network access + the three env vars — [CLIENT-SETUP §2.2](../docs/CLIENT-SETUP.md) |

`run-due` maps exactly onto the cron table above: Mondays → weekly; the 3rd → monthly
(plus quarterly in Jan/Apr/Jul/Oct); the 4th of Jan & Jul → mid-yearly; 5 Jan → yearly.

**Why one and not five:** one thing to install and monitor, no January pile-up, and at most
one routine run per day — well inside Pro's daily cap, leaving room for manual runs and the
optional insight agent. Five separate routines also work (at most 3 ever coincide, on
Monday 3 January 2028), but the extra moving parts buy nothing.

Two settings are not optional, or the run fails:
- **Custom network access**, allowlisting `identity.xero.com`, `api.xero.com`,
  `login.microsoftonline.com`, `graph.microsoft.com` — the default *Trusted* environment
  blocks arbitrary hosts.
- **Three environment variables** for the Xero and Graph credentials. Note there is no
  encrypted secrets store today: they are stored in plain text. Read the trade-off and the
  least-privilege mitigations in [CLIENT-SETUP §2.2](../docs/CLIENT-SETUP.md) before entering them.

Prove it with **Run now** before trusting it, ideally on a date when something is due:

```bash
node bin/tas.js run-due --as-of 2026-08-03
```

Confirm an email with the attachment at both addresses, the file in the drive folder, and
`✓ DELIVERED` in the log.

## Verifying they are healthy

Every run writes `output/<run>/verification.json` — every check, every attempt, the
delivery receipts. A run that fails a gate sends the client **nothing** and writes
`ALERT.txt` (and emails the maintainer when Graph is configured).

A run that *skips* — no daily grain, or no data for the period yet — writes `NOTICE.txt`
instead and exits 0. The distinction is deliberate: `ALERT.txt` means go and look,
`NOTICE.txt` means this was expected. Until Xero is connected the monthly cadence skips
every month after July 2026, and that must not read as a monthly fault.

A good quarterly habit — the optional care plan:

```bash
node bin/tas.js doctor            # connections still valid?
node bin/tas.js selftest          # all safety machinery still working?
```

## What the client ever has to do

- **Normally:** nothing at all.
- **Roughly once a year:** if Xero or Microsoft asks them to re-authorise the
  connection, click *allow*. `doctor` reports it, and the care plan covers doing it for them.
