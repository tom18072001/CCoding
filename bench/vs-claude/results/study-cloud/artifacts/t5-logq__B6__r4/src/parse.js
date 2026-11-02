'use strict';

const FAIL = Object.freeze({ ok: false });
const KEY_RE = /[A-Za-z_][A-Za-z0-9_.-]*/y;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const isWs = (c) => c === ' ' || c === '\t';

function set(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    const name = prefix ? prefix + '.' + key : key;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else set(out, name, v);
  }
  return out;
}

function coerce(raw) {
  if (NUM_RE.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  return raw;
}

function parseLogfmt(line) {
  const rec = {};
  const n = line.length;
  let i = 0;
  while (i < n) {
    if (isWs(line[i])) { i++; continue; }
    KEY_RE.lastIndex = i;
    const m = KEY_RE.exec(line);
    if (!m) return null;
    const key = m[0];
    i += key.length;
    if (line[i] !== '=') return null;
    i++;
    let value;
    if (line[i] === '"') {
      i++;
      let s = '';
      let closed = false;
      while (i < n) {
        const c = line[i];
        if (c === '\\' && i + 1 < n) {
          const d = line[i + 1];
          if (d === '"') s += '"';
          else if (d === '\\') s += '\\';
          else if (d === 'n') s += '\n';
          else if (d === 't') s += '\t';
          else s += c + d;
          i += 2;
        } else if (c === '"') { closed = true; i++; break; }
        else { s += c; i++; }
      }
      if (!closed) return null;
      if (i < n && !isWs(line[i])) return null;
      value = s;
    } else {
      const start = i;
      while (i < n && !isWs(line[i])) {
        if (line[i] === '"') return null;
        i++;
      }
      value = coerce(line.slice(start, i));
    }
    set(rec, key, value);
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
  if (line.endsWith('\r')) line = line.slice(0, -1);
  const trimmed = line.trim();
  if (trimmed === '') return FAIL;
  let rec;
  if (trimmed[0] === '{') {
    let obj;
    try { obj = JSON.parse(line); } catch (e) { return FAIL; }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return FAIL;
    rec = flatten(obj, '', {});
  } else {
    rec = parseLogfmt(line);
    if (rec === null) return FAIL;
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
