'use strict';

const KEY_RE = /[A-Za-z_][A-Za-z0-9_.-]*/y;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const WS_RE = /[ \t]/;

function setProp(obj, k, v) {
  Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else setProp(out, name, v);
  }
}

function parseLogfmt(s) {
  const rec = {};
  let i = 0;
  const n = s.length;
  let any = false;
  for (;;) {
    while (i < n && WS_RE.test(s[i])) i++;
    if (i >= n) break;
    KEY_RE.lastIndex = i;
    const m = KEY_RE.exec(s);
    if (!m) return null;
    const key = m[0];
    i += key.length;
    if (s[i] !== '=') return null;
    i++;
    let value;
    if (s[i] === '"') {
      i++;
      let buf = '';
      let closed = false;
      while (i < n) {
        const c = s[i];
        if (c === '\\' && i + 1 < n) {
          const d = s[i + 1];
          if (d === '"') buf += '"';
          else if (d === '\\') buf += '\\';
          else if (d === 'n') buf += '\n';
          else if (d === 't') buf += '\t';
          else buf += '\\' + d;
          i += 2;
        } else if (c === '"') {
          closed = true;
          i++;
          break;
        } else {
          buf += c;
          i++;
        }
      }
      if (!closed) return null;
      if (i < n && !WS_RE.test(s[i])) return null;
      value = buf;
    } else {
      let j = i;
      while (j < n && !WS_RE.test(s[j])) {
        if (s[j] === '"') return null;
        j++;
      }
      const raw = s.slice(i, j);
      i = j;
      if (NUM_RE.test(raw)) value = Number(raw);
      else if (raw === 'true') value = true;
      else if (raw === 'false') value = false;
      else if (raw === 'null') value = null;
      else value = raw;
    }
    setProp(rec, key, value);
    any = true;
  }
  return any ? rec : null;
}

function addTime(rec) {
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) rec['@t'] = t;
      }
      return;
    }
  }
}

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  const s = line.replace(/\r$/, '');
  if (s.trim() === '') return { ok: false };
  let rec;
  const first = s.trimStart()[0];
  if (first === '{') {
    let obj;
    try { obj = JSON.parse(s); } catch (e) { return { ok: false }; }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
    rec = {};
    flatten(obj, '', rec);
  } else {
    rec = parseLogfmt(s);
    if (!rec) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
