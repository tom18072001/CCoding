'use strict';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}/;
const WS = new Set([' ', '\t']);

function setKey(obj, k, v) {
  Object.defineProperty(obj, k, { value: v, writable: true, enumerable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else setKey(out, name, v);
  }
}

function parseBare(s) {
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
  while (i < n) {
    while (i < n && WS.has(line[i])) i++;
    if (i >= n) break;
    let j = i;
    while (j < n && line[j] !== '=' && !WS.has(line[j])) j++;
    if (j >= n || line[j] !== '=') return null;
    const key = line.slice(i, j);
    if (!KEY_RE.test(key)) return null;
    i = j + 1;
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
        } else if (c === '"') {
          closed = true;
          i++;
          break;
        } else {
          s += c;
          i++;
        }
      }
      if (!closed) return null;
      if (i < n && !WS.has(line[i])) return null;
      value = s;
    } else {
      let k = i;
      while (k < n && !WS.has(line[k])) {
        if (line[k] === '"') return null;
        k++;
      }
      value = parseBare(line.slice(i, k));
      i = k;
    }
    setKey(rec, key, value);
  }
  return rec;
}

function addTime(rec) {
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && ISO_RE.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) setKey(rec, '@t', t);
      }
      return;
    }
  }
}

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  line = line.replace(/\r$/, '');
  if (/^\s*$/.test(line)) return { ok: false };
  let rec;
  if (line.trimStart()[0] === '{') {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      return { ok: false };
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
    rec = {};
    flatten(obj, '', rec);
  } else {
    rec = parseLogfmt(line);
    if (rec === null) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
