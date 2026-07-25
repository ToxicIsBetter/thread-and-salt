const docx = require('docx');
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, Header, Footer, PageNumber, ImageRun, TabStopType, LevelFormat
} = docx;

const NAVY="1F3A4D", TEAL="2E6E7E", SAND="F1ECE2", LIGHT="F7F4EE", GREY="5A5A5A", RULE="C9BFA8", RED="B4553F", GREEN="3B6E4B";
const FONT="Calibri";
const CW=9360;

const H1=(t)=>new Paragraph({heading:HeadingLevel.HEADING_1,spacing:{before:300,after:110},
  children:[new TextRun({text:t,bold:true,size:28,color:NAVY,font:FONT})],
  border:{bottom:{color:RULE,size:8,space:6,style:BorderStyle.SINGLE}}});
const T=(t,o={})=>new TextRun({text:t,size:o.size??21,bold:o.bold,italics:o.italics,color:o.color??"222222",font:FONT});
const P=(runs,o={})=>new Paragraph({spacing:{after:o.after??120,line:276},alignment:o.align,
  children:(Array.isArray(runs)?runs:[runs]).map(r=>typeof r==="string"?T(r):r)});
const bullet=(runs)=>new Paragraph({numbering:{reference:"b",level:0},spacing:{after:70,line:272},
  children:(Array.isArray(runs)?runs:[runs]).map(r=>typeof r==="string"?T(r):r)});
const spacer=(h=80)=>new Paragraph({spacing:{after:h},children:[]});

const gbp=(n)=>"£"+Math.round(n).toLocaleString("en-GB");
function cell(text,{w,fill,bold,color,align,size}={}){
  const arr=Array.isArray(text)?text:[text];
  return new TableCell({width:{size:w,type:WidthType.DXA},
    shading:fill?{type:ShadingType.CLEAR,color:"auto",fill}:undefined,
    margins:{top:46,bottom:46,left:100,right:100},
    children:arr.map(c=>typeof c==="string"?new Paragraph({alignment:align,spacing:{after:0},
      children:[new TextRun({text:c,bold,size:size??19,color:color??"222222",font:FONT})]}):c)});
}
function table(cols,rows){return new Table({columnWidths:cols,width:{size:cols.reduce((a,b)=>a+b,0),type:WidthType.DXA},
  borders:{top:{style:BorderStyle.SINGLE,size:2,color:RULE},bottom:{style:BorderStyle.SINGLE,size:2,color:RULE},
    left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},
    insideHorizontal:{style:BorderStyle.SINGLE,size:2,color:"E4DECF"},insideVertical:{style:BorderStyle.NONE}},rows});}

// KPI card
function kpi(label,value,sub,subColor){
  return new TableCell({width:{size:2340,type:WidthType.DXA},
    shading:{type:ShadingType.CLEAR,color:"auto",fill:SAND},
    margins:{top:120,bottom:120,left:130,right:130},
    children:[
      new Paragraph({spacing:{after:20},children:[new TextRun({text:label,size:15,color:GREY,font:FONT,allCaps:true,characterSpacing:20})]}),
      new Paragraph({spacing:{after:20},children:[new TextRun({text:value,bold:true,size:30,color:NAVY,font:FONT})]}),
      new Paragraph({children:[new TextRun({text:sub,size:16,color:subColor||TEAL,font:FONT,bold:true})]}),
    ]});
}
const img=(file,w,h)=>new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:60,before:40},
  children:[new ImageRun({type:"png",data:fs.readFileSync(file),transformation:{width:w,height:h}})]});

// P&L row helper
function plRow(label,v24,v25,v26,{bold,fill,color,indent}={}){
  const lab=(indent?"   ":"")+label;
  return new TableRow({children:[
    cell(lab,{w:3360,fill,bold,color}),
    cell(v24,{w:2000,fill,bold,color,align:AlignmentType.RIGHT}),
    cell(v25,{w:2000,fill,bold,color,align:AlignmentType.RIGHT}),
    cell(v26,{w:2000,fill,bold,color,align:AlignmentType.RIGHT}),
  ]});
}

const doc=new Document({creator:"Negative Zero",title:"Thread & Salt — Sample Management Accounts",
  styles:{default:{document:{run:{font:FONT,size:21}}}},
  numbering:{config:[{reference:"b",levels:[{level:0,format:LevelFormat.BULLET,text:"•",alignment:AlignmentType.LEFT,
    style:{run:{color:TEAL},paragraph:{indent:{left:360,hanging:210}}}}]}]},
  sections:[{
    properties:{page:{size:{width:12240,height:15840},margin:{top:1360,bottom:1200,left:1440,right:1440}}},
    headers:{default:new Header({children:[new Paragraph({tabStops:[{type:TabStopType.RIGHT,position:CW}],
      border:{bottom:{color:RULE,size:4,space:4,style:BorderStyle.SINGLE}},
      children:[new TextRun({text:"THREAD & SALT",bold:true,size:15,color:NAVY,font:FONT}),
        new TextRun({text:"\tManagement Accounts — SAMPLE",size:15,color:GREY,font:FONT})]})]})},
    footers:{default:new Footer({children:[new Paragraph({tabStops:[{type:TabStopType.RIGHT,position:CW}],
      children:[new TextRun({text:"Prepared by Negative Zero · figures from client sales data",size:14,color:GREY,font:FONT}),
        new TextRun({children:["\tPage ",PageNumber.CURRENT," of ",PageNumber.TOTAL_PAGES],size:14,color:GREY,font:FONT})]})]})},
    children:[
      // Title
      new Paragraph({spacing:{before:120,after:40},children:[new TextRun({text:"Management Accounts",bold:true,size:46,color:NAVY,font:FONT})]}),
      new Paragraph({spacing:{after:30},children:[new TextRun({text:"Sample report — the shape every month, quarter and year will arrive in",size:22,color:TEAL,font:FONT,italics:true})]}),
      new Paragraph({border:{bottom:{color:RULE,size:10,space:6,style:BorderStyle.SINGLE}},spacing:{after:150},
        children:[new TextRun({text:"Period covered: FY2024 – FY2026 year-to-date (through July 2026)  ·  Currency: GBP  ·  Basis: management information",size:17,color:GREY,font:FONT})]}),

      H1("At a glance"),
      P([T("Thread & Salt is profitable and growing. Full-year 2025 revenue reached "),T(gbp(638802),{bold:true}),T(" — up "),T("8.5%",{bold:true,color:GREEN}),T(" on 2024 — at a healthy and stable net margin. The figures below are the automated snapshot that would head every monthly pack.")]),
      spacer(40),
      new Table({columnWidths:[2340,2340,2340,2340],width:{size:9360,type:WidthType.DXA},
        borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},
          insideHorizontal:{style:BorderStyle.SINGLE,size:8,color:"FFFFFF"},insideVertical:{style:BorderStyle.SINGLE,size:8,color:"FFFFFF"}},
        rows:[new TableRow({children:[
          kpi("Revenue FY2025",gbp(638802),"▲ 8.5% vs FY2024",GREEN),
          kpi("Gross margin","58%","Steady, all periods",TEAL),
          kpi("Net profit FY2025",gbp(147823),"23.1% net margin",TEAL),
          kpi("Rev / unit","≈ £64","Stable pricing power",TEAL),
        ]})]}),
      spacer(120),

      H1("Profit & loss summary"),
      P("Revenue, cost of goods, operating costs and profit, at annual level. FY2026 is year-to-date through July, so it is a part-year figure and not directly comparable to the full years."),
      table([3360,2000,2000,2000],[
        new TableRow({tableHeader:true,children:[
          cell("£",{w:3360,fill:NAVY,bold:true,color:"FFFFFF"}),
          cell("FY2024",{w:2000,fill:NAVY,bold:true,color:"FFFFFF",align:AlignmentType.RIGHT}),
          cell("FY2025",{w:2000,fill:NAVY,bold:true,color:"FFFFFF",align:AlignmentType.RIGHT}),
          cell("FY2026 YTD",{w:2000,fill:NAVY,bold:true,color:"FFFFFF",align:AlignmentType.RIGHT}),
        ]}),
        plRow("Revenue",gbp(588800),gbp(638802),gbp(347342),{bold:true,fill:LIGHT}),
        plRow("Cost of goods sold",gbp(247296),gbp(268297),gbp(145884),{indent:true}),
        plRow("Gross profit",gbp(341504),gbp(370505),gbp(201458),{bold:true,color:NAVY}),
        plRow("Gross margin",  "58%","58%","58%",{fill:LIGHT,color:GREY}),
        plRow("Marketing & advertising",gbp(82432),gbp(89432),gbp(48628),{indent:true}),
        plRow("Fulfilment & shipping",gbp(52992),gbp(57492),gbp(31261),{indent:true}),
        plRow("Platform & payment fees",gbp(20608),gbp(22358),gbp(12157),{indent:true}),
        plRow("Founders' compensation",gbp(38400),gbp(42000),gbp(25900),{indent:true}),
        plRow("Software & other overhead",gbp(10200),gbp(11400),gbp(6650),{indent:true}),
        plRow("Total operating expenses",gbp(204632),gbp(222683),gbp(124596),{fill:LIGHT}),
        plRow("Net profit",gbp(136872),gbp(147823),gbp(76863),{bold:true,fill:SAND,color:NAVY}),
        plRow("Net margin","23.2%","23.1%","22.1%",{bold:true,color:TEAL}),
      ]),
      spacer(50),
      P([T("Read this: ",{bold:true,color:NAVY}),T("gross margin is rock-steady at 58%, so the business keeps a consistent slice of every sale. Because some costs are fixed, a soft revenue month squeezes net margin a little harder than the revenue drop alone — worth remembering when a quiet month lands.")]),

      new Paragraph({children:[new PageBreak()]}),

      H1("Revenue trend"),
      P("Monthly revenue since the order system went live in January 2024. The rhythm is clear: a strong Q4 lift each November–December, softer summers, and steady year-on-year growth — until the most recent month."),
      img("chart_monthly.png",620,214),
      spacer(30),
      img("chart_quarterly.png",620,200),
      spacer(30),
      table([2340,2340,2340,2340],[
        new TableRow({tableHeader:true,children:[
          cell("Quarter",{w:2340,fill:NAVY,bold:true,color:"FFFFFF"}),
          cell("FY2024",{w:2340,fill:NAVY,bold:true,color:"FFFFFF",align:AlignmentType.RIGHT}),
          cell("FY2025",{w:2340,fill:NAVY,bold:true,color:"FFFFFF",align:AlignmentType.RIGHT}),
          cell("FY2026",{w:2340,fill:NAVY,bold:true,color:"FFFFFF",align:AlignmentType.RIGHT}),
        ]}),
        new TableRow({children:[cell("Q1",{w:2340,fill:LIGHT,bold:true}),cell(gbp(136431),{w:2340,fill:LIGHT,align:AlignmentType.RIGHT}),cell(gbp(148518),{w:2340,fill:LIGHT,align:AlignmentType.RIGHT}),cell(gbp(153302),{w:2340,fill:LIGHT,align:AlignmentType.RIGHT})]}),
        new TableRow({children:[cell("Q2",{w:2340,bold:true}),cell(gbp(135531),{w:2340,align:AlignmentType.RIGHT}),cell(gbp(148876),{w:2340,align:AlignmentType.RIGHT}),cell(gbp(152190),{w:2340,align:AlignmentType.RIGHT})]}),
        new TableRow({children:[cell("Q3",{w:2340,fill:LIGHT,bold:true}),cell(gbp(144768),{w:2340,fill:LIGHT,align:AlignmentType.RIGHT}),cell(gbp(154628),{w:2340,fill:LIGHT,align:AlignmentType.RIGHT}),cell("£41,850 *",{w:2340,fill:LIGHT,align:AlignmentType.RIGHT,color:RED,bold:true})]}),
        new TableRow({children:[cell("Q4",{w:2340,bold:true}),cell(gbp(172070),{w:2340,align:AlignmentType.RIGHT}),cell(gbp(186780),{w:2340,align:AlignmentType.RIGHT}),cell("—",{w:2340,align:AlignmentType.RIGHT,color:GREY})]}),
      ]),
      P([T("* FY2026 Q3 = July only (one month), not a full quarter.",{size:16,color:GREY,italics:true})],{after:60}),

      H1("What the agent flagged this month"),
      P([T("This is the kind of proactive signal the stretch agent surfaces automatically — observe, analyse, recommend:")]),
      new Table({columnWidths:[CW],width:{size:CW,type:WidthType.DXA},
        borders:{top:{style:BorderStyle.SINGLE,size:12,color:RED},bottom:{style:BorderStyle.SINGLE,size:2,color:RULE},
          left:{style:BorderStyle.SINGLE,size:12,color:RED},right:{style:BorderStyle.SINGLE,size:2,color:RULE},
          insideHorizontal:{style:BorderStyle.NONE},insideVertical:{style:BorderStyle.NONE}},
        rows:[new TableRow({children:[new TableCell({width:{size:CW,type:WidthType.DXA},
          shading:{type:ShadingType.CLEAR,color:"auto",fill:LIGHT},margins:{top:160,bottom:160,left:200,right:200},
          children:[
            new Paragraph({spacing:{after:60},children:[new TextRun({text:"⚠  Watch — July revenue broke trend",bold:true,size:22,color:RED,font:FONT})]}),
            new Paragraph({spacing:{after:80},children:[
              new TextRun({text:"July 2026 came in at £41,850 — down 24.4% on June and down 22.0% on July last year. ",size:20,font:FONT,color:"222222"}),
              new TextRun({text:"Every previous July grew year-on-year; this is the first month to fall below the same month a year earlier.",size:20,font:FONT,color:"222222"})]}),
            new Paragraph({spacing:{after:80},children:[
              new TextRun({text:"Context: ",bold:true,size:20,color:NAVY,font:FONT}),
              new TextRun({text:"first-half 2026 revenue (£305,492) grew only 2.7% over first-half 2025 — well below the 8.5% full-year pace of 2024→2025. Growth was already cooling before July's drop.",size:20,font:FONT,color:"222222"})]}),
            new Paragraph({children:[
              new TextRun({text:"Recommended action: ",bold:true,size:20,color:GREEN,font:FONT}),
              new TextRun({text:"treat July as a signal, not noise. Check whether a hero line (e.g. the Corail Linen Wrap Dress) sold through or stocked out, confirm marketing spend didn't pause, and line up an August mailing-list drop ahead of the reliable Q4 lift. The agent will re-check next month and tell you if the trend continues.",size:20,font:FONT,color:"222222"})]}),
          ]})]})]}),
      spacer(120),

      new Paragraph({spacing:{before:40},border:{top:{color:RULE,size:4,space:6,style:BorderStyle.SINGLE}},
        children:[new TextRun({text:"Notes.  ",bold:true,size:16,color:GREY,font:FONT}),
          new TextRun({text:"Management information for internal decisions — not audited or statutory accounts. Monthly detail begins Jan 2024 (the order system's start); earlier years are annual-only. COGS modelled at 42% of revenue per the company's product costing. This is a sample built from the shared history to show format and rigour; the live monthly pack regenerates automatically in this same shape.",size:16,color:GREY,font:FONT})]}),
    ],
  }],
});

Packer.toBuffer(doc).then(b=>{fs.writeFileSync("Thread-and-Salt-Sample-Management-Accounts.docx",b);console.log("wrote report",b.length);});
