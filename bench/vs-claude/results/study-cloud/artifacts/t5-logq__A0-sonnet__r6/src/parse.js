'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*/;
const WS_RE = /\s/;
const TIME_FIELDS = ['@timestamp', 'ts', 'time'];

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

function bareValue(s) {
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
  for (;;) {
    while (i < n && WS_RE.test(line[i])) i++;
    if (i >= n) break;
    const m = KEY_RE.exec(line.slice(i));
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
          else s += '\\' + d;
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
      if (i < n && !WS_RE.test(line[i])) return null;
      value = s;
    } else {
      const start = i;
      while (i < n && !WS_RE.test(line[i])) {
        if (line[i] === '"') return null;
        i++;
      }
      value = bareValue(line.slice(start, i));
    }
    rec[key] = value;
  }
  return rec;
}

function addTime(rec) {
  for (const f of TIME_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}/.test(v)) {
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
  if (line.trim() === '') return { ok: false };
  let rec;
  if (line.trimStart()[0] === '{') {
    let v;
    try {
      v = JSON.parse(line);
    } catch (e) {
      return { ok: false };
    }
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return { ok: false };
    rec = flatten(v, '', {});
  } else {
    rec = parseLogfmt(line);
    if (!rec) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
