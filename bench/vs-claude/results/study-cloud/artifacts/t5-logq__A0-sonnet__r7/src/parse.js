'use strict';

function setProp(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix === null ? k : prefix + '.' + k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else setProp(out, key, v);
  }
}

const KEY_RE = /[A-Za-z_][A-Za-z0-9_.-]*/y;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const WS = new Set([' ', '\t']);

function parseLogfmt(s) {
  const rec = {};
  const n = s.length;
  let i = 0;
  while (i < n) {
    if (WS.has(s[i])) { i++; continue; }
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
      let str = '';
      let closed = false;
      while (i < n) {
        const c = s[i];
        if (c === '\\' && i + 1 < n) {
          const d = s[i + 1];
          if (d === '"') str += '"';
          else if (d === '\\') str += '\\';
          else if (d === 'n') str += '\n';
          else if (d === 't') str += '\t';
          else str += '\\' + d;
          i += 2;
        } else if (c === '"') { closed = true; i++; break; }
        else { str += c; i++; }
      }
      if (!closed) return null;
      if (i < n && !WS.has(s[i])) return null;
      value = str;
    } else {
      let j = i;
      while (j < n && !WS.has(s[j])) {
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
  }
  return rec;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function addTime(rec) {
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && ISO_RE.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) setProp(rec, '@t', t);
      }
      return;
    }
  }
}

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  if (line.endsWith('\r')) line = line.slice(0, -1);
  const trimmed = line.trim();
  if (trimmed === '') return { ok: false };
  let rec;
  if (trimmed[0] === '{') {
    let obj;
    try { obj = JSON.parse(line); } catch (e) { return { ok: false }; }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
    rec = {};
    flatten(obj, null, rec);
  } else {
    rec = parseLogfmt(line);
    if (rec === null) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
