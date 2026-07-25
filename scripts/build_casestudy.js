const docx = require('docx');
const fs = require('fs');
const {Document,Packer,Paragraph,TextRun,HeadingLevel,AlignmentType,Table,TableRow,TableCell,
  WidthType,BorderStyle,ShadingType,Header,Footer,PageNumber,TabStopType,LevelFormat}=docx;

const NAVY="1F3A4D",TEAL="2E6E7E",SAND="F1ECE2",GREY="5A5A5A",RULE="C9BFA8";
const FONT="Calibri",CW=9360;

const H1=(t)=>new Paragraph({heading:HeadingLevel.HEADING_1,spacing:{before:280,after:100},
  children:[new TextRun({text:t,bold:true,size:26,color:NAVY,font:FONT})],
  border:{bottom:{color:RULE,size:8,space:6,style:BorderStyle.SINGLE}}});
const T=(t,o={})=>new TextRun({text:t,size:o.size??21,bold:o.bold,italics:o.italics,color:o.color??"222222",font:FONT});
const P=(runs,o={})=>new Paragraph({spacing:{after:o.after??110,line:276},alignment:o.align,
  children:(Array.isArray(runs)?runs:[runs]).map(r=>typeof r==="string"?T(r):r)});
const b=(runs)=>new Paragraph({numbering:{reference:"b",level:0},spacing:{after:60,line:270},
  children:(Array.isArray(runs)?runs:[runs]).map(r=>typeof r==="string"?T(r):r)});
const label=(t)=>new Paragraph({spacing:{after:40,before:60},children:[new TextRun({text:t,bold:true,size:19,color:TEAL,font:FONT,allCaps:true,characterSpacing:20})]});
const spacer=(h=60)=>new Paragraph({spacing:{after:h},children:[]});

const doc=new Document({creator:"Negative Zero",title:"Thread & Salt — Case Study Outline",
  styles:{default:{document:{run:{font:FONT,size:21}}}},
  numbering:{config:[{reference:"b",levels:[{level:0,format:LevelFormat.BULLET,text:"•",alignment:AlignmentType.LEFT,
    style:{run:{color:TEAL},paragraph:{indent:{left:360,hanging:210}}}}]}]},
  sections:[{
    properties:{page:{size:{width:12240,height:15840},margin:{top:1360,bottom:1200,left:1440,right:1440}}},
    headers:{default:new Header({children:[new Paragraph({tabStops:[{type:TabStopType.RIGHT,position:CW}],
      border:{bottom:{color:RULE,size:4,space:4,style:BorderStyle.SINGLE}},
      children:[new TextRun({text:"CASE STUDY — OUTLINE",bold:true,size:15,color:NAVY,font:FONT}),
        new TextRun({text:"\tThread & Salt × Claude · Negative Zero",size:15,color:GREY,font:FONT})]})]})},
    footers:{default:new Footer({children:[new Paragraph({tabStops:[{type:TabStopType.RIGHT,position:CW}],
      children:[new TextRun({text:"Public-facing deliverable · draft outline",size:14,color:GREY,font:FONT}),
        new TextRun({children:["\tPage ",PageNumber.CURRENT," of ",PageNumber.TOTAL_PAGES],size:14,color:GREY,font:FONT})]})]})},
    children:[
      new Paragraph({spacing:{before:80,after:30},children:[new TextRun({text:"Case Study — Outline",bold:true,size:40,color:NAVY,font:FONT})]}),
      new Paragraph({spacing:{after:30},children:[new TextRun({text:"How a two-person fashion label got management accounts that write themselves",size:22,color:TEAL,font:FONT,italics:true})]}),
      new Paragraph({border:{bottom:{color:RULE,size:10,space:6,style:BorderStyle.SINGLE}},spacing:{after:140},
        children:[new TextRun({text:"Public / Anthropic-facing  ·  proposed title, structure and draft copy blocks  ·  final format TBC (web post or one-pager)",size:16,color:GREY,font:FONT})]}),

      P([T("This outline is the public case-study deliverable. It captures the story arc, the section-by-section structure, draft copy blocks, and the metrics and quotes we'll want to capture during the build so the final piece writes quickly. (Client figures shown are synthetic practice data.)")]),

      H1("Headline options"),
      b([T("“Four founders' evenings a quarter, gone: how Thread & Salt automated its management accounts with Claude.”")]),
      b([T("“The books that write themselves.”")]),
      b([T("“From a messy spreadsheet to boardroom-grade accounts — without hiring a finance person.”")]),

      H1("Story arc (problem → approach → solution → outcome)"),
      label("1 · The client"),
      P("Thread & Salt — a small, coastal, direct-to-consumer fashion label. Two founders, no finance hire, small runs of natural-fabric pieces sold online and through a physical presence. Profitable and growing, but flying blind on the numbers."),
      label("2 · The problem"),
      P([T("The books lived in Xero, sales in a messy Google Sheet, and management reporting happened “whenever a founder remembered — which was rarely.” The pain wasn't a lack of data; it was that "),T("nobody had the time or the habit to turn data into a decision.",{bold:true}),T(" A £600k-a-year business was being run on gut feel.")]),
      label("3 · The approach with Claude"),
      P("A contract-first, do-it-once-then-automate build:"),
      b([T("Clean the data once. ",{bold:true}),T("Claude read the inconsistent sheet/CSV and produced a single reliable dataset.")]),
      b([T("Nail one report end-to-end. ",{bold:true}),T("A polished P&L-style management-accounts pack — revenue by month/quarter/year, margins, cost breakdown, top lines and channel split — signed off by the founders.")]),
      b([T("Make the cadence run itself. ",{bold:true}),T("Scheduled routines regenerate the monthly, quarterly and annual packs in an identical, structured shape — no human trigger.")]),
      b([T("Add a proactive agent. ",{bold:true}),T("An observe → analyse → recommend loop that reads each new month, flags at-risk lines and restock/discount signals, and recommends an action.")]),
      label("4 · The proof moment"),
      P([T("The agent's first real catch: July 2026 revenue fell "),T("24% month-on-month and 22% year-on-year",{bold:true}),T(" — the first July in the record to drop below the prior year. It surfaced the signal, set it in context (first-half growth had already cooled to 2.7%), and recommended a concrete action before either founder would have noticed. Reporting stopped being a rear-view mirror.")]),
      label("5 · The outcome"),
      P("Management accounts now arrive automatically, every month, in a format the founders actually read — and the business gets an early-warning system on top. Delivered in three weeks, inside a small-business budget, with essentially zero ongoing effort from the team."),

      H1("Metrics to capture for the final piece"),
      b([T("Time saved per reporting cycle (founder hours before vs after — target: near-zero ongoing).")]),
      b([T("Time-to-first-report (data in → polished pack out).")]),
      b([T("Number of proactive signals surfaced, and decisions taken as a result.")]),
      b([T("Total engagement cost vs the alternative (part-time bookkeeper / fractional finance).")]),

      H1("Quotes to gather"),
      b([T("Jonah (ops): ",{bold:true}),T("on the “kept me up at night” problem, and what it feels like to no longer chase the numbers.")]),
      b([T("Mara (creative): ",{bold:true}),T("on trusting a decision (a restock or a drop) because the data backed it.")]),
      b([T("One line on the July catch ",{bold:true}),T("— the moment the system earned its keep.")]),

      H1("Claude capabilities to spotlight"),
      P("Ties to the exam themes and keeps the piece technically credible without jargon:"),
      b([T("Agentic architecture & orchestration ",{bold:true}),T("— the observe→analyse→recommend→repeat loop, not a one-shot prompt.")]),
      b([T("Structured output ",{bold:true}),T("— every pack in an identical, comparable shape.")]),
      b([T("Tool design & MCP / connectors ",{bold:true}),T("— reading the sheet, and optionally Xero, as live data sources.")]),
      b([T("Scheduled tasks ",{bold:true}),T("— the cadence that removes the human-memory dependency entirely.")]),

      spacer(80),
      new Paragraph({border:{top:{color:RULE,size:4,space:6,style:BorderStyle.SINGLE}},
        children:[new TextRun({text:"Note.  All client data referenced is synthetic practice material for the Synthetic Signal Associate Program. This case study is the public deliverable; the proposal and solution are internal.",size:16,color:GREY,font:FONT,italics:true})]}),
    ],
  }],
});
Packer.toBuffer(doc).then(x=>{fs.writeFileSync("Thread-and-Salt-Case-Study-Outline.docx",x);console.log("wrote casestudy",x.length);});
