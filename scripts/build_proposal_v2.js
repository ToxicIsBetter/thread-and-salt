const docx = require('docx');
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, LevelFormat, Header, Footer, PageNumber, TabStopType, TabStopPosition
} = docx;

// ---- palette ----
const NAVY = "1F3A4D";      // deep coastal navy
const TEAL = "2E6E7E";      // muted teal
const SAND = "F1ECE2";      // sand fill
const LIGHT = "F7F4EE";
const GREY = "5A5A5A";
const RULE = "C9BFA8";

const FONT = "Calibri";

// ---------- helpers ----------
const H1 = (t) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 320, after: 120 },
  children: [new TextRun({ text: t, bold: true, size: 30, color: NAVY, font: FONT })],
  border: { bottom: { color: RULE, size: 8, space: 6, style: BorderStyle.SINGLE } },
});
const H2 = (t) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 200, after: 80 },
  children: [new TextRun({ text: t, bold: true, size: 24, color: TEAL, font: FONT })],
});
const P = (runs, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, line: 276 },
  alignment: opts.align,
  children: (Array.isArray(runs) ? runs : [runs]).map(r =>
    typeof r === "string" ? new TextRun({ text: r, size: 21, color: "222222", font: FONT }) : r),
});
const T = (text, o = {}) => new TextRun({ text, size: o.size ?? 21, bold: o.bold, italics: o.italics, color: o.color ?? "222222", font: FONT });
const bullet = (runs, level = 0) => new Paragraph({
  numbering: { reference: "bul", level },
  spacing: { after: 60, line: 272 },
  children: (Array.isArray(runs) ? runs : [runs]).map(r => typeof r === "string" ? T(r) : r),
});
const num = (runs, ref) => new Paragraph({
  numbering: { reference: ref, level: 0 },
  spacing: { after: 60, line: 272 },
  children: (Array.isArray(runs) ? runs : [runs]).map(r => typeof r === "string" ? T(r) : r),
});

// table builder
function cell(children, { w, fill, bold, color, align, size } = {}) {
  const paras = (Array.isArray(children) ? children : [children]).map(c =>
    typeof c === "string"
      ? new Paragraph({ alignment: align, spacing: { after: 20, before: 20 },
          children: [new TextRun({ text: c, bold, size: size ?? 20, color: color ?? "222222", font: FONT })] })
      : c);
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    children: paras,
  });
}
function table(colWidths, rows) {
  return new Table({
    columnWidths: colWidths,
    width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E4DECF" },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows,
  });
}
const spacer = (h = 80) => new Paragraph({ spacing: { after: h }, children: [] });

// callout box (sand-filled, full width) — for assurance / privacy notes
function calloutBox(title, bodyRuns) {
  return new Table({
    columnWidths: [CW],
    width: { size: CW, type: WidthType.DXA },
    borders: { top:{style:BorderStyle.SINGLE,size:6,color:TEAL}, bottom:{style:BorderStyle.SINGLE,size:6,color:TEAL},
      left:{style:BorderStyle.SINGLE,size:6,color:TEAL}, right:{style:BorderStyle.SINGLE,size:6,color:TEAL},
      insideHorizontal:{style:BorderStyle.NONE}, insideVertical:{style:BorderStyle.NONE} },
    rows: [ new TableRow({ children: [ new TableCell({
      width: { size: CW, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: LIGHT },
      margins: { top: 180, bottom: 180, left: 240, right: 240 },
      children: [
        new Paragraph({ spacing: { after: 70 }, children: [ new TextRun({ text: title, bold: true, size: 20, color: TEAL, font: FONT }) ] }),
        new Paragraph({ spacing: { line: 276 }, children: (Array.isArray(bodyRuns) ? bodyRuns : [bodyRuns]).map(r => typeof r === "string" ? T(r) : r) }),
      ],
    }) ] }) ],
  });
}

const CW = 9360; // content width (Letter, 1" margins)

// ============ CONTENT ============
const doc = new Document({
  creator: "Negative Zero",
  title: "Thread & Salt — Proposal (v2, Xero)",
  styles: { default: { document: { run: { font: FONT, size: 21 } } } },
  numbering: {
    config: [
      { reference: "bul", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { run: { color: TEAL }, paragraph: { indent: { left: 380, hanging: 220 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 740, hanging: 220 } } } },
      ]},
      { reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 380, hanging: 260 } } } }]},
      { reference: "need", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 380, hanging: 260 } } } }]},
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1260, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [ new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CW }],
      spacing: { after: 0 },
      border: { bottom: { color: RULE, size: 4, space: 4, style: BorderStyle.SINGLE } },
      children: [ new TextRun({ text: "THREAD & SALT", bold: true, size: 15, color: NAVY, font: FONT }),
        new TextRun({ text: "\tEngagement Proposal · Negative Zero", size: 15, color: GREY, font: FONT }) ],
    }) ] }) },
    footers: { default: new Footer({ children: [ new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CW }],
      children: [ new TextRun({ text: "Prepared 22 July 2026 · Commercial in confidence", size: 14, color: GREY, font: FONT }),
        new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 14, color: GREY, font: FONT }) ],
    }) ] }) },
    children: [
      // ---------- COVER ----------
      new Paragraph({ spacing: { before: 700, after: 60 },
        children: [new TextRun({ text: "PROPOSAL", bold: true, size: 26, color: TEAL, font: FONT, characterSpacing: 60 })] }),
      new Paragraph({ spacing: { after: 60 },
        children: [new TextRun({ text: "Automated Management Accounts", bold: true, size: 52, color: NAVY, font: FONT })] }),
      new Paragraph({ spacing: { after: 200 },
        children: [new TextRun({ text: "straight from Xero, to your inbox", bold: true, size: 38, color: NAVY, font: FONT })] }),
      new Paragraph({ border: { bottom: { color: RULE, size: 12, space: 8, style: BorderStyle.SINGLE } }, spacing: { after: 240 }, children: [] }),
      P([T("Prepared for  ", { bold: true, color: NAVY }), T("Mara & Jonah, Founders — Thread & Salt")], { after: 60 }),
      P([T("Prepared by    ", { bold: true, color: NAVY }), T("Shyam Jagani, Negative Zero")], { after: 60 }),
      P([T("Date               ", { bold: true, color: NAVY }), T("22 July 2026")], { after: 60 }),
      P([T("Reference       ", { bold: true, color: NAVY }), T("TS-2026-07 (rev. 2) · Valid for 30 days")], { after: 240 }),
      new Table({
        columnWidths: [CW],
        width: { size: CW, type: WidthType.DXA },
        borders: { top:{style:BorderStyle.SINGLE,size:6,color:TEAL}, bottom:{style:BorderStyle.SINGLE,size:6,color:TEAL},
          left:{style:BorderStyle.SINGLE,size:6,color:TEAL}, right:{style:BorderStyle.SINGLE,size:6,color:TEAL},
          insideHorizontal:{style:BorderStyle.NONE}, insideVertical:{style:BorderStyle.NONE} },
        rows: [ new TableRow({ children: [ new TableCell({
          width: { size: CW, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: SAND },
          margins: { top: 200, bottom: 200, left: 240, right: 240 },
          children: [
            new Paragraph({ spacing: { after: 80 }, children: [ new TextRun({ text: "In one line", bold: true, size: 20, color: TEAL, font: FONT }) ] }),
            new Paragraph({ children: [ new TextRun({ text: "Management accounts that write themselves — pulled straight from your Xero account, generated automatically each month, quarter and year, and delivered to your inbox and your shared drive, plus an agent that watches the numbers and flags what needs your attention. Neither of you has to remember, log in, or press a button.", size: 22, color: NAVY, font: FONT }) ] }),
          ],
        }) ] }) ],
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ---------- 1. EXEC SUMMARY ----------
      H1("1.  Executive summary"),
      P("Thread & Salt is a healthy, growing business — but the numbers that would tell you that are locked away. The books live in Xero, sales sit in a spreadsheet, and management reporting only happens when one of you remembers, which by your own account is rarely. The result is a profitable company run largely on instinct, with no regular, readable view of how it is actually doing."),
      P([T("This proposal fixes that in two moves. "), T("First (the core): ", { bold: true, color: NAVY }), T("we connect directly to your Xero account, build one polished management-accounts report from your real figures, get your sign-off, then set it to run itself — monthly, quarterly and annually — with the finished report emailed to you and filed in your shared drive automatically. "), T("Second (the stretch): ", { bold: true, color: NAVY }), T("we add a proactive agent that reads each new period, spots trends and at-risk lines, and tells you when to restock, discount or promote — before you would have thought to look.")]),
      P([T("The whole engagement runs for three weeks, with a working report in your hands inside the first week. Total investment is "), T("£4,400 fixed", { bold: true, color: NAVY }), T(", with a core-only option at "), T("£3,200", { bold: true, color: NAVY }), T(" — both inside the budget you set. Ongoing running costs after handover are modest and set out in Section 7. Everything is built to be, in your words, dead simple to use: the report arrives on its own; you open it, you don't operate software.")]),

      // ---------- 2. UNDERSTANDING ----------
      H1("2.  What we heard from you"),
      P("From our call, the picture is clear and we want to reflect it back so you know we have it right:"),
      bullet([T("The pain that keeps you up. ", { bold: true }), T("You want reliable monthly, quarterly and annual management accounts — generated without either of you having to remember to produce them. That is the first thing to solve.")]),
      bullet([T("Xero holds the truth, but nobody looks. ", { bold: true }), T("Your real financials already live in Xero; today they simply go unread. Rather than rebuild them from a messy spreadsheet, we will connect to Xero directly and treat it as the single source of truth — cleaner, and it reconciles by definition.")]),
      bullet([T("It has to be effortless. ", { bold: true }), T("You are a two-person shop. Realistically you will only use something if it is dead simple — so the finished thing must require essentially nothing from you month to month. The report should come to you, not the other way round.")]),
      bullet([T("You'd like it to look forward, not just back. ", { bold: true }), T("Beyond reporting, you want something that actively helps sales — spotting trends and at-risk lines and nudging you to act.")]),
      P([T("We have also had a first look at the five-year history you shared. The headline: this is a business worth reporting on properly. Revenue grew from "), T("£588,800 in 2024 to £638,802 in 2025", { bold: true }), T(", net margin has held steady around "), T("22–23%", { bold: true }), T(", and there is a clear, repeatable Q4 peak every November–December. There is also one thing worth watching right now, which is exactly the kind of signal the stretch agent is built to catch — we cover it in the sample report accompanying this proposal.")]),

      // ---------- 3. SCOPE ----------
      H1("3.  Scope of work — what we will deliver"),
      H2("Core — Management accounts on autopilot"),
      P("This is the priority and it is fully within budget on its own."),
      num([T("Connect to Xero, once. ", { bold: true }), T("We securely connect to your Xero account (using a connector built for exactly this) and map your chart of accounts to the report lines — revenue, cost of goods, operating costs. Xero becomes the single source of truth, so every figure reconciles to your books by definition and there is no spreadsheet to keep tidy.")], "steps"),
      num([T("Nail one report, end to end. ", { bold: true }), T("We build one management-accounts report from your real numbers — a P&L-style summary with revenue by month, quarter and year, gross and net margin, an operating-cost breakdown, and a simple online-vs-store channel split where Xero records it — in a clean, readable format you sign off on. (A worked sample sits alongside this proposal.)")], "steps"),
      num([T("Make the cadence run itself. ", { bold: true }), T("We set up three scheduled routines that regenerate the report on their own: a monthly pack, a quarterly pack, and an annual pack — each in the same shape every time. No one has to remember, and no one has to press a button.")], "steps"),
      num([T("Deliver it to you, automatically. ", { bold: true }), T("Each finished report is emailed to you as an attachment and saved into your shared drive (Google Drive, Dropbox or OneDrive — your choice) in a tidy, dated folder. You get a phone-readable document and a permanent archive, with zero steps on your side. A one-page plain-English guide and a short walkthrough round it off.")], "steps"),
      spacer(40),
      H2("Stretch — A proactive sales-insight agent"),
      P("Optional add-on. This is the observe → analyse → recommend → repeat loop, not a one-off clever prompt."),
      bullet([T("Watches every new period of data automatically as each routine runs.")]),
      bullet([T("Surfaces genuine, actionable signals: a hero line that is quietly declining, a channel pulling ahead, an unusual dip worth a second look.")]),
      bullet([T("Delivers a short, prioritised note in plain English — “here is what changed and here is what we'd do about it” — attached to the report and in the same email.")]),
      bullet([T("Improves over time as more periods accumulate, without extra work from you.")]),

      // ---------- 4. OUT OF SCOPE ----------
      H1("4.  Assumptions & what's out of scope"),
      P("To keep the fixed price honest and the timeline firm, this engagement assumes:"),
      bullet([T("Xero access is provided at kickoff ", { bold: true }), T("— you connect your account (or a sandbox) so we can read the financial data. We also need read/send access to the email account the reports should come from, and to the shared drive they should be saved into.")]),
      bullet([T("Figures are shown ex-VAT ", { bold: true }), T("as management information. VAT is stripped out so the numbers reflect true trading performance. Preparing or filing VAT returns is your accountant's job and is out of scope; we can add a VAT summary view later if useful.")]),
      bullet([T("In-store / POS sales are included only as they reach Xero. ", { bold: true }), T("Whatever your till and storefront post into Xero is captured in the totals. Xero does not hold product-level (SKU) detail, so a per-product breakdown is not part of v1 — see Section 9 for how we add it later.")]),
      bullet([T("Reports are management information, not audited or statutory accounts, ", { bold: true }), T("and we do not act as your accountant, do bookkeeping, or file anything with HMRC.")]),
      bullet([T("Out of scope for v1, quotable separately: ", { bold: true }), T("SKU-level profitability, a live web dashboard, forecasting/budgeting models, and inventory-system integration.")]),

      // ---------- 5. APPROACH ----------
      H1("5.  How we build it (in plain English)"),
      P("You do not need to understand the plumbing, but here is the shape of it so there are no surprises. We use Claude — the same AI assistant — as the engine, wired up in four ways:"),
      bullet([T("A secure connector to Xero ", { bold: true }), T("that reads your financial data straight from source — no copying, no spreadsheet to maintain.")]),
      bullet([T("Report generation with a fixed structure ", { bold: true }), T("so every month, quarter and year comes out identically shaped and directly comparable, as a polished document.")]),
      bullet([T("Scheduled routines ", { bold: true }), T("that trigger the monthly, quarterly and annual runs automatically, on their own, with nobody in the loop.")]),
      bullet([T("Delivery connectors ", { bold: true }), T("that email the finished report to you and save a copy to your shared drive, the moment it is generated.")]),
      spacer(60),
      calloutBox("Trusting the numbers — and keeping them yours", [
        T("Every figure is calculated deterministically from your Xero data and reconciles back to your books — the AI formats and explains the report, it does not invent the maths. The very first report is checked by us and signed off by you before anything runs on its own. "),
        T("Your data stays yours: ", { bold: true }),
        T("it is used only to produce your reports, is never used to train any AI model, and the whole setup is GDPR-friendly. Access can be revoked by you at any time."),
      ]),

      // ---------- 6. TIMELINE ----------
      H1("6.  Timeline, milestones & completion date"),
      P([T("A three-week engagement. Assuming sign-off by "), T("Friday 25 July 2026", { bold: true }), T(" and kickoff "), T("Monday 28 July 2026", { bold: true }), T(":")]),
      table([1520, 3040, 3560, 1240], [
        new TableRow({ tableHeader: true, children: [
          cell("Week", { w: 1520, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("Dates", { w: 3040, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("Focus", { w: 3560, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("Milestone", { w: 1240, fill: NAVY, bold: true, color: "FFFFFF" }),
        ]}),
        new TableRow({ children: [
          cell("Week 1", { w: 1520, fill: LIGHT, bold: true }),
          cell("Mon 28 Jul – Fri 1 Aug", { w: 3040, fill: LIGHT }),
          cell("Discovery, connect Xero, map accounts, build one report end-to-end", { w: 3560, fill: LIGHT }),
          cell("M1 — First report signed off", { w: 1240, fill: LIGHT, bold: true, color: TEAL }),
        ]}),
        new TableRow({ children: [
          cell("Week 2", { w: 1520, bold: true }),
          cell("Mon 4 Aug – Fri 8 Aug", { w: 3040 }),
          cell("Set up the monthly / quarterly / annual routines; wire up email + drive delivery; founder training & guide", { w: 3560 }),
          cell("M2 — Automated cadence live", { w: 1240, bold: true, color: TEAL }),
        ]}),
        new TableRow({ children: [
          cell("Week 3", { w: 1520, fill: LIGHT, bold: true }),
          cell("Mon 11 Aug – Fri 15 Aug", { w: 3040, fill: LIGHT }),
          cell("Build the proactive insight agent (stretch); full handover", { w: 3560, fill: LIGHT }),
          cell("M3 — Handover & go-live", { w: 1240, fill: LIGHT, bold: true, color: TEAL }),
        ]}),
        new TableRow({ children: [
          cell("Support", { w: 1520, bold: true }),
          cell("Mon 18 Aug – Fri 29 Aug", { w: 3040 }),
          cell("Two-week defects-only support window; then engagement formally closes", { w: 3560 }),
          cell("Cut-off — 29 Aug 2026", { w: 1240, bold: true, color: NAVY }),
        ]}),
      ]),
      spacer(60),
      P([T("Hard cut-off. ", { bold: true, color: NAVY }), T("Delivery and handover complete "), T("Friday 15 August 2026", { bold: true }), T(". A two-week window for fixing any defects runs to "), T("Friday 29 August 2026", { bold: true }), T(". Beyond that, the optional Care Plan in Section 7 keeps things running; otherwise the engagement is formally closed and any new work is separately quoted. This keeps scope tight and the fixed price fair to both sides.")]),

      // ---------- 7. INVESTMENT ----------
      H1("7.  Investment"),
      P([T("Fixed fee, agreed upfront — no hourly billing, no surprises. Priced against the budget you gave us ("), T("£2,000–£5,000", { bold: true }), T("):")]),
      table([4360, 2560, 2440], [
        new TableRow({ tableHeader: true, children: [
          cell("Package", { w: 4360, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("What you get", { w: 2560, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("Fixed fee", { w: 2440, fill: NAVY, bold: true, color: "FFFFFF", align: AlignmentType.RIGHT }),
        ]}),
        new TableRow({ children: [
          cell([new Paragraph({ children:[new TextRun({text:"Core — Management accounts on autopilot",bold:true,size:20,font:FONT,color:NAVY})]}),
                new Paragraph({ spacing:{before:30}, children:[new TextRun({text:"Xero connection, one signed-off report, automated monthly/quarterly/annual routines, email + drive delivery, guide & training.",size:18,font:FONT,color:GREY})]})], { w: 4360, fill: LIGHT }),
          cell("Everything in Section 3, Core", { w: 2560, fill: LIGHT, size: 18 }),
          cell("£3,200", { w: 2440, fill: LIGHT, bold: true, align: AlignmentType.RIGHT, color: NAVY }),
        ]}),
        new TableRow({ children: [
          cell([new Paragraph({ children:[new TextRun({text:"Stretch — Proactive insight agent",bold:true,size:20,font:FONT,color:NAVY})]}),
                new Paragraph({ spacing:{before:30}, children:[new TextRun({text:"Optional add-on to the Core package.",size:18,font:FONT,color:GREY})]})], { w: 4360 }),
          cell("The observe→recommend loop", { w: 2560, size: 18 }),
          cell("£1,200", { w: 2440, bold: true, align: AlignmentType.RIGHT, color: NAVY }),
        ]}),
        new TableRow({ children: [
          cell("Recommended — Core + Stretch", { w: 4360, fill: SAND, bold: true, color: NAVY }),
          cell("Full solution", { w: 2560, fill: SAND, size: 18 }),
          cell("£4,400", { w: 2440, fill: SAND, bold: true, align: AlignmentType.RIGHT, color: NAVY, size: 24 }),
        ]}),
      ]),
      spacer(60),
      P([T("Running costs after handover. ", { bold: true, color: NAVY }), T("The automation runs on a Claude subscription — roughly "), T("£17–£90 a month", { bold: true }), T(" depending on the plan (the entry plan comfortably covers this workload), plus your existing Xero and cloud-drive subscriptions, which you already pay. That is the whole ongoing bill; you own the account and can cancel any time. We set it up in your name at kickoff so there is nothing to transfer later.")]),
      P([T("Optional Care Plan. ", { bold: true, color: NAVY }), T("If you'd like peace of mind after the support window closes, we offer a light care plan at "), T("£75 per quarter", { bold: true }), T(": a quarterly health-check that the routines are firing and reports are landing, a fix for anything that breaks, and small tweaks to the report as your business changes. Entirely optional — the solution runs without it — and cancellable any time.")]),
      P([T("Payment. ", { bold: true, color: NAVY }), T("50% on sign-off to begin, 50% on handover (15 August). For a two-person shop we're happy to keep it that simple.")]),
      P([T("Our time. ", { bold: true, color: NAVY }), T("This is roughly six focused working days of our effort across the three weeks, quoted as a fixed fee rather than by the hour so you carry no risk if something takes us longer than planned — that's on us, not you.")]),
      P([T("Start with Core if you prefer. ", { bold: true, color: NAVY }), T("The Core package stands entirely on its own and solves the thing that keeps you up at night. The stretch agent can be added now or once you've lived with the reports for a month.")]),

      // ---------- 8. WHAT WE NEED ----------
      H1("8.  What we need from you"),
      P("Deliberately minimal — this is the whole list:"),
      num([T("A short connection step for the three accounts we read and write: Xero (or a sandbox), the email address the reports should send from, and the shared drive they should save into. We walk you through each on the kickoff call; it takes minutes and you can revoke access whenever you like.")], "need"),
      num([T("About 45 minutes on a kickoff call, and a further 30 minutes to review and sign off the first report at Milestone 1.")], "need"),
      num([T("One founder as our point of contact for quick questions during the three weeks. Jonah, we assume that's you.")], "need"),

      // ---------- 9. NEXT ----------
      H1("9.  After handover — where this can go"),
      P("Once the reporting runs itself, natural next steps (each separately quoted, none required) include:"),
      bullet([T("SKU-level profitability ", { bold: true }), T("by connecting your storefront and till data alongside Xero — margin and best-sellers by product line, not just revenue. This is the natural v2 and the biggest single upgrade.")]),
      bullet([T("A simple 12-month cash-flow and sales forecast built on the same clean data.")]),
      bullet([T("A light live dashboard for when you want to glance rather than read.")]),
      bullet([T("Extending the insight agent to trigger actions — e.g. drafting the restock email or a mailing-list drop when a signal fires.")]),

      // ---------- 10. SIGN-OFF ----------
      H1("10.  Acceptance"),
      P("To proceed, reply to confirm the package and we'll send a one-page agreement and the kickoff invite. Sign-off by 25 July keeps us on the timeline above."),
      spacer(120),
      table([3000, 6360], [
        new TableRow({ children: [
          cell("Selected package", { w: 3000, bold: true, color: NAVY }),
          cell("□  Core (£3,200)      □  Core + Stretch (£4,400)      □  add Care Plan (£75/qtr)", { w: 6360, size: 20 }),
        ]}),
      ]),
      spacer(160),
      table([4680, 4680], [
        new TableRow({ children: [
          cell([new Paragraph({spacing:{after:260},children:[]}), new Paragraph({ border:{top:{style:BorderStyle.SINGLE,size:4,color:"888888"}}, children:[new TextRun({text:"Signed, for Thread & Salt",size:18,color:GREY,font:FONT})]})], { w: 4680 }),
          cell([new Paragraph({spacing:{after:260},children:[]}), new Paragraph({ border:{top:{style:BorderStyle.SINGLE,size:4,color:"888888"}}, children:[new TextRun({text:"Date",size:18,color:GREY,font:FONT})]})], { w: 4680 }),
        ]}),
      ]),
      spacer(200),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
        children: [ new TextRun({ text: "Shyam Jagani  ·  Negative Zero  ·  shyam.jagani@negativezero.com", size: 16, color: GREY, font: FONT }) ] }),
    ],
  }],
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync("Thread-and-Salt-Proposal-v2.docx", b);
  console.log("wrote Thread-and-Salt-Proposal-v2.docx", b.length, "bytes");
});
