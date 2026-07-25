'use strict';
/**
 * Extracts the visible text from a PDF we generated, so GATE 2 can verify the finished
 * artefact rather than trusting the writer that produced it.
 *
 * Works because the renderer writes uncompressed content streams (pdfkit `compress:false`)
 * with WinAnsi-encoded Type1 text, i.e.:
 *     BT /F1 11 Tf [<5265> 30 <76> 25 <656e756520a334312c383530>] TJ ET
 * Kerning offsets between hex chunks are positioning only, so concatenating the chunks in
 * order reproduces the string. Image streams (FlateDecode binary) are skipped.
 */

// WinAnsi bytes that differ from Latin-1 and that our renderer can emit.
const WINANSI = {
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”',
  0x96: '–', 0x97: '—', 0x95: '•', 0x85: '…',
  0xa3: '£', 0xb7: '·', 0xa9: '©',
};

function decodeHex(hex) {
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const b = parseInt(hex.substr(i, 2), 16);
    if (Number.isNaN(b)) continue;
    out += WINANSI[b] != null ? WINANSI[b] : String.fromCharCode(b);
  }
  return out;
}

function decodeLiteral(s) {
  return s
    .replace(/\\(\d{1,3})/g, (_, oct) => {
      const b = parseInt(oct, 8);
      return WINANSI[b] != null ? WINANSI[b] : String.fromCharCode(b);
    })
    .replace(/\\([()\\])/g, '$1');
}

/** Content streams only: skip anything with a /Filter (compressed) or image subtype. */
function contentStreams(latin1) {
  const streams = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m;
  while ((m = re.exec(latin1)) !== null) {
    const dictStart = Math.max(0, m.index - 400);
    const dict = latin1.slice(dictStart, m.index);
    if (/\/Filter/.test(dict) || /\/Subtype\s*\/Image/.test(dict)) continue;
    streams.push(m[1]);
  }
  return streams;
}

/**
 * @param {Buffer} buf  the PDF file
 * @returns {{ text: string, imageCount: number, pageCount: number }}
 */
function pdfText(buf) {
  const latin1 = buf.toString('latin1');
  const parts = [];

  for (const stream of contentStreams(latin1)) {
    // TJ arrays: [ <hex> 12 <hex> ] TJ   /   ( literal ) Tj
    const opRe = /\[([\s\S]*?)\]\s*TJ|\(((?:\\.|[^)])*)\)\s*Tj|<([0-9a-fA-F\s]*)>\s*Tj/g;
    let om;
    while ((om = opRe.exec(stream)) !== null) {
      if (om[1] != null) {
        const chunks = [...om[1].matchAll(/<([0-9a-fA-F\s]*)>|\(((?:\\.|[^)])*)\)/g)];
        parts.push(
          chunks
            .map((c) => (c[1] != null ? decodeHex(c[1].replace(/\s+/g, '')) : decodeLiteral(c[2] || '')))
            .join('')
        );
      } else if (om[2] != null) {
        parts.push(decodeLiteral(om[2]));
      } else if (om[3] != null) {
        parts.push(decodeHex(om[3].replace(/\s+/g, '')));
      }
    }
    parts.push('\n');
  }

  return {
    text: parts.join('\n'),
    imageCount: (latin1.match(/\/Subtype\s*\/Image/g) || []).length,
    pageCount: (latin1.match(/\/Type\s*\/Page[^s]/g) || []).length,
  };
}

module.exports = { pdfText };
