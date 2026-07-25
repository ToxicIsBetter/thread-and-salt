'use strict';
/**
 * GATE 2 — verify the RENDERED pack against the verified numbers.
 *
 * Reads the produced .docx back off disk (independent zip/XML parse — not the
 * writer's own view of what it wrote) and proves:
 *   • every figure in the ledger actually appears in the document (zero tolerance)
 *   • no stray figure appears that the model never produced
 *   • all required sections are present and non-empty
 *   • both charts are embedded as valid PNG media
 *   • the insight box matches the computed signal
 *   • no placeholder/NaN/undefined leaked into the output
 *
 * Failure → the run loops back to Render (Loop B); 5 failures → full restart (Loop C).
 */
const fs = require('fs');
const path = require('path');
const { openZip } = require('../unzip');
const { pdfText } = require('./pdftext');
const { gbp, pdfSafe } = require('../format');

function check(name, pass, detail) {
  return { name, pass: !!pass, detail: detail == null ? '' : String(detail) };
}

/** Extract the document's visible text, paragraph by paragraph. */
function docText(xml) {
  const paras = xml.split(/<\/w:p>/).map((chunk) => {
    const runs = [...chunk.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
    return decode(runs.join(''));
  });
  return { paras, all: paras.join('\n') };
}
function decode(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

function verifyRender(result, model, signals, cfg) {
  const checks = [];
  const { file, expected, requiredSections, allowedMoney = [] } = result;

  // ---------- 0. artefact integrity ----------
  if (!fs.existsSync(file)) {
    return { gate: 'GATE 2 — render', pass: false, checked: 1, failedCount: 1,
      failures: [check('integrity:exists', false, `${file} was not written`)],
      checks: [check('integrity:exists', false, file)] };
  }
  const buf = fs.readFileSync(file);
  checks.push(check('integrity:nonTrivialSize', buf.length > 8000, `${buf.length} bytes`));

  const isPdf = path.extname(file).toLowerCase() === '.pdf';
  let text = '';
  let media = [];      // embedded image parts (docx) — count only for pdf
  let validImages = 0;
  let relsOk = true;

  if (isPdf) {
    // ---- PDF: read the finished file back (uncompressed content streams) ----
    if (buf.slice(0, 5).toString('latin1') !== '%PDF-') {
      const f = check('integrity:openable', false, 'missing %PDF- header');
      return { gate: 'GATE 2 — render', pass: false, checked: 1, failedCount: 1, failures: [f], checks: [f] };
    }
    let parsed;
    try {
      parsed = pdfText(buf);
    } catch (e) {
      const f = check('integrity:openable', false, e.message);
      return { gate: 'GATE 2 — render', pass: false, checked: 1, failedCount: 1, failures: [f], checks: [f] };
    }
    const trailerOk = buf.slice(-1200).toString('latin1').includes('%%EOF');
    checks.push(check('integrity:openable', trailerOk, trailerOk ? `${parsed.pageCount} page(s)` : 'no %%EOF trailer — file truncated'));
    // A sane pack is 2–6 pages. Runaway pagination (e.g. content drawn outside the
    // usable area) is a real rendering fault, so bound it in both directions.
    checks.push(check('integrity:pageCount', parsed.pageCount >= 2 && parsed.pageCount <= 6,
      `${parsed.pageCount} pages (expected 2-6)`));
    text = parsed.text;
    validImages = parsed.imageCount;
  } else {
    // ---- DOCX: independent zip/XML parse ----
    let zip;
    try {
      zip = openZip(buf);
    } catch (e) {
      const f = check('integrity:openable', false, e.message);
      return { gate: 'GATE 2 — render', pass: false, checked: 1, failedCount: 1, failures: [f], checks: [f] };
    }
    checks.push(check('integrity:openable', true, `${zip.names.length} parts`));
    const docXmlBuf = zip.read('word/document.xml');
    checks.push(check('integrity:hasDocumentXml', !!docXmlBuf));
    if (!docXmlBuf) {
      const failures = checks.filter((c) => !c.pass);
      return { gate: 'GATE 2 — render', pass: false, checked: checks.length, failedCount: failures.length, failures, checks };
    }
    text = docText(docXmlBuf.toString('utf8')).all;
    media = zip.names.filter((n) => /^word\/media\//.test(n) && !n.endsWith('/'));
    for (const m of media) {
      const b = zip.read(m);
      if (b && b.length > 8 && b[0] === 0x89 && b.slice(1, 4).toString('ascii') === 'PNG') validImages++;
    }
    const rels = zip.read('word/_rels/document.xml.rels');
    relsOk = !!rels && /image/i.test(rels.toString('utf8'));
  }

  // ---------- 1. figure ledger: every expected figure present ----------
  const missing = [];
  for (const item of expected) {
    // the document may render '−' (minus sign) where the ledger holds '-'
    const variants = new Set([
      item.text,
      item.text.replace(/-/g, '−'),
      item.text.replace(/−/g, '-'),
      pdfSafe(item.text),
    ]);
    if (![...variants].some((v) => text.includes(v))) missing.push(`${item.key}="${item.text}"`);
  }
  checks.push(
    check('figures:allPresent', missing.length === 0,
      missing.length ? `missing ${missing.length}: ${missing.slice(0, 6).join(', ')}` : `${expected.length} figures verified`)
  );

  // ---------- 2. no unexpected money figures ----------
  // Every £ figure in the document must be one the model actually produced.
  const allowed = new Set([...expected.map((e) => e.text), ...allowedMoney]);
  for (const t of [...allowed]) allowed.add(pdfSafe(t));
  // money that legitimately appears in prose/assumptions is derived from the same model
  for (const c of model.pnlColumns) {
    allowed.add(gbp(c.revenuePence)); allowed.add(gbp(c.netPence)); allowed.add(gbp(c.grossPence));
  }
  // anchored so trailing punctuation in prose ("£41,850, down 24%") isn't captured
  const found = [...text.matchAll(/£\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g)].map((m) => m[0]);
  const stray = [...new Set(found.filter((f) => !allowed.has(f)))];
  checks.push(
    check('figures:noStrayMoney', stray.length === 0, stray.length ? `unexpected: ${stray.slice(0, 8).join(', ')}` : `${found.length} money strings all traceable`)
  );

  // ---------- 3. required sections present and non-empty ----------
  for (const section of requiredSections) {
    const idx = text.indexOf(section);
    const body = idx >= 0 ? text.slice(idx + section.length, idx + section.length + 400).trim() : '';
    checks.push(check(`section:${section}`, idx >= 0 && body.length > 20, idx < 0 ? 'missing' : `${body.length} chars follow`));
  }

  // ---------- 4. charts embedded ----------
  checks.push(check('charts:twoEmbedded', validImages >= 2, `${validImages} embedded image(s)`));
  if (!isPdf) {
    checks.push(check('charts:validPng', validImages >= 2, `${validImages} valid PNG(s) of ${media.length} media part(s)`));
    checks.push(check('charts:relationshipsWired', relsOk, 'image relationships present'));
  }

  // ---------- 5. insight box consistency ----------
  if (signals.length > 0) {
    const top = signals[0];
    const present = (needle) => text.includes(needle) || text.includes(pdfSafe(needle));
    checks.push(check('insight:titlePresent', present(top.title), top.title));
    checks.push(check('insight:actionPresent', present(top.action.slice(0, 40)), 'recommended action text'));
    if (top.figures && top.figures.revenuePence != null) {
      checks.push(check('insight:figureMatches', text.includes(gbp(top.figures.revenuePence)), gbp(top.figures.revenuePence)));
    }
  } else {
    checks.push(check('insight:noneStated', /Nothing unusual this period/.test(text), 'empty-signal wording present'))
  }

  // ---------- 6. no placeholders / broken values ----------
  const badTokens = ['undefined', 'NaN', '[object Object]', '{{', '}}', 'Infinity'];
  const leaked = badTokens.filter((t) => text.includes(t));
  checks.push(check('output:noPlaceholders', leaked.length === 0, leaked.length ? `found ${leaked.join(', ')}` : 'clean'));

  // ---------- 7. period labelling correct ----------
  checks.push(check('meta:periodLabel', text.includes(model.meta.periodLabel) || text.includes(pdfSafe(model.meta.periodLabel)), model.meta.periodLabel));
  checks.push(check('meta:cadenceNamed', new RegExp(model.meta.cadence, 'i').test(text), model.meta.cadence));

  const failures = checks.filter((c) => !c.pass);
  return {
    gate: 'GATE 2 — render',
    pass: failures.length === 0,
    checked: checks.length,
    failedCount: failures.length,
    failures,
    checks,
    file,
    figuresVerified: expected.length,
  };
}

module.exports = { verifyRender, docText };
