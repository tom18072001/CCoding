'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const TIME_FIELDS = ['@timestamp', 'ts', 'time'];
const ISO_RE = /^[+-]?\d{4,6}-\d{2}-\d{2}T\d{2}:\d{2}/;

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function flatten(obj, prefix, out) {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    const name = prefix ? prefix + '.' + key : key;
    if (isPlainObject(v)) flatten(v, name, out);
    else setOwn(out, name, v);
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

const isWs = (c) => c === ' ' || c === '\t';

function parseLogfmt(s) {
  const rec = {};
  const n = s.length;
  let i = 0;
  while (i < n) {
    if (isWs(s[i])) { i++; continue; }
    const eq = s.indexOf('=', i);
    if (eq === -1) return null;
    const key = s.slice(i, eq);
    if (!KEY_RE.test(key)) return null;
    i = eq + 1;
    let value;
    if (s[i] === '"') {
      i++;
      let buf = '';
      let closed = false;
      while (i < n) {
        const c = s[i];
        if (c === '\\') {
          if (i + 1 >= n) return null;
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
      if (i < n && !isWs(s[i])) return null;
      value = buf;
    } else {
      let j = i;
      while (j < n && !isWs(s[j])) {
        if (s[j] === '"') return null;
        j++;
      }
      value = coerce(s.slice(i, j));
      i = j;
    }
    setOwn(rec, key, value);
  }
  return rec;
}

function addTime(rec) {
  for (const f of TIME_FIELDS) {
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
  const s = line.endsWith('\r') ? line.slice(0, -1) : line;
  const trimmed = s.trim();
  if (trimmed === '') return { ok: false };
  let rec;
  if (trimmed[0] === '{') {
    let obj;
    try { obj = JSON.parse(s); } catch (e) { return { ok: false }; }
    if (!isPlainObject(obj)) return { ok: false };
    rec = flatten(obj, '', {});
  } else {
    rec = parseLogfmt(s);
    if (rec === null) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
