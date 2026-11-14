'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const KEY_RE = /[A-Za-z_][A-Za-z0-9_.-]*/y;
const TS_FIELDS = ['@timestamp', 'ts', 'time'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}/;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    const full = prefix === '' ? key : prefix + '.' + key;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, full, out);
    else setOwn(out, full, v);
  }
  return out;
}

const isWs = (c) => c === ' ' || c === '\t';

function parseLogfmt(line) {
  const rec = {};
  const n = line.length;
  let i = 0;
  while (i < n && isWs(line[i])) i++;
  while (i < n) {
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
        if (c === '\\') {
          if (i + 1 >= n) return null;
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
      const raw = line.slice(start, i);
      if (NUM_RE.test(raw)) value = Number(raw);
      else if (raw === 'true') value = true;
      else if (raw === 'false') value = false;
      else if (raw === 'null') value = null;
      else value = raw;
    }
    setOwn(rec, key, value);
    while (i < n && isWs(line[i])) i++;
  }
  return rec;
}

function addTimestamp(rec) {
  for (const f of TS_FIELDS) {
    if (!hasOwn(rec, f)) continue;
    const v = rec[f];
    if (typeof v === 'string' && ISO_RE.test(v)) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) setOwn(rec, '@t', t);
    }
    return;
  }
}

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  line = line.replace(/\r+$/, '');
  const trimmed = line.trim();
  if (trimmed === '') return { ok: false };
  let rec;
  if (trimmed[0] === '{') {
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch (e) {
      return { ok: false };
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
    rec = flatten(obj, '', {});
  } else {
    rec = parseLogfmt(line);
    if (rec === null) return { ok: false };
  }
  addTimestamp(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
