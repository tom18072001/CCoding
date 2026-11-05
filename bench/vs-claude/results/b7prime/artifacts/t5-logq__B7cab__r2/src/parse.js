'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const KEY_RE = /([A-Za-z_][A-Za-z0-9_.-]*)=/y;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function setProp(obj, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
  } else {
    obj[key] = value;
  }
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else setProp(out, name, v);
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
  const isWs = (c) => c === ' ' || c === '\t';
  while (true) {
    while (i < n && isWs(line[i])) i++;
    if (i >= n) break;
    KEY_RE.lastIndex = i;
    const m = KEY_RE.exec(line);
    if (!m) return null;
    const key = m[1];
    i += m[0].length;
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
      if (i < n && !isWs(line[i])) return null;
      value = s;
    } else {
      const start = i;
      while (i < n && !isWs(line[i])) {
        if (line[i] === '"') return null;
        i++;
      }
      value = bareValue(line.slice(start, i));
    }
    setProp(rec, key, value);
  }
  return rec;
}

function addTime(rec) {
  for (const f of ['@timestamp', 'ts', 'time']) {
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
  line = line.replace(/\r$/, '');
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
    if (!rec) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
