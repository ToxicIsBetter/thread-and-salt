const docx = require('docx');
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, LevelFormat, Header, Footer, PageNumber, TabStopType, TabStopPosition, ImageRun
} = docx;

// ---- palette ----
const NAVY = "1F3A4D", TEAL = "2E6E7E", SAND = "F1ECE2", LIGHT = "F7F4EE", GREY = "5A5A5A", RULE = "C9BFA8", RED = "B4553F";
const FONT = "Calibri";
const CW = 9360;
const money = (n) => "£" + n.toLocaleString("en-GB");

// ---------- helpers ----------
const H1 = (t) => new Paragraph({
  heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 120 },
  children: [new TextRun({ text: t, bold: true, size: 30, color: NAVY, font: FONT })],
  border: { bottom: { color: RULE, size: 8, space: 6, style: BorderStyle.SINGLE } },
});
const H2 = (t) => new Paragraph({
  heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 },
  children: [new TextRun({ text: t, bold: true, size: 24, color: TEAL, font: FONT })],
});
const P = (runs, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, line: 276 }, alignment: opts.align,
  children: (Array.isArray(runs) ? runs : [runs]).map(r => typeof r === "string" ? new TextRun({ text: r, size: 21, color: "222222", font: FONT }) : r),
});
const T = (text, o = {}) => new TextRun({ text, size: o.size ?? 21, bold: o.bold, italics: o.italics, color: o.color ?? "222222", font: FONT });
const bullet = (runs, level = 0) => new Paragraph({
  numbering: { reference: "bul", level }, spacing: { after: 60, line: 272 },
  children: (Array.isArray(runs) ? runs : [runs]).map(r => typeof r === "string" ? T(r) : r),
});
const num = (runs, ref) => new Paragraph({
  numbering: { reference: ref, level: 0 }, spacing: { after: 60, line: 272 },
  children: (Array.isArray(runs) ? runs : [runs]).map(r => typeof r === "string" ? T(r) : r),
});
function cell(children, { w, fill, bold, color, align, size } = {}) {
  const paras = (Array.isArray(children) ? children : [children]).map(c =>
    typeof c === "string" ? new Paragraph({ alignment: align, spacing: { after: 20, before: 20 },
        children: [new TextRun({ text: c, bold, size: size ?? 20, color: color ?? "222222", font: FONT })] }) : c);
  return new TableCell({ width: { size: w, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 }, children: paras });
}
function table(colWidths, rows) {
  return new Table({ columnWidths: colWidths, width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: RULE }, bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E4DECF" }, insideVertical: { style: BorderStyle.NONE } }, rows });
}
const spacer = (h = 80) => new Paragraph({ spacing: { after: h }, children: [] });
function calloutBox(title, bodyRuns, fill = LIGHT) {
  return new Table({ columnWidths: [CW], width: { size: CW, type: WidthType.DXA },
    borders: { top:{style:BorderStyle.SINGLE,size:6,color:TEAL}, bottom:{style:BorderStyle.SINGLE,size:6,color:TEAL},
      left:{style:BorderStyle.SINGLE,size:6,color:TEAL}, right:{style:BorderStyle.SINGLE,size:6,color:TEAL},
      insideHorizontal:{style:BorderStyle.NONE}, insideVertical:{style:BorderStyle.NONE} },
    rows: [ new TableRow({ children: [ new TableCell({ width: { size: CW, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill }, margins: { top: 180, bottom: 180, left: 240, right: 240 },
      children: [ new Paragraph({ spacing: { after: 70 }, children: [ new TextRun({ text: title, bold: true, size: 20, color: TEAL, font: FONT }) ] }),
        new Paragraph({ spacing: { line: 276 }, children: (Array.isArray(bodyRuns) ? bodyRuns : [bodyRuns]).map(r => typeof r === "string" ? T(r) : r) }) ],
    }) ] }) ] });
}

// embedded chart image, scaled to a given pixel width
function chartImg(file, w) {
  const ratios = { "chart_monthly.png": 0.337, "chart_quarterly.png": 0.326 };
  const h = Math.round(w * (ratios[file] || 0.33));
  return new Paragraph({ spacing: { before: 40, after: 120 }, alignment: AlignmentType.CENTER,
    children: [ new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: w, height: h } }) ] });
}
// headline metric tiles (one row)
function tileRow(items) {
  const w = Math.floor(CW / items.length);
  return new Table({ columnWidths: items.map(() => w), width: { size: CW, type: WidthType.DXA },
    borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE},
      insideHorizontal:{style:BorderStyle.NONE}, insideVertical:{style:BorderStyle.SINGLE,size:2,color:"FFFFFF"} },
    rows: [ new TableRow({ children: items.map(it => new TableCell({
      width: { size: w, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: "auto", fill: LIGHT },
      margins: { top: 130, bottom: 130, left: 100, right: 100 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [ new TextRun({ text: it.big, bold: true, size: 34, color: it.color || NAVY, font: FONT }) ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [ new TextRun({ text: it.small, size: 15, color: GREY, font: FONT, allCaps: true, characterSpacing: 20 }) ] }),
      ] })) }) ] });
}
// red-accent insight box
function insightBox(title, bodyRuns) {
  return new Table({ columnWidths: [CW], width: { size: CW, type: WidthType.DXA },
    borders: { top:{style:BorderStyle.SINGLE,size:12,color:RED}, bottom:{style:BorderStyle.SINGLE,size:2,color:RED},
      left:{style:BorderStyle.SINGLE,size:2,color:RED}, right:{style:BorderStyle.SINGLE,size:2,color:RED},
      insideHorizontal:{style:BorderStyle.NONE}, insideVertical:{style:BorderStyle.NONE} },
    rows: [ new TableRow({ children: [ new TableCell({ width: { size: CW, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: "FBF3F0" }, margins: { top: 160, bottom: 160, left: 240, right: 240 },
      children: [ new Paragraph({ spacing: { after: 60 }, children: [ new TextRun({ text: title, bold: true, size: 20, color: RED, font: FONT }) ] }),
        new Paragraph({ spacing: { line: 276 }, children: (Array.isArray(bodyRuns) ? bodyRuns : [bodyRuns]).map(r => typeof r === "string" ? T(r) : r) }) ],
    }) ] }) ] });
}

// ---- verified P&L figures from the workbook (rounded to whole £) ----
const YEARS = ["FY2021*", "FY2022*", "FY2023*", "FY2024", "FY2025", "FY2026 YTD"];
const REVENUE = [215600, 467400, 532800, 588800, 638802, 347342];
const GROSS   = [125048, 271092, 309024, 341504, 370505, 201458];
const OPEX    = [105734, 172461, 189792, 204632, 222683, 124596];
const NET     = [19314, 98631, 119232, 136872, 147823, 76863];
const NETM    = ["9.0%", "21.1%", "22.4%", "23.2%", "23.1%", "22.1%"];
function pnlRow(label, arr, { bold, color, fill, fmt } = {}) {
  return new TableRow({ children: [
    cell(label, { w: 1860, fill, bold: true, color: color ?? NAVY, size: 17 }),
    ...arr.map(v => cell(typeof v === "string" ? v : fmt(v), { w: 1250, fill, bold, color, align: AlignmentType.RIGHT, size: 17 })),
  ]});
}

// ---- helpers that reproduce build_report.js (client report) 1:1 ----
const GREEN = "3B6E4B";
const rH1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 110 },
  children: [new TextRun({ text: t, bold: true, size: 28, color: NAVY, font: FONT })],
  border: { bottom: { color: RULE, size: 8, space: 6, style: BorderStyle.SINGLE } } });
function rKpi(label, value, sub, subColor) {
  return new TableCell({ width: { size: 2340, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: SAND }, margins: { top: 120, bottom: 120, left: 130, right: 130 },
    children: [
      new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: label, size: 15, color: GREY, font: FONT, allCaps: true, characterSpacing: 20 })] }),
      new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: value, bold: true, size: 30, color: NAVY, font: FONT })] }),
      new Paragraph({ children: [new TextRun({ text: sub, size: 16, color: subColor || TEAL, font: FONT, bold: true })] }),
    ] });
}
function rPlRow(label, v24, v25, v26, { bold, fill, color, indent } = {}) {
  const lab = (indent ? "   " : "") + label;
  return new TableRow({ children: [
    cell(lab, { w: 3360, fill, bold, color, size: 19 }),
    cell(v24, { w: 2000, fill, bold, color, align: AlignmentType.RIGHT, size: 19 }),
    cell(v25, { w: 2000, fill, bold, color, align: AlignmentType.RIGHT, size: 19 }),
    cell(v26, { w: 2000, fill, bold, color, align: AlignmentType.RIGHT, size: 19 }),
  ]});
}
const rImg = (file, w, h) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60, before: 40 },
  children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: w, height: h } })] });

// ============ CONTENT ============
const doc = new Document({
  creator: "Negative Zero",
  title: "Thread & Salt — Proposal (final, Core)",
  styles: { default: { document: { run: { font: FONT, size: 21 } } } },
  numbering: { config: [
    { reference: "bul", levels: [
      { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { run: { color: TEAL }, paragraph: { indent: { left: 380, hanging: 220 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 740, hanging: 220 } } } } ]},
    { reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 380, hanging: 260 } } } }]},
    { reference: "need", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 380, hanging: 260 } } } }]},
  ]},
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1260, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [ new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CW }], spacing: { after: 0 },
      border: { bottom: { color: RULE, size: 4, space: 4, style: BorderStyle.SINGLE } },
      children: [ new TextRun({ text: "THREAD & SALT", bold: true, size: 15, color: NAVY, font: FONT }),
        new TextRun({ text: "\tEngagement Proposal · Negative Zero", size: 15, color: GREY, font: FONT }) ] }) ] }) },
    footers: { default: new Footer({ children: [ new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CW }],
      children: [ new TextRun({ text: "Prepared 22 July 2026 · Commercial in confidence", size: 14, color: GREY, font: FONT }),
        new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 14, color: GREY, font: FONT }) ] }) ] }) },
    children: [
      // ---------- COVER ----------
      new Paragraph({ spacing: { before: 700, after: 60 }, children: [new TextRun({ text: "PROPOSAL", bold: true, size: 26, color: TEAL, font: FONT, characterSpacing: 60 })] }),
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Automated Management Accounts", bold: true, size: 52, color: NAVY, font: FONT })] }),
      new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "from Xero, to your inbox — on autopilot", bold: true, size: 36, color: NAVY, font: FONT })] }),
      new Paragraph({ border: { bottom: { color: RULE, size: 12, space: 8, style: BorderStyle.SINGLE } }, spacing: { after: 240 }, children: [] }),
      P([T("Prepared for  ", { bold: true, color: NAVY }), T("Mara & Jonah, Founders — Thread & Salt")], { after: 60 }),
      P([T("Prepared by    ", { bold: true, color: NAVY }), T("Shyam Jagani, Negative Zero")], { after: 60 }),
      P([T("Date               ", { bold: true, color: NAVY }), T("22 July 2026")], { after: 60 }),
      P([T("Reference       ", { bold: true, color: NAVY }), T("TS-2026-07 (final) · Valid for 30 days")], { after: 240 }),
      new Table({ columnWidths: [CW], width: { size: CW, type: WidthType.DXA },
        borders: { top:{style:BorderStyle.SINGLE,size:6,color:TEAL}, bottom:{style:BorderStyle.SINGLE,size:6,color:TEAL},
          left:{style:BorderStyle.SINGLE,size:6,color:TEAL}, right:{style:BorderStyle.SINGLE,size:6,color:TEAL},
          insideHorizontal:{style:BorderStyle.NONE}, insideVertical:{style:BorderStyle.NONE} },
        rows: [ new TableRow({ children: [ new TableCell({ width: { size: CW, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: SAND }, margins: { top: 200, bottom: 200, left: 240, right: 240 },
          children: [ new Paragraph({ spacing: { after: 80 }, children: [ new TextRun({ text: "In one line", bold: true, size: 20, color: TEAL, font: FONT }) ] }),
            new Paragraph({ children: [ new TextRun({ text: "Management accounts that write themselves — pulled straight from your Xero account and delivered to your inbox and your shared drive on a weekly, monthly, quarterly, half-year and annual rhythm. We build this Core now; a proactive sales-insight agent is a ready-made upgrade you can switch on whenever you like. You own it outright, and neither of you has to remember, log in, or press a button.", size: 22, color: NAVY, font: FONT }) ] }) ],
        }) ] }) ] }),
      new Paragraph({ children: [new PageBreak()] }),

      // ---------- 1. EXEC SUMMARY ----------
      H1("1.  Executive summary"),
      P("Thread & Salt is a healthy, growing business — but the numbers that would tell you that are locked away. The books live in Xero, and management reporting only happens when one of you remembers, which by your own account is rarely. The result is a profitable company run largely on instinct, with no regular, readable view of how it is actually doing."),
      P([T("This proposal solves that with the "), T("Core", { bold: true, color: NAVY }), T(": we connect directly to your Xero account, build one polished management-accounts report from your real figures, get your sign-off, then set it to run itself on a weekly, monthly, quarterly, half-year and annual rhythm — each report emailed to you and filed in your shared drive automatically. That is the whole thing you are buying today.")]),
      P([T("When you are ready to look forward as well as back, there is a single "), T("optional upgrade", { bold: true, color: NAVY }), T(" — a proactive agent that reads each new period, spots trends and at-risk lines, and tells you when to restock, discount or promote before you would have thought to look. You can switch it on now or months from now; nothing about the Core needs to change.")]),
      P([T("The build runs for around three weeks, with a working report in your hands inside the first week. After that "), T("you own and run it yourselves", { bold: true, color: NAVY }), T(" — it lives under your own Claude account, so the only ongoing cost is a modest subscription (Section 7) and there is no monthly fee to us. The Core is "), T(money(3200) + " fixed", { bold: true, color: NAVY }), T(", inside the budget you set. Everything is built to be, in your words, dead simple to use: the report arrives on its own; you open it, you don't operate software.")]),

      // ---------- 2. UNDERSTANDING ----------
      H1("2.  What we heard from you"),
      P("From our calls, the picture is clear — and we want to reflect it back so you know we have it right:"),
      bullet([T("The pain that keeps you up. ", { bold: true }), T("You want reliable management accounts — generated on a regular rhythm without either of you having to remember to produce them. That is the first thing to solve, and it is what the Core delivers.")]),
      bullet([T("Xero holds the truth, but nobody looks. ", { bold: true }), T("Your real financials already live in Xero; today they simply go unread. We connect to Xero directly and treat it as the single source of truth — cleaner, and it reconciles by definition.")]),
      bullet([T("It has to be effortless. ", { bold: true }), T("You are a two-person shop with no finance function. You will only use something if it is dead simple, so the finished thing must ask essentially nothing of you month to month. The report comes to you, not the other way round.")]),
      bullet([T("You'd rather own and run it yourselves. ", { bold: true }), T("You were clear you want to hold the reins — the whole thing sits under your own account, with no dependency on us to keep it alive. The proposal is built around exactly that.")]),
      bullet([T("Budget is real and it is tight. ", { bold: true }), T("You were candid that the number sits around £2,000–£5,000. Leading with the Core keeps the commitment at the lower end, with the upgrade there when you want it.")]),
      bullet([T("You'd like it to look forward, not just back. ", { bold: true }), T("Beyond reporting, you want something that actively helps sales. That is precisely the optional upgrade — kept separate so it never holds up the reporting you need first.")]),

      // ---------- 3. SCOPE ----------
      H1("3.  Scope of work — what we will deliver"),
      H2("Core — Management accounts on autopilot  (this engagement)"),
      P("This is the priority and the whole of what we build now. It is fully within budget on its own."),
      num([T("Connect to Xero, once. ", { bold: true }), T("We securely connect to your Xero account and map your chart of accounts to the report lines — revenue, cost of goods, operating costs. Xero becomes the single source of truth, so every figure reconciles to your books by definition. Read access is all we need.")], "steps"),
      num([T("Nail one report, end to end. ", { bold: true }), T("We build one management-accounts report from your real numbers — the full contents are set out in Section 5 — in a clean, readable format you sign off on. (A worked sample sits alongside this proposal.)")], "steps"),
      num([T("Make the cadence run itself — five rhythms. ", { bold: true }), T("Scheduled routines regenerate the report on their own, each in the same shape every time (Section 4). No one has to remember, and no one has to press a button.")], "steps"),
      num([T("Deliver it to you, automatically. ", { bold: true }), T("Each finished report is emailed to you as an attachment and saved into your shared drive (Google Drive, Dropbox or OneDrive — your choice) in a tidy, dated folder. A one-page plain-English guide and a short walkthrough round it off.")], "steps"),
      spacer(40),
      H2("Optional upgrade — A proactive sales-insight agent  (add now or later)"),
      P([T("Not part of the Core build, and not needed for the reporting to work. It is a self-contained add-on you can switch on whenever you like, for a fixed "), T(money(1200), { bold: true, color: NAVY }), T(" (Section 7). This is the observe → analyse → recommend → repeat loop, not a one-off clever prompt:")]),
      bullet([T("Watches every new period of data automatically as each routine runs.")]),
      bullet([T("Surfaces genuine, actionable signals: a hero line quietly declining, a channel pulling ahead, an unusual dip worth a second look.")]),
      bullet([T("Delivers a short, prioritised note in plain English — “here is what changed and here is what we'd do about it” — in the same email as the report.")]),

      // ---------- 4. REPORTING RHYTHM ----------
      H1("4.  Your reporting rhythm — five automatic reports"),
      P("Each report covers a different window, so you get both a close-up on the latest week and the long view across the year. Every one lands in your inbox and your drive on its own:"),
      table([1740, 3260, 4360], [
        new TableRow({ tableHeader: true, children: [
          cell("Report", { w: 1740, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("Covers", { w: 3260, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("What it's for", { w: 4360, fill: NAVY, bold: true, color: "FFFFFF" }) ]}),
        new TableRow({ children: [ cell("Weekly", { w: 1740, fill: LIGHT, bold: true, color: TEAL }),
          cell("The new data from the past week", { w: 3260, fill: LIGHT }), cell("A quick pulse — how last week traded, spotted early", { w: 4360, fill: LIGHT }) ]}),
        new TableRow({ children: [ cell("Monthly", { w: 1740, bold: true, color: TEAL }),
          cell("The new data from the past month", { w: 3260 }), cell("The core management-accounts pack — the sample's shape", { w: 4360 }) ]}),
        new TableRow({ children: [ cell("Quarterly", { w: 1740, fill: LIGHT, bold: true, color: TEAL }),
          cell("The past 3 months", { w: 3260, fill: LIGHT }), cell("Trend and seasonality view; smooths out monthly noise", { w: 4360, fill: LIGHT }) ]}),
        new TableRow({ children: [ cell("Mid-yearly", { w: 1740, bold: true, color: TEAL }),
          cell("The past 6 months", { w: 3260 }), cell("Half-year checkpoint against plan and prior year", { w: 4360 }) ]}),
        new TableRow({ children: [ cell("Yearly", { w: 1740, fill: LIGHT, bold: true, color: TEAL }),
          cell("The last full year of data", { w: 3260, fill: LIGHT }), cell("The annual picture — growth, margin, the full P&L", { w: 4360, fill: LIGHT }) ]}),
      ]),
      spacer(50),
      P([T("Same shape every time. ", { bold: true, color: NAVY }), T("Whatever the window, each report comes out in the identical, comparable structure set out below — the routines simply change which slice of your Xero data the report is built from.")]),

      // ---------- 5. WHAT'S IN EVERY REPORT ----------
      H1("5.  What's in every report"),
      P("Your reports carry everything in the five-year finance workbook you shared, rebuilt live from Xero and presented cleanly. In full, each pack contains:"),
      H2("A.  The full profit-&-loss summary"),
      P([T("A five-year annual P&L (FY2021 through the current year to date), every line reconciling to Xero. Below are your real figures — this is the shape and rigour each report hits:")]),
      table([1860, 1250, 1250, 1250, 1250, 1250, 1250], [
        new TableRow({ tableHeader: true, children: [
          cell("£", { w: 1860, fill: NAVY, bold: true, color: "FFFFFF", size: 17 }),
          ...YEARS.map(y => cell(y, { w: 1250, fill: NAVY, bold: true, color: "FFFFFF", align: AlignmentType.RIGHT, size: 16 })) ]}),
        pnlRow("Revenue", REVENUE, { fill: LIGHT, bold: true, fmt: money }),
        pnlRow("Gross profit", GROSS, { fmt: money }),
        pnlRow("Operating costs", OPEX, { fill: LIGHT, fmt: money }),
        pnlRow("Net profit", NET, { bold: true, color: TEAL, fmt: money }),
        pnlRow("Net margin", NETM, { fill: LIGHT, color: NAVY }),
      ]),
      P([T("Gross margin holds at ", { }), T("58%", { bold: true }), T(" across all five years (COGS modelled at 42% of revenue). Operating costs are itemised into five lines — "), T("marketing & advertising (14% of revenue), fulfilment & shipping (9%), platform & payment fees (3.5%)", {}), T(", plus "), T("founders' compensation", {}), T(" and "), T("software & overhead", {}), T(" as fixed monthly amounts that step up year to year. Because those fixed costs don't fall when sales do, a revenue dip squeezes net margin by more than the drop alone — a nuance the report makes visible.")], { after: 80 }),
      H2("B.  Revenue trend & units"),
      P("Monthly revenue from January 2024 to date, each month with units sold, revenue per unit, month-on-month growth and year-on-year growth — plus the clear, repeatable Q4 (Nov–Dec) seasonal peak the history shows every year."),
      H2("C.  The signals worth acting on"),
      P([T("The report calls out what the numbers are telling you. Front and centre right now: "), T("July 2026 revenue of £41,850 — down 24.4% on June and 22.0% on July last year, the first July to fall below its prior year", { bold: true, color: "B4553F" }), T(", against H1 growth that had already cooled to +2.7%. Exactly the kind of thing you'd want flagged before you noticed it yourself.")]),
      H2("D.  Transparent assumptions"),
      P("The modelling rates behind the numbers (COGS 42%, marketing 14%, fulfilment 9%, fees 3.5%, and the fixed monthly costs) are stated on the report, so every figure is traceable and nothing is a black box."),
      spacer(30),
      calloutBox("We fix the data problems, not paper over them", [
        T("Your workbook has the usual real-world rough edges, and we clean every one on the way into the report: "),
        T("missing month labels", { bold: true }), T(" (Feb 2024–Jan 2025 had lost theirs) are restored; a "),
        T("stray counter and a column mis-alignment", { bold: true }), T(" that had crept into the 2024 growth columns are removed; over-long decimals are "),
        T("rounded consistently", { bold: true }), T(" (whole pounds, one-decimal percentages); and the "),
        T("annual-only years (FY2021–2023)", { bold: true }), T(" are labelled as such rather than shown as false monthly precision. Pulling live from Xero stops most of these recurring in the first place."),
      ]),

      // ---------- 6. HOW IT RUNS ----------
      H1("6.  How it runs (in plain English)"),
      P("You do not need to understand the plumbing, but here is the shape of it. The whole thing is built on Claude and runs on Anthropic's cloud — which matters, because the reports generate on schedule even when both your laptops are closed."),
      bullet([T("Xero, connected as the source. ", { bold: true }), T("We link Xero directly so the numbers come from the truth, not a spreadsheet you don't trust.")]),
      bullet([T("Claude generates the report ", { bold: true }), T("as a polished document, in a fixed structure so every period looks identical and comparable.")]),
      bullet([T("Scheduled routines run the five rhythms ", { bold: true }), T("— weekly, monthly, quarterly, mid-yearly and annually — on Anthropic's cloud, with nobody in the loop and nothing running on your machines.")]),
      bullet([T("Delivery to you ", { bold: true }), T("emails the finished report as an attachment and drops a copy into a dated folder in your shared drive.")]),
      spacer(50),
      calloutBox("Trusting the numbers — and keeping them yours", [
        T("Every figure is calculated deterministically from your Xero data and reconciles back to your books — the AI formats and explains the report, it does not invent the maths. The very first report is checked by us and signed off by you before anything runs on its own. "),
        T("Your data stays yours: ", { bold: true }),
        T("it is used only to produce your reports, is never used to train any AI model, and the setup is GDPR-friendly. Because it all sits under your own account, access is yours to grant or revoke at any time."),
      ]),

      // ---------- 7. INVESTMENT ----------
      H1("7.  Investment"),
      P([T("Fixed build fee, agreed upfront — no hourly billing, no surprises. Priced against the "), T("£2,000–£5,000", { bold: true }), T(" budget you gave us:")]),
      table([5100, 1820, 2440], [
        new TableRow({ tableHeader: true, children: [
          cell("Package", { w: 5100, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("When", { w: 1820, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("Fixed fee", { w: 2440, fill: NAVY, bold: true, color: "FFFFFF", align: AlignmentType.RIGHT }) ]}),
        new TableRow({ children: [
          cell([new Paragraph({ children:[new TextRun({text:"Core — Management accounts on autopilot",bold:true,size:20,font:FONT,color:NAVY})]}),
                new Paragraph({ spacing:{before:30}, children:[new TextRun({text:"Xero connection, one signed-off report, the five automated routines, email + drive delivery, guide & training.",size:18,font:FONT,color:GREY})]})], { w: 5100, fill: SAND }),
          cell("Now", { w: 1820, fill: SAND, bold: true, color: TEAL }),
          cell(money(3200), { w: 2440, fill: SAND, bold: true, align: AlignmentType.RIGHT, color: NAVY, size: 24 }) ]}),
        new TableRow({ children: [
          cell([new Paragraph({ children:[new TextRun({text:"Optional upgrade — Proactive insight agent",bold:true,size:20,font:FONT,color:NAVY})]}),
                new Paragraph({ spacing:{before:30}, children:[new TextRun({text:"Self-contained add-on to the Core; the observe→recommend loop. Add whenever you like.",size:18,font:FONT,color:GREY})]})], { w: 5100 }),
          cell("Now or later", { w: 1820, color: GREY }),
          cell("+ " + money(1200), { w: 2440, bold: true, align: AlignmentType.RIGHT, color: NAVY }) ]}),
      ]),
      spacer(60),
      H2("Which Claude subscription you'll need"),
      P([T("Our recommendation: "), T("Claude Pro — about £20 a month", { bold: true, color: NAVY }), T(". Your five reports fire only a handful of times a month, and each is a short job — read Xero, generate a document, email it and file it. That sits comfortably inside Pro's limits with room to spare, and it is the plan the running-cost figures below assume.")]),
      P([T("You would only want "), T("Claude Max (roughly £90+/month)", { bold: true }), T(" if you later lean on the optional insight agent very heavily, or add the product-level analysis in Section 11. Our steer: "), T("start on Pro", { bold: true, color: NAVY }), T("; move up only if you ever hit its limits, which for this workload is unlikely. Plan details do change, so we will confirm the current options with you at kickoff.")]),
      spacer(20),
      P([T("One account, one subscription, one place. ", { bold: true, color: NAVY }), T("Everything lives in a single Claude account that you own — the schedules, the connection to Xero, and the delivery to your inbox and drive. There is no second service to sign up for, no separate hosting bill, and no extra login to remember. The schedules run on Anthropic's cloud, so the reports arrive whether or not either of your laptops is open.")]),
      P([T("Running it after handover — self-managed, as you asked. ", { bold: true, color: NAVY }), T("You own the solution outright, so the only ongoing cost is that one Pro subscription, plus the Xero and Microsoft 365 subscriptions you already pay for. "), T("There is no monthly fee to us.", { bold: true }), T(" We set everything up in your name at kickoff and hand it over fully documented.")]),
      P([T("Optional safety net. ", { bold: true, color: NAVY }), T("If you'd like backup for the day something hiccups — say the Xero link needs re-authorising — we offer a light care plan at "), T("£75 per quarter", { bold: true }), T(": a quarterly health-check that all five routines are firing, a fix for anything that breaks, and small tweaks as your business changes. Entirely optional and cancellable any time.")]),
      P([T("Payment (build). ", { bold: true, color: NAVY }), T("50% on sign-off to begin, 50% on handover. Our time is roughly six focused working days across the three weeks, quoted as a fixed fee — if something takes us longer, that's on us. "), T("All figures exclude VAT.", { bold: true })]),

      // ---------- 8. TIMELINE ----------
      H1("8.  Timeline & milestones"),
      P([T("A roughly three-week build. Assuming sign-off by "), T("Friday 25 July 2026", { bold: true }), T(" and kickoff "), T("Monday 28 July 2026", { bold: true }), T(". If sign-off slips a few days, the schedule shifts with it by the same amount — the sequence and the fixed fee do not change.")]),
      table([1520, 3040, 3560, 1240], [
        new TableRow({ tableHeader: true, children: [
          cell("Week", { w: 1520, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("Dates", { w: 3040, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("Focus", { w: 3560, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("Milestone", { w: 1240, fill: NAVY, bold: true, color: "FFFFFF" }) ]}),
        new TableRow({ children: [ cell("Week 1", { w: 1520, fill: LIGHT, bold: true }),
          cell("Mon 28 Jul – Fri 1 Aug", { w: 3040, fill: LIGHT }),
          cell("Discovery, connect Xero, map accounts, build one report end-to-end", { w: 3560, fill: LIGHT }),
          cell("M1 — first report signed off", { w: 1240, fill: LIGHT, bold: true, color: TEAL }) ]}),
        new TableRow({ children: [ cell("Week 2", { w: 1520, bold: true }),
          cell("Mon 4 Aug – Fri 8 Aug", { w: 3040 }),
          cell("Set up the five routines (weekly → yearly); wire email + drive delivery; founder training & guide", { w: 3560 }),
          cell("M2 — automated cadence live", { w: 1240, bold: true, color: TEAL }) ]}),
        new TableRow({ children: [ cell("Week 3", { w: 1520, fill: LIGHT, bold: true }),
          cell("Mon 11 Aug – Fri 15 Aug", { w: 3040, fill: LIGHT }),
          cell("Hardening, full handover & training (the insight agent is built here only if the upgrade is taken)", { w: 3560, fill: LIGHT }),
          cell("M3 — handover & go-live", { w: 1240, fill: LIGHT, bold: true, color: TEAL }) ]}),
        new TableRow({ children: [ cell("Support", { w: 1520, bold: true }),
          cell("Mon 18 Aug – Fri 29 Aug", { w: 3040 }),
          cell("Two-week defects-only window; then the engagement formally closes", { w: 3560 }),
          cell("Cut-off — 29 Aug 2026", { w: 1240, bold: true, color: NAVY }) ]}),
      ]),
      spacer(60),
      P([T("After the build. ", { bold: true, color: NAVY }), T("You own the solution outright at handover and run it yourselves. Beyond the two-week defects window, adding the insight agent later, or any other new work, is separately quoted — or take the optional quarterly care plan if you'd like a standing safety net.")]),

      // ---------- 9. ASSUMPTIONS ----------
      H1("9.  Assumptions & what's out of scope"),
      P("To keep the fixed price honest and the timeline firm, this engagement assumes:"),
      bullet([T("Access is provided at kickoff ", { bold: true }), T("— Xero (read access is sufficient), the email account the reports should send from, and the shared drive they should be saved into.")]),
      bullet([T("Figures are shown ex-VAT ", { bold: true }), T("as management information. Preparing or filing VAT returns is your accountant's job and is out of scope; we can add a VAT summary view later if useful.")]),
      bullet([T("In-store / POS sales are included only as they reach Xero. ", { bold: true }), T("Xero does not hold product-level (SKU) detail, so a per-product breakdown is not part of this build — see Section 11.")]),
      bullet([T("Reports are management information, not audited or statutory accounts, ", { bold: true }), T("and we do not act as your accountant, do bookkeeping, or file anything with HMRC.")]),
      bullet([T("Out of scope for this build (quotable separately): ", { bold: true }), T("the insight-agent upgrade, SKU-level profitability, a live web dashboard, forecasting/budgeting models, and inventory-system integration.")]),
      P([T("Ownership & data. ", { bold: true, color: NAVY }), T("The report templates and automation we build are yours and transfer to you outright at handover, running under your own account. Your business data stays private to you and is never used to train any models.")]),

      // ---------- 10. WHAT WE NEED ----------
      H1("10.  What we need from you"),
      P("Deliberately minimal — this is the whole list:"),
      num([T("A short connection step at kickoff for the three accounts involved: Xero (read access), the email address the reports should send from, and the shared drive they should save into. We walk you through each; it takes minutes and access is yours to revoke whenever you like.")], "need"),
      num([T("About 45 minutes on a kickoff call, and a further 30 minutes to review and sign off the first report at Milestone 1.")], "need"),
      num([T("One founder as our point of contact for quick questions during the build. Jonah, we assume that's you.")], "need"),

      // ---------- 11. NEXT ----------
      H1("11.  After handover — where this can go"),
      P("Once the reporting runs itself, natural next steps (each separately quoted, none required) include:"),
      bullet([T("The proactive insight agent ", { bold: true }), T("— the optional upgrade above, switched on whenever you're ready (£1,200).")]),
      bullet([T("SKU-level profitability ", { bold: true }), T("by connecting your storefront and till data alongside Xero — margin and best-sellers by product line, not just revenue.")]),
      bullet([T("A simple 12-month cash-flow and sales forecast built on the same clean data.")]),
      bullet([T("A light live dashboard for when you want to glance rather than read.")]),

      // ---------- 12. ACCEPTANCE ----------
      H1("12.  Acceptance"),
      P("To proceed, tick your choice below and reply to confirm — we'll send a one-page agreement and the kickoff invite. Sign-off by 25 July keeps us on the timeline above."),
      spacer(120),
      table([3000, 6360], [
        new TableRow({ children: [
          cell("Selected", { w: 3000, bold: true, color: NAVY }),
          cell("□  Core (£3,200)      □  add the insight-agent upgrade now (+£1,200)      □  add care plan (£75/qtr)", { w: 6360, size: 20 }) ]}),
      ]),
      spacer(160),
      table([4680, 4680], [
        new TableRow({ children: [
          cell([new Paragraph({spacing:{after:260},children:[]}), new Paragraph({ border:{top:{style:BorderStyle.SINGLE,size:4,color:"888888"}}, children:[new TextRun({text:"Signed, for Thread & Salt",size:18,color:GREY,font:FONT})]})], { w: 4680 }),
          cell([new Paragraph({spacing:{after:260},children:[]}), new Paragraph({ border:{top:{style:BorderStyle.SINGLE,size:4,color:"888888"}}, children:[new TextRun({text:"Date",size:18,color:GREY,font:FONT})]})], { w: 4680 }) ]}),
      ]),
      spacer(200),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
        children: [ new TextRun({ text: "Shyam Jagani  ·  Negative Zero  ·  shyam.jagani@negativezero.com", size: 16, color: GREY, font: FONT }) ] }),

    ],
  },

  // ================= APPENDIX SECTION — EXACT 1:1 REPLICA OF THE CLIENT REPORT =================
  {
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1360, bottom: 1200, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [ new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CW }],
      border: { bottom: { color: RULE, size: 4, space: 4, style: BorderStyle.SINGLE } },
      children: [ new TextRun({ text: "THREAD & SALT", bold: true, size: 15, color: NAVY, font: FONT }),
        new TextRun({ text: "\tManagement Accounts — SAMPLE", size: 15, color: GREY, font: FONT }) ] }) ] }) },
    footers: { default: new Footer({ children: [ new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CW }],
      children: [ new TextRun({ text: "Prepared by Negative Zero · figures from client sales data", size: 14, color: GREY, font: FONT }),
        new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 14, color: GREY, font: FONT }) ] }) ] }) },
    children: [
      // — appendix lead-in —
      new Paragraph({ spacing: { after: 40 }, children: [ new TextRun({ text: "APPENDIX A", bold: true, size: 18, color: TEAL, font: FONT, characterSpacing: 40 }) ] }),
      new Paragraph({ spacing: { after: 150 }, border: { bottom: { color: RULE, size: 6, space: 6, style: BorderStyle.SINGLE } },
        children: [ new TextRun({ text: "The exact report you receive. What follows is the live pack itself — same layout, same figures, delivered to your inbox and drive each period. Reproduced here from your real data.", italics: true, size: 18, color: GREY, font: FONT }) ] }),

      // ===== report body — 1:1 with the generated client report =====
      new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: "Management Accounts", bold: true, size: 46, color: NAVY, font: FONT })] }),
      new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: "The shape every week, month, quarter and year will arrive in", size: 22, color: TEAL, font: FONT, italics: true })] }),
      new Paragraph({ border: { bottom: { color: RULE, size: 10, space: 6, style: BorderStyle.SINGLE } }, spacing: { after: 150 },
        children: [new TextRun({ text: "Period covered: FY2024 – FY2026 year-to-date (through July 2026)  ·  Currency: GBP  ·  Basis: management information", size: 17, color: GREY, font: FONT })] }),

      rH1("At a glance"),
      P([T("Thread & Salt is profitable and growing. Full-year 2025 revenue reached "), T(money(638802), { bold: true }), T(" — up "), T("8.5%", { bold: true, color: GREEN }), T(" on 2024 — at a healthy and stable net margin. The figures below are the automated snapshot that heads every pack.")]),
      spacer(40),
      new Table({ columnWidths: [2340, 2340, 2340, 2340], width: { size: 9360, type: WidthType.DXA },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 8, color: "FFFFFF" }, insideVertical: { style: BorderStyle.SINGLE, size: 8, color: "FFFFFF" } },
        rows: [ new TableRow({ children: [
          rKpi("Revenue FY2025", money(638802), "▲ 8.5% vs FY2024", GREEN),
          rKpi("Gross margin", "58%", "Steady, all periods", TEAL),
          rKpi("Net profit FY2025", money(147823), "23.1% net margin", TEAL),
          rKpi("Rev / unit", "≈ £64", "Stable pricing power", TEAL),
        ]}) ] }),
      spacer(120),

      rH1("Profit & loss summary"),
      P("Revenue, cost of goods, operating costs and profit, at annual level. FY2026 is year-to-date through July, so it is a part-year figure and not directly comparable to the full years."),
      table([3360, 2000, 2000, 2000], [
        new TableRow({ tableHeader: true, children: [
          cell("£", { w: 3360, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("FY2024", { w: 2000, fill: NAVY, bold: true, color: "FFFFFF", align: AlignmentType.RIGHT }),
          cell("FY2025", { w: 2000, fill: NAVY, bold: true, color: "FFFFFF", align: AlignmentType.RIGHT }),
          cell("FY2026 YTD", { w: 2000, fill: NAVY, bold: true, color: "FFFFFF", align: AlignmentType.RIGHT }),
        ]}),
        rPlRow("Revenue", money(588800), money(638802), money(347342), { bold: true, fill: LIGHT }),
        rPlRow("Cost of goods sold", money(247296), money(268297), money(145884), { indent: true }),
        rPlRow("Gross profit", money(341504), money(370505), money(201458), { bold: true, color: NAVY }),
        rPlRow("Gross margin", "58%", "58%", "58%", { fill: LIGHT, color: GREY }),
        rPlRow("Marketing & advertising", money(82432), money(89432), money(48628), { indent: true }),
        rPlRow("Fulfilment & shipping", money(52992), money(57492), money(31261), { indent: true }),
        rPlRow("Platform & payment fees", money(20608), money(22358), money(12157), { indent: true }),
        rPlRow("Founders' compensation", money(38400), money(42000), money(25900), { indent: true }),
        rPlRow("Software & other overhead", money(10200), money(11400), money(6650), { indent: true }),
        rPlRow("Total operating expenses", money(204632), money(222683), money(124596), { fill: LIGHT }),
        rPlRow("Net profit", money(136872), money(147823), money(76863), { bold: true, fill: SAND, color: NAVY }),
        rPlRow("Net margin", "23.2%", "23.1%", "22.1%", { bold: true, color: TEAL }),
      ]),
      spacer(50),
      P([T("Read this: ", { bold: true, color: NAVY }), T("gross margin is rock-steady at 58%, so the business keeps a consistent slice of every sale. Because some costs are fixed, a soft revenue month squeezes net margin a little harder than the revenue drop alone — worth remembering when a quiet month lands.")]),

      new Paragraph({ children: [new PageBreak()] }),

      rH1("Revenue trend"),
      P("Monthly revenue since the order system went live in January 2024. The rhythm is clear: a strong Q4 lift each November–December, softer summers, and steady year-on-year growth — until the most recent month."),
      rImg("chart_monthly.png", 620, 214),
      spacer(30),
      rImg("chart_quarterly.png", 620, 200),
      spacer(30),
      table([2340, 2340, 2340, 2340], [
        new TableRow({ tableHeader: true, children: [
          cell("Quarter", { w: 2340, fill: NAVY, bold: true, color: "FFFFFF" }),
          cell("FY2024", { w: 2340, fill: NAVY, bold: true, color: "FFFFFF", align: AlignmentType.RIGHT }),
          cell("FY2025", { w: 2340, fill: NAVY, bold: true, color: "FFFFFF", align: AlignmentType.RIGHT }),
          cell("FY2026", { w: 2340, fill: NAVY, bold: true, color: "FFFFFF", align: AlignmentType.RIGHT }),
        ]}),
        new TableRow({ children: [ cell("Q1", { w: 2340, fill: LIGHT, bold: true }), cell(money(136431), { w: 2340, fill: LIGHT, align: AlignmentType.RIGHT }), cell(money(148518), { w: 2340, fill: LIGHT, align: AlignmentType.RIGHT }), cell(money(153302), { w: 2340, fill: LIGHT, align: AlignmentType.RIGHT }) ]}),
        new TableRow({ children: [ cell("Q2", { w: 2340, bold: true }), cell(money(135531), { w: 2340, align: AlignmentType.RIGHT }), cell(money(148876), { w: 2340, align: AlignmentType.RIGHT }), cell(money(152190), { w: 2340, align: AlignmentType.RIGHT }) ]}),
        new TableRow({ children: [ cell("Q3", { w: 2340, fill: LIGHT, bold: true }), cell(money(144768), { w: 2340, fill: LIGHT, align: AlignmentType.RIGHT }), cell(money(154628), { w: 2340, fill: LIGHT, align: AlignmentType.RIGHT }), cell("£41,850 *", { w: 2340, fill: LIGHT, align: AlignmentType.RIGHT, color: RED, bold: true }) ]}),
        new TableRow({ children: [ cell("Q4", { w: 2340, bold: true }), cell(money(172070), { w: 2340, align: AlignmentType.RIGHT }), cell(money(186780), { w: 2340, align: AlignmentType.RIGHT }), cell("—", { w: 2340, align: AlignmentType.RIGHT, color: GREY }) ]}),
      ]),
      P([T("* FY2026 Q3 = July only (one month), not a full quarter.", { size: 16, color: GREY, italics: true })], { after: 60 }),

      rH1("What the agent flagged this month"),
      P([T("This is the kind of proactive signal the optional insight-agent upgrade surfaces automatically — observe, analyse, recommend:")]),
      new Table({ columnWidths: [CW], width: { size: CW, type: WidthType.DXA },
        borders: { top: { style: BorderStyle.SINGLE, size: 12, color: RED }, bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
          left: { style: BorderStyle.SINGLE, size: 12, color: RED }, right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
          insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
        rows: [ new TableRow({ children: [ new TableCell({ width: { size: CW, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: LIGHT }, margins: { top: 160, bottom: 160, left: 200, right: 200 },
          children: [
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "⚠  Watch — July revenue broke trend", bold: true, size: 22, color: RED, font: FONT })] }),
            new Paragraph({ spacing: { after: 80 }, children: [
              new TextRun({ text: "July 2026 came in at £41,850 — down 24.4% on June and down 22.0% on July last year. ", size: 20, font: FONT, color: "222222" }),
              new TextRun({ text: "Every previous July grew year-on-year; this is the first month to fall below the same month a year earlier.", size: 20, font: FONT, color: "222222" })] }),
            new Paragraph({ spacing: { after: 80 }, children: [
              new TextRun({ text: "Context: ", bold: true, size: 20, color: NAVY, font: FONT }),
              new TextRun({ text: "first-half 2026 revenue (£305,492) grew only 2.7% over first-half 2025 — well below the 8.5% full-year pace of 2024→2025. Growth was already cooling before July's drop.", size: 20, font: FONT, color: "222222" })] }),
            new Paragraph({ children: [
              new TextRun({ text: "Recommended action: ", bold: true, size: 20, color: GREEN, font: FONT }),
              new TextRun({ text: "treat July as a signal, not noise. Check whether a hero line (e.g. the Corail Linen Wrap Dress) sold through or stocked out, confirm marketing spend didn't pause, and line up an August mailing-list drop ahead of the reliable Q4 lift. The agent will re-check next period and tell you if the trend continues.", size: 20, font: FONT, color: "222222" })] }),
          ]})]})]}),
      spacer(120),
      new Paragraph({ spacing: { before: 40 }, border: { top: { color: RULE, size: 4, space: 6, style: BorderStyle.SINGLE } },
        children: [new TextRun({ text: "Notes.  ", bold: true, size: 16, color: GREY, font: FONT }),
          new TextRun({ text: "Management information for internal decisions — not audited or statutory accounts. Monthly detail begins Jan 2024 (the order system's start); earlier years are annual-only. COGS modelled at 42% of revenue per the company's product costing. Figures pull live from Xero and reconcile to your books; this appendix is built from your shared history to show the exact format and rigour.", size: 16, color: GREY, font: FONT })] }),
    ],
  }],
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync("Thread-and-Salt-Proposal-final.docx", b);
  console.log("wrote Thread-and-Salt-Proposal-final.docx", b.length, "bytes");
});
