'use strict';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const TS_FIELDS = ['@timestamp', 'ts', 'time'];
const WS = new Set([' ', '\t']);

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix === '' ? k : prefix + '.' + k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, name, out);
    } else {
      setOwn(out, name, v);
    }
  }
  return out;
}

function coerceBare(s) {
  if (NUM_RE.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  return s;
}

function parseLogfmt(line) {
  const rec = {};
  const n = line.length;
  let i = 0;
  let any = false;
  while (i < n) {
    if (WS.has(line[i])) { i++; continue; }
    // key
    let j = i;
    while (j < n && line[j] !== '=' && !WS.has(line[j])) j++;
    if (j >= n || line[j] !== '=') return null;
    const key = line.slice(i, j);
    if (!KEY_RE.test(key)) return null;
    j++; // skip '='
    let value;
    if (line[j] === '"') {
      let k = j + 1;
      let s = '';
      let closed = false;
      while (k < n) {
        const c = line[k];
        if (c === '\\' && k + 1 < n) {
          const d = line[k + 1];
          if (d === '"') s += '"';
          else if (d === '\\') s += '\\';
          else if (d === 'n') s += '\n';
          else if (d === 't') s += '\t';
          else s += '\\' + d;
          k += 2;
        } else if (c === '"') {
          closed = true;
          k++;
          break;
        } else {
          s += c;
          k++;
        }
      }
      if (!closed) return null;
      if (k < n && !WS.has(line[k])) return null;
      value = s;
      j = k;
    } else {
      let k = j;
      while (k < n && !WS.has(line[k])) {
        if (line[k] === '"') return null;
        k++;
      }
      value = coerceBare(line.slice(j, k));
      j = k;
    }
    setOwn(rec, key, value);
    any = true;
    i = j;
  }
  return any ? rec : null;
}

function addTime(rec) {
  for (const f of TS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && TS_RE.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) setOwn(rec, '@t', t);
      }
      return;
    }
  }
}

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  line = line.replace(/\r+$/, '');
  if (line.trim() === '') return { ok: false };
  let rec;
  const first = line.trimStart()[0];
  if (first === '{') {
    let obj;
    try { obj = JSON.parse(line); } catch (e) { return { ok: false }; }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
    rec = flatten(obj, '', {});
  } else {
    rec = parseLogfmt(line);
    if (rec === null) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
