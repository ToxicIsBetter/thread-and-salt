# Scenario 2 — Thread & Salt
**Unlocked engagement pack · Hackathon 1 · Synthetic Signal Associate Program · Negative Zero**

## The client
Thread & Salt is a small, coastal, direct-to-consumer fashion label — minimal, made in small runs, sold online. The team is lean and there is no internal finance person. The books live in Xero; sales are tracked in a spreadsheet in Google Drive; management reporting happens whenever a founder remembers, which is rarely. They'll consider Claude for anything that improves the business, but the first pain is finance visibility.

- **Website:** threadandsalt.syntheticsignal.io (real product catalogue — e.g. Corail Linen Wrap Dress £96, Salt-Washed Cotton Tee £38, Natural Canvas Tote £42; new drops go to the mailing list first).
- **Your contacts:** Mara (creative) and Jonah (ops) — the founders.

## The ask
- **Core —** monthly, quarterly and annual management accounts generated reliably and automatically, without a human having to remember. Clean, repeatable, and readable enough to act on.
- **Stretch —** a proactive, Claude-driven way to improve sales — not just reporting. Something that spots trends, at-risk lines, restock or discount signals, and surfaces them before a founder would think to look.

## What's been built for you (tech setup)
- **Storefront —** threadandsalt.syntheticsignal.io — the live shop, useful for the stretch goal (what to promote, which lines matter).
- **Sales data —** the client shares a Google Sheet with 12+ months of orders (date, SKU, quantity, price, channel, customer type). It is deliberately a little messy — inconsistent columns and a few blanks — so cleaning is part of the job. A CSV export is available too. If you don't have the link, ask the client / Drew.
- **Xero —** the accounts live in Xero. If your team wants to work against Xero directly rather than the sheet, ask on the call — the client can connect a sandbox for you. Don't assume it's connected; request it.
- **The quality bar —** the Negative Zero management-accounts report is the style and rigour to aim for.

## Requirements — what "done" looks like
- **Core:** from the sales data, produce management accounts — a P&L-style summary with revenue by month / quarter / year, top SKUs, and channel split — in a clean, repeatable format. Nail one report end-to-end (data in → polished output) first; then make the cadence run itself so it doesn't depend on a person remembering.
- **Stretch:** a proactive agent or routine that surfaces at least one genuine, actionable sales insight from the data (e.g. a declining hero line, a restock signal, a channel opportunity) — think observe → analyse → recommend → repeat, not a single clever prompt.

## How to build it with Claude
- **Claude Cowork —** for reading the sheet/CSV and generating polished spreadsheet + document reports.
- **Scheduled tasks & routines —** for the recurring monthly / quarterly / annual cadence that runs without a human.
- **Connectors / MCP —** if you go the Xero route, connect it as a data source.
- **Structured output —** so every month's report comes out in the same shape.
- **Watch first:** the YouTube video "Build a proactive agent workflow with Claude Code" — it will reshape the stretch goal.
- **Exam alignment:** Agentic Architecture & Orchestration (27%), Prompt Engineering & Structured Output (20%), Tool Design & MCP (18%).

## Deliverables — due at the weekly check-in, Wednesday 29 July
1. **Client proposal** — how you'll solve the challenge, scope of work, and honest time & effort estimates, priced against the budget the client gave you on the call.
2. **Solution presentation** — demonstrate the working solution to the client. Show it running.
3. **Next steps** — how the client takes it further, or the next engagement you'd propose.
4. **Public case study** — Anthropic / public-facing: how Claude solved the problem. Format is your call.

## Tips
- Get the data early and design your report around real numbers, not imagined ones.
- A management report is only useful if someone acts on it — ask the founders what decisions they make monthly.

## Support
Stuck on the *how*? Ask the **Hackathon Helper** in the Lab (lab.syntheticsignal.io/hackathon) — it coaches without doing the discovery for you. For anything programme-related: Drew, Alba & Daley, or drew.perry@negativezero.com. All client data is synthetic practice material; the case study is the public deliverable, everything else stays internal.
