#!/usr/bin/env node
'use strict';
/**
 * Exports the real Claude Code session transcript(s) to Markdown.
 *
 * Reads the .jsonl session logs Claude Code writes under
 *   ~/.claude/projects/<project-slug>/<session-id>.jsonl
 * and renders them as a readable document: every user message, every assistant
 * reply, every tool call and its result, in order, with timestamps.
 *
 * This is a faithful conversion of what was actually said — not a reconstruction.
 *
 * Secrets: any value found in .env is redacted from the output, so the log can be
 * shared or committed without leaking credentials.
 *
 * Usage:
 *   node scripts/export-conversation.js                       # all sessions for this project
 *   node scripts/export-conversation.js --out docs/log.md     # choose the output path
 *   node scripts/export-conversation.js --no-thinking         # omit internal reasoning blocks
 *   node scripts/export-conversation.js --max-result 4000     # cap long tool outputs
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_SLUG = '-home-shyam-UbuntuCode-NegativeZero-thread-and-salt';
const SESSION_DIR = path.join(os.homedir(), '.claude', 'projects', PROJECT_SLUG);

// ---------- args ----------
const argv = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const OUT = path.resolve(ROOT, argVal('out', 'docs/CONVERSATION-LOG.md'));
const INCLUDE_THINKING = !argv.includes('--no-thinking');
const MAX_RESULT = Number(argVal('max-result', 0)) || 0; // 0 = no cap

// ---------- redaction ----------
function secretsFromEnvFile() {
  const file = path.join(ROOT, '.env');
  const secrets = [];
  if (!fs.existsSync(file)) return secrets;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!val || val.length < 6) continue;
    if (/PASS|SECRET|TOKEN|KEY/i.test(key)) {
      secrets.push({ key, val });
      const nospace = val.replace(/\s+/g, '');
      if (nospace !== val) secrets.push({ key, val: nospace });
    }
  }
  return secrets;
}
const SECRETS = secretsFromEnvFile();
let redactions = 0;
function redact(text) {
  let s = String(text);
  for (const { key, val } of SECRETS) {
    if (val && s.includes(val)) {
      s = s.split(val).join(`«REDACTED:${key}»`);
      redactions++;
    }
  }
  return s;
}

// ---------- helpers ----------
const fence = (body, lang = '') => '```' + lang + '\n' + String(body).replace(/```/g, '` ``') + '\n```';
const stamp = (iso) => (iso ? iso.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : '');

function collapse(summary, body) {
  return `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`;
}

/** A short, human label for a tool call. */
function toolSummary(name, input) {
  const i = input || {};
  const bits = [];
  if (i.description) bits.push(i.description);
  else if (i.command) bits.push(String(i.command).split('\n')[0].slice(0, 90));
  else if (i.file_path) bits.push(path.relative(ROOT, i.file_path) || i.file_path);
  else if (i.prompt) bits.push(String(i.prompt).split('\n')[0].slice(0, 90));
  else if (i.pattern) bits.push(i.pattern);
  return `🔧 <strong>${name}</strong>${bits.length ? ' — ' + escapeHtml(bits[0]) : ''}`;
}
const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function renderToolInput(name, input) {
  const i = input || {};
  if (name === 'Bash' && i.command) return fence(i.command, 'bash');
  if ((name === 'Write' || name === 'Edit') && (i.content || i.new_string)) {
    const body = i.content != null ? i.content : `--- old ---\n${i.old_string}\n--- new ---\n${i.new_string}`;
    return `\`${path.relative(ROOT, i.file_path || '') || i.file_path}\`\n\n${fence(body)}`;
  }
  return fence(JSON.stringify(i, null, 2), 'json');
}

function resultText(block) {
  const c = block.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((b) => (b.type === 'text' ? b.text : b.type === 'image' ? '[image]' : JSON.stringify(b)))
      .join('\n');
  }
  return c == null ? '' : JSON.stringify(c);
}

// ---------- read sessions ----------
if (!fs.existsSync(SESSION_DIR)) {
  console.error(`No session directory at ${SESSION_DIR}`);
  process.exit(1);
}
const sessionFiles = fs
  .readdirSync(SESSION_DIR)
  .filter((f) => f.endsWith('.jsonl'))
  .map((f) => path.join(SESSION_DIR, f))
  .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);

const records = [];
for (const file of sessionFiles) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o.type !== 'user' && o.type !== 'assistant') continue;
      if (o.isSidechain) continue; // subagent chatter lives in its own file
      if (!o.message) continue;
      records.push({ ...o, _file: path.basename(file) });
    } catch { /* skip malformed line */ }
  }
}
records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

// ---------- render ----------
const out = [];
const firstTs = records.length ? records[0].timestamp : null;
const lastTs = records.length ? records[records.length - 1].timestamp : null;

out.push('# Conversation log — Thread & Salt automated management accounts');
out.push('');
out.push(
  `Faithful export of the Claude Code session transcript(s) for this project, converted from ` +
    `\`~/.claude/projects/${PROJECT_SLUG}/*.jsonl\`.`
);
out.push('');
out.push(`- **Sessions:** ${sessionFiles.length} (${sessionFiles.map((f) => path.basename(f, '.jsonl').slice(0, 8)).join(', ')})`);
out.push(`- **Messages:** ${records.length}`);
out.push(`- **Period:** ${stamp(firstTs)} → ${stamp(lastTs)}`);
out.push(`- **Exported:** ${stamp(new Date().toISOString())}`);
out.push(`- **Internal reasoning blocks:** ${INCLUDE_THINKING ? 'included' : 'omitted'}`);
out.push(`- **Tool output:** ${MAX_RESULT ? `capped at ${MAX_RESULT} chars` : 'complete, uncapped'}`);
out.push('');
out.push('Tool calls and their results are in collapsible sections — click to expand. Credential');
out.push('values found in `.env` are redacted.');
out.push('');
out.push('---');
out.push('');

let userTurn = 0;
const pendingTools = new Map(); // tool_use id -> heading already written

for (const rec of records) {
  const msg = rec.message;
  const content = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: String(msg.content || '') }];

  if (msg.role === 'user') {
    // separate genuine user prompts from tool results fed back to the model
    const toolResults = content.filter((b) => b.type === 'tool_result');
    const texts = content.filter((b) => b.type === 'text' && String(b.text).trim());

    for (const tr of toolResults) {
      let body = redact(resultText(tr));
      if (MAX_RESULT && body.length > MAX_RESULT) {
        body = body.slice(0, MAX_RESULT) + `\n… [${body.length - MAX_RESULT} more characters truncated]`;
      }
      out.push(collapse('📤 <em>tool result</em>' + (tr.is_error ? ' — <strong>error</strong>' : ''), fence(body)));
      out.push('');
    }

    for (const t of texts) {
      const text = String(t.text);
      // system-injected reminders are noise in a human-readable log
      const cleaned = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
      if (!cleaned) continue;
      userTurn += 1;
      out.push(`## ${userTurn}. 👤 User · <sub>${stamp(rec.timestamp)}</sub>`);
      out.push('');
      out.push(redact(cleaned));
      out.push('');
    }
    continue;
  }

  // assistant
  for (const b of content) {
    if (b.type === 'thinking') {
      if (!INCLUDE_THINKING) continue;
      const th = redact(String(b.thinking || '')).trim();
      if (th) {
        out.push(collapse('🧠 <em>internal reasoning</em>', fence(th)));
        out.push('');
      }
    } else if (b.type === 'text') {
      const text = redact(String(b.text || '')).trim();
      if (text) {
        out.push(`### 🤖 Claude · <sub>${stamp(rec.timestamp)}</sub>`);
        out.push('');
        out.push(text);
        out.push('');
      }
    } else if (b.type === 'tool_use') {
      pendingTools.set(b.id, true);
      out.push(collapse(toolSummary(b.name, b.input), redact(renderToolInput(b.name, b.input))));
      out.push('');
    }
  }
}

out.push('---');
out.push('');
out.push(`*End of log — ${records.length} messages, ${userTurn} user prompts.*`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out.join('\n'));

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`✓ wrote ${path.relative(ROOT, OUT)}  (${kb} KB, ${records.length} messages, ${userTurn} user prompts)`);
console.log(`  sessions: ${sessionFiles.map((f) => path.basename(f)).join(', ')}`);
console.log(`  redactions applied: ${redactions}`);
if (SECRETS.length === 0) console.log('  (no .env secrets found to redact)');
