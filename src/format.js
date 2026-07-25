'use strict';
/**
 * Single formatting authority. Both the renderer and GATE 2 use these functions,
 * so "what the document should say" and "what the checker expects" can never drift.
 * (GATE 2 verifies transport of figures into the document — the arithmetic itself
 * is what GATE 1 independently re-derives.)
 */
const gbp = (pence) => '£' + Math.round(pence / 100).toLocaleString('en-GB');
const gbpParen = (pence) => '(' + gbp(pence) + ')';
const pct1 = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);
const signedPct1 = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`);
const int = (n) => (n == null ? '—' : Number(n).toLocaleString('en-GB'));
const gbpExact = (pence) =>
  '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * PDF-safe text. The built-in Helvetica uses WinAnsi encoding, which has no glyph for
 * U+2212 minus, warning triangles, or similar — so those are folded to ASCII/omitted
 * rather than rendering as garbage. Money (£) and en/em dashes are all fine.
 */
const pdfSafe = (s) =>
  String(s)
    .replace(/\u2212/g, '-')      // minus sign → hyphen
    .replace(/[\u2192\u2794]/g, '->')
    .replace(/[\u26A0\u2139\uFE0F]/g, '')  // warning / info glyphs
    .replace(/[\u25B2\u25BC]/g, '')         // up/down triangles
    .replace(/\u00B7/g, '-')      // middle dot → hyphen (safe in WinAnsi but visually odd inline)
    .replace(/\s+$/g, '');

/** Filesystem-safe slug for output folders/filenames. */
const slug = (s) =>
  String(s)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

module.exports = { gbp, gbpParen, pct1, signedPct1, int, gbpExact, slug, pdfSafe };
