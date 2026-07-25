'use strict';
/**
 * Loads credentials from a git-ignored `.env` file at the project root, so secrets can be
 * pasted once instead of exported into every shell. Real environment variables always win,
 * which is what lets a routine's Cloud Environment override the file in production.
 *
 * Never commit `.env` — it is in .gitignore, alongside `.env.*`.
 */
const fs = require('fs');
const path = require('path');

let loaded = false;

function loadEnv(root) {
  if (loaded) return;
  loaded = true;
  const file = path.join(root || path.resolve(__dirname, '..'), '.env');
  if (!fs.existsSync(file)) return;

  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // strip matching quotes, tolerate values containing '='
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

module.exports = { loadEnv };
