'use strict';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const TS_FIELDS = ['@timestamp', 'ts', 'time'];

function set(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix + k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, name + '.', out);
    } else {
      set(out, name, v);
    }
  }
}

const isWs = (c) => c === ' ' || c === '\t';

function parseLogfmt(s) {
  const rec = {};
  const n = s.length;
  let i = 0;
  while (i < n) {
    while (i < n && isWs(s[i])) i++;
    if (i >= n) break;
    let j = i;
    while (j < n && s[j] !== '=' && !isWs(s[j])) j++;
    if (j >= n || s[j] !== '=') return null;
    const key = s.slice(i, j);
    if (!KEY_RE.test(key)) return null;
    i = j + 1;
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
      let k = i;
      while (k < n && !isWs(s[k])) k++;
      const raw = s.slice(i, k);
      if (raw.includes('"')) return null;
      i = k;
      if (NUM_RE.test(raw)) value = Number(raw);
      else if (raw === 'true') value = true;
      else if (raw === 'false') value = false;
      else if (raw === 'null') value = null;
      else value = raw;
    }
    set(rec, key, value);
  }
  return rec;
}

function addTime(rec) {
  for (const f of TS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && TS_RE.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) set(rec, '@t', t);
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
