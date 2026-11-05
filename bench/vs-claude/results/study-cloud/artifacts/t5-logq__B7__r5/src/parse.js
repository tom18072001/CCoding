'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const KEY_RE = /[A-Za-z_][A-Za-z0-9_.-]*/y;
const TS_FIELDS = ['@timestamp', 'ts', 'time'];
const ISO_RE = /^\s*[+-]?\d{4,6}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function isWs(c) {
  return c === ' ' || c === '\t';
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
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
      if (i < n && !isWs(line[i])) return null;
      value = s;
    } else {
      const start = i;
      while (i < n && !isWs(line[i])) {
        if (line[i] === '"') return null;
        i++;
      }
      value = parseBare(line.slice(start, i));
    }
    rec[key] = value;
  }
  return rec;
}

function addTime(rec) {
  for (const f of TS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && ISO_RE.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) rec['@t'] = t;
      }
      return;
    }
  }
}

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  if (line.endsWith('\r')) line = line.slice(0, -1);
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
    rec = flatten(obj, '', {});
  } else {
    rec = parseLogfmt(line);
    if (!rec) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
