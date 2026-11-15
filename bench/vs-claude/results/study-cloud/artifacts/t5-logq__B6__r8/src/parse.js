'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const KEY_RE = /[A-Za-z_][A-Za-z0-9_.-]*/y;
const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/i;
const FAIL = { ok: false };

function set(rec, k, v) {
  Object.defineProperty(rec, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else set(out, key, v);
  }
}

function coerce(raw) {
  if (NUM_RE.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  return raw;
}

function parseLogfmt(s) {
  const rec = {};
  const n = s.length;
  let i = 0;
  const isWs = (c) => c === ' ' || c === '\t';
  while (true) {
    while (i < n && isWs(s[i])) i++;
    if (i >= n) break;
    KEY_RE.lastIndex = i;
    const m = KEY_RE.exec(s);
    if (!m) return null;
    const key = m[0];
    i += key.length;
    if (s[i] !== '=') return null;
    i++;
    let val;
    if (s[i] === '"') {
      i++;
      let out = '';
      let closed = false;
      while (i < n) {
        const c = s[i];
        if (c === '\\') {
          if (i + 1 >= n) return null;
          const d = s[i + 1];
          if (d === '"') out += '"';
          else if (d === '\\') out += '\\';
          else if (d === 'n') out += '\n';
          else if (d === 't') out += '\t';
          else out += '\\' + d;
          i += 2;
        } else if (c === '"') {
          closed = true;
          i++;
          break;
        } else {
          out += c;
          i++;
        }
      }
      if (!closed) return null;
      if (i < n && !isWs(s[i])) return null;
      val = out;
    } else {
      const start = i;
      while (i < n && !isWs(s[i])) {
        if (s[i] === '"') return null;
        i++;
      }
      val = coerce(s.slice(start, i));
    }
    set(rec, key, val);
  }
  return rec;
}

function addTime(rec) {
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && ISO_RE.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) set(rec, '@t', t);
      }
      return;
    }
  }
}

function parseLine(line) {
  if (typeof line !== 'string') return FAIL;
  const s = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (s.trim() === '') return FAIL;
  let rec;
  if (s.trimStart()[0] === '{') {
    let obj;
    try { obj = JSON.parse(s); } catch (e) { return FAIL; }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return FAIL;
    rec = {};
    flatten(obj, '', rec);
  } else {
    rec = parseLogfmt(s);
    if (!rec) return FAIL;
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
