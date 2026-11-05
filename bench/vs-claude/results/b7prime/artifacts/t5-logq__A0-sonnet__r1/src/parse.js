'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function setProp(obj, k, v) {
  Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function flatten(value, prefix, out) {
  for (const k of Object.keys(value)) {
    const v = value[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else setProp(out, name, v);
  }
}

function parseLogfmt(s) {
  const rec = {};
  const n = s.length;
  let i = 0;
  const isWs = (c) => c === ' ' || c === '\t';
  while (i < n) {
    if (isWs(s[i])) { i++; continue; }
    const m = KEY_RE.exec(s.slice(i));
    if (!m) return null;
    const key = m[0];
    i += key.length;
    if (s[i] !== '=') return null;
    i++;
    let val;
    if (s[i] === '"') {
      i++;
      let str = '';
      let closed = false;
      while (i < n) {
        const c = s[i];
        if (c === '\\') {
          if (i + 1 >= n) return null;
          const d = s[i + 1];
          if (d === '"') str += '"';
          else if (d === '\\') str += '\\';
          else if (d === 'n') str += '\n';
          else if (d === 't') str += '\t';
          else str += '\\' + d;
          i += 2;
        } else if (c === '"') { closed = true; i++; break; }
        else { str += c; i++; }
      }
      if (!closed) return null;
      if (i < n && !isWs(s[i])) return null;
      val = str;
    } else {
      let j = i;
      while (j < n && !isWs(s[j])) {
        if (s[j] === '"') return null;
        j++;
      }
      const raw = s.slice(i, j);
      i = j;
      if (NUM_RE.test(raw)) val = Number(raw);
      else if (raw === 'true') val = true;
      else if (raw === 'false') val = false;
      else if (raw === 'null') val = null;
      else val = raw;
    }
    setProp(rec, key, val);
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
  line = line.replace(/\r+$/, '');
  const trimmed = line.trim();
  if (trimmed === '') return { ok: false };
  let rec;
  if (trimmed[0] === '{') {
    let obj;
    try { obj = JSON.parse(trimmed); } catch (e) { return { ok: false }; }
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
