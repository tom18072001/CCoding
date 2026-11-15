'use strict';

const KEY_RE = /[A-Za-z_][A-Za-z0-9_.-]*/y;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const WS = /[ \t\f\v]/;

function put(obj, k, v) {
  Object.defineProperty(obj, k, { value: v, writable: true, enumerable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else put(out, name, v);
  }
}

function parseLogfmt(s) {
  const rec = {};
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && WS.test(s[i])) i++;
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
          else str += c + d;
          i += 2;
        } else if (c === '"') {
          closed = true;
          i++;
          break;
        } else {
          str += c;
          i++;
        }
      }
      if (!closed) return null;
      if (i < n && !WS.test(s[i])) return null;
      val = str;
    } else {
      const start = i;
      while (i < n && !WS.test(s[i]) && s[i] !== '"') i++;
      if (i < n && s[i] === '"') return null;
      const raw = s.slice(start, i);
      if (NUM_RE.test(raw)) val = Number(raw);
      else if (raw === 'true') val = true;
      else if (raw === 'false') val = false;
      else if (raw === 'null') val = null;
      else val = raw;
    }
    put(rec, key, val);
  }
  return rec;
}

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  const s = line.replace(/\r+$/, '');
  if (s.trim() === '') return { ok: false };
  let record;
  if (s.trimStart()[0] === '{') {
    let obj;
    try {
      obj = JSON.parse(s);
    } catch (e) {
      return { ok: false };
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
    record = {};
    flatten(obj, '', record);
  } else {
    record = parseLogfmt(s);
    if (record === null) return { ok: false };
  }
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (Object.prototype.hasOwnProperty.call(record, f)) {
      const v = record[f];
      if (typeof v === 'string' && ISO_RE.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) put(record, '@t', t);
      }
      break;
    }
  }
  return { ok: true, record };
}

module.exports = { parseLine };
