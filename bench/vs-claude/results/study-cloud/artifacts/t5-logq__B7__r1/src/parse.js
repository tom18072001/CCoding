'use strict';

const KEY_RE = /[A-Za-z_][A-Za-z0-9_.-]*/y;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function setProp(obj, key, value) {
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
    else setProp(out, name, v);
  }
  return out;
}

function isWs(c) {
  return c === ' ' || c === '\t';
}

function parseLogfmt(s) {
  const rec = {};
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && isWs(s[i])) i++;
    if (i >= n) break;
    KEY_RE.lastIndex = i;
    const m = KEY_RE.exec(s);
    if (!m) return null;
    const key = m[0];
    i += key.length;
    if (s[i] !== '=') return null;
    i++;
    let value;
    if (s[i] === '"') {
      i++;
      let str = '';
      let closed = false;
      while (i < n) {
        const c = s[i];
        if (c === '\\' && i + 1 < n) {
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
      value = str;
    } else {
      const start = i;
      while (i < n && !isWs(s[i])) {
        if (s[i] === '"') return null;
        i++;
      }
      const raw = s.slice(start, i);
      if (NUM_RE.test(raw)) value = Number(raw);
      else if (raw === 'true') value = true;
      else if (raw === 'false') value = false;
      else if (raw === 'null') value = null;
      else value = raw;
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
        if (!Number.isNaN(t)) setProp(rec, '@t', t);
      }
      return;
    }
  }
}

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  const s = line.replace(/\r+$/, '');
  if (/^\s*$/.test(s)) return { ok: false };
  let rec;
  if (s.trim()[0] === '{') {
    let obj;
    try {
      obj = JSON.parse(s);
    } catch (e) {
      return { ok: false };
    }
    if (!isPlainObject(obj)) return { ok: false };
    rec = flatten(obj, '', {});
  } else {
    rec = parseLogfmt(s);
    if (!rec) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
