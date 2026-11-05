'use strict';

const FAIL = { ok: false };
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}/;

function setProp(obj, k, v) {
  Object.defineProperty(obj, k, { value: v, writable: true, enumerable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, name, out);
    } else {
      setProp(out, name, v);
    }
  }
  return out;
}

function bare(v) {
  if (NUM_RE.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  return v;
}

const isWs = (c) => c === ' ' || c === '\t';

function parseLogfmt(s) {
  const rec = {};
  const n = s.length;
  let i = 0;
  while (i < n) {
    while (i < n && isWs(s[i])) i++;
    if (i >= n) break;
    const m = KEY_RE.exec(s.slice(i));
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
        if (c === '\\') {
          if (i + 1 >= n) return null;
          const d = s[i + 1];
          if (d === '"') str += '"';
          else if (d === '\\') str += '\\';
          else if (d === 'n') str += '\n';
          else if (d === 't') str += '\t';
          else str += '\\' + d;
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
      if (i < n && !isWs(s[i])) return null;
      val = str;
    } else {
      let j = i;
      while (j < n && !isWs(s[j])) {
        if (s[j] === '"') return null;
        j++;
      }
      val = bare(s.slice(i, j));
      i = j;
    }
    setProp(rec, key, val);
  }
  return rec;
}

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
  if (typeof line !== 'string') return FAIL;
  const s = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (s.trim() === '') return FAIL;
  let rec;
  if (s.trimStart()[0] === '{') {
    let obj;
    try {
      obj = JSON.parse(s);
    } catch (e) {
      return FAIL;
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return FAIL;
    rec = flatten(obj, '', {});
  } else {
    rec = parseLogfmt(s);
    if (!rec) return FAIL;
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
