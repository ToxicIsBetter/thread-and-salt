'use strict';
/**
 * Minimal ZIP reader (a .docx is a zip). Used by GATE 2 to read the *generated*
 * document back off disk — deliberately independent of the docx writer, so the
 * check inspects the real artefact rather than trusting the library that made it.
 * Built on Node's zlib; no extra dependency.
 */
const zlib = require('zlib');

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

function readEntries(buf) {
  // locate End Of Central Directory (scan back over the optional comment)
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid zip/docx: no end-of-central-directory record');

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== CD_SIG) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const uncompressedSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function entryData(buf, entry) {
  const lo = entry.localOffset;
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const raw = buf.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`Unsupported zip compression method ${entry.method} for ${entry.name}`);
}

/** @returns {{names: string[], read: (name:string)=>Buffer|null}} */
function openZip(buffer) {
  const entries = readEntries(buffer);
  const byName = new Map(entries.map((e) => [e.name, e]));
  return {
    names: entries.map((e) => e.name),
    entries,
    read(name) {
      const e = byName.get(name);
      return e ? entryData(buffer, e) : null;
    },
  };
}

module.exports = { openZip };
