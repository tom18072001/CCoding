'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const KEY_RE = /[A-Za-z_][A-Za-z0-9_.-]*/y;
const ISO_RE = /^[+-]?\d{4,6}-\d{2}-\d{2}T\d{2}:\d{2}/;
const TS_FIELDS = ['@timestamp', 'ts', 'time'];

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (isPlainObject(v)) flatten(v, name, out);
    else setOwn(out, name, v);
  }
  return out;
}

function isSpace(ch) {
  return ch === ' ' || ch === '\t';
}

function bareValue(raw) {
  if (NUM_RE.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  return raw;
}

// Trả về record hoặc null nếu dòng sai dạng.
function parseLogfmt(line) {
  const rec = {};
  const n = line.length;
  let i = 0;
  while (i < n) {
    if (isSpace(line[i])) { i++; continue; }
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
        const ch = line[i];
        if (ch === '\\' && i + 1 < n) {
          const nx = line[i + 1];
          if (nx === '"') s += '"';
          else if (nx === '\\') s += '\\';
          else if (nx === 'n') s += '\n';
          else if (nx === 't') s += '\t';
          else s += ch + nx;
          i += 2;
        } else if (ch === '"') {
          closed = true;
          i++;
          break;
        } else {
          s += ch;
          i++;
        }
      }
      if (!closed) return null;
      if (i < n && !isSpace(line[i])) return null;
      value = s;
    } else {
      const start = i;
      while (i < n && !isSpace(line[i])) {
        if (line[i] === '"') return null;
        i++;
      }
      value = bareValue(line.slice(start, i));
    }
    setOwn(rec, key, value);
  }
  return rec;
}

function addTime(rec) {
  for (const f of TS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && ISO_RE.test(v)) {
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
  if (line.trimStart()[0] === '{') {
    let obj;
    try { obj = JSON.parse(line); } catch (e) { return { ok: false }; }
    if (!isPlainObject(obj)) return { ok: false };
    rec = flatten(obj, '', {});
  } else {
    rec = parseLogfmt(line);
    if (rec === null) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
