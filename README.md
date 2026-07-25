# Thread & Salt — consulting engagement

Exported from a Cowork session for continuation in **Claude Code**. Start by reading
[`CLAUDE.md`](./CLAUDE.md) — it holds the full client context, verified financials, commercials,
and the open items to tackle next.

## Layout

```
thread-and-salt/
├── CLAUDE.md                     # ← read first: full engagement context + next steps
├── README.md
├── data/
│   └── Scenario-2-Thread-Salt-Finance-History.xlsx   # source financials (synthetic)
├── requirements/
│   └── Scenario-2-Thread-Salt-Guide.md               # original brief
├── scripts/
│   ├── build_proposal.js         # generates the client proposal .docx
│   ├── build_report.js           # generates the sample management-accounts .docx
│   ├── build_casestudy.js        # generates the case-study outline .docx
│   └── make_charts.py            # regenerates the two revenue charts
└── deliverables/
    ├── Thread-and-Salt-Proposal.docx
    ├── Thread-and-Salt-Sample-Management-Accounts.docx
    ├── Thread-and-Salt-Case-Study-Outline.docx
    ├── chart_monthly.png
    └── chart_quarterly.png
```

## Prerequisites

```bash
npm install docx                                   # Node docx generator
pip install matplotlib openpyxl                    # charts + xlsx reading
# optional, for PDF previews: LibreOffice (soffice) + poppler (pdftoppm)
```

## Rebuild the deliverables

```bash
# 1. charts first (writes PNGs into deliverables/)
python scripts/make_charts.py

# 2. documents — NOTE: the .js scripts read the chart PNGs and write the .docx
#    into the *current working directory*. Run them from a dir that has the two
#    chart PNGs present (or edit the paths at the top of each script).
cd deliverables && node ../scripts/build_report.js
node ../scripts/build_proposal.js
node ../scripts/build_casestudy.js
```

Preview a .docx as images (optional):

```bash
soffice --headless --convert-to pdf deliverables/Thread-and-Salt-Proposal.docx
pdftoppm -jpeg -r 100 Thread-and-Salt-Proposal.pdf page
```

## The working solution (built)

The Core pipeline is implemented in `src/`, driven by the `tas` CLI:

```bash
node bin/tas.js doctor            # what's connected, what's pending
node bin/tas.js run monthly       # generate → verify → verify → email + file
node bin/tas.js run-due           # whatever is due today (what the daily routine calls)
node bin/tas.js run-all           # all five cadences
node bin/tas.js selftest          # 28 fault-injection checks on the safety machinery
node bin/tas.js recipients list   # who receives the reports (changeable any time)
```

Pipeline: **ingest → clean → compute → GATE 1 (verify numbers) → render → GATE 2 (verify
document) → deliver** (PDF emailed as an attachment via Microsoft Graph + archive copy to the cloud drive),
on five cadences (weekly, monthly, quarterly, mid-yearly, yearly). Delivery is unreachable
unless both gates pass; failures retry with escalation, then alert instead of sending.

- Design and retry policy: [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md)
- Turning on Xero + the Entra ID mailboxes: [`docs/GO-LIVE.md`](./docs/GO-LIVE.md)
- **Launch runbook (start here to go live): [`docs/LAUNCH.md`](./docs/LAUNCH.md)**
- **Click-by-click setup in the client's account: [`docs/SETUP-WALKTHROUGH.md`](./docs/SETUP-WALKTHROUGH.md)**
- Access request to send the client: [`docs/kickoff-access-request.md`](./docs/kickoff-access-request.md)
- Setting it up in the client's Claude account: [`docs/CLIENT-SETUP.md`](./docs/CLIENT-SETUP.md)
- The schedule: [`routines/schedules.md`](./routines/schedules.md)
- What the routines call: [`skills/generate-report/SKILL.md`](./skills/generate-report/SKILL.md)

Currently reading the client finance workbook with delivery in **dry-run** (Xero and Entra
credentials pending) — both switch on via config, no pipeline changes. Still open from
`CLAUDE.md §7`: the SKU/channel split needs order-line data that Xero does not carry.
