'use strict';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function setKey(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else setKey(out, name, v);
  }
  return out;
}

const isWs = (c) => c === ' ' || c === '\t';

function parseLogfmt(s) {
  const rec = {};
  let i = 0;
  const n = s.length;
  while (i < n) {
    if (isWs(s[i])) { i++; continue; }
    const m = KEY_RE.exec(s.slice(i));
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
          else str += c + d;
          i += 2;
        } else if (c === '"') { closed = true; i++; break; }
        else { str += c; i++; }
      }
      if (!closed) return null;
      if (i < n && !isWs(s[i])) return null;
      value = str;
    } else {
      let j = i;
      while (j < n && !isWs(s[j])) {
        if (s[j] === '"') return null;
        j++;
      }
      const raw = s.slice(i, j);
      i = j;
      if (NUM_RE.test(raw)) value = Number(raw);
      else if (raw === 'true') value = true;
      else if (raw === 'false') value = false;
      else if (raw === 'null') value = null;
      else value = raw;
    }
    setKey(rec, key, value);
  }
  return rec;
}

function addTime(rec) {
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (hasOwn(rec, f)) {
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
  const s = String(line).replace(/\r$/, '');
  if (/^\s*$/.test(s)) return { ok: false };
  let rec;
  if (s.trimStart()[0] === '{') {
    let obj;
    try { obj = JSON.parse(s); } catch (e) { return { ok: false }; }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
    rec = flatten(obj, '', {});
  } else {
    rec = parseLogfmt(s);
    if (!rec) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
