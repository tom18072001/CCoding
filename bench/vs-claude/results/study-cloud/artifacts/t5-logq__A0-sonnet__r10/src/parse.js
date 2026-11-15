'use strict';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const WS = new Set([' ', '\t']);

function setProp(obj, k, v) {
  Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else setProp(out, name, v);
  }
}

function parseLogfmt(s) {
  const rec = {};
  const n = s.length;
  let i = 0;
  while (i < n) {
    if (WS.has(s[i])) { i++; continue; }
    let j = i;
    while (j < n && s[j] !== '=' && !WS.has(s[j])) j++;
    if (j >= n || s[j] !== '=') return null;
    const key = s.slice(i, j);
    if (!KEY_RE.test(key)) return null;
    i = j + 1;
    let val;
    if (s[i] === '"') {
      let k = i + 1;
      let out = '';
      let closed = false;
      while (k < n) {
        const c = s[k];
        if (c === '\\' && k + 1 < n) {
          const d = s[k + 1];
          if (d === '"') out += '"';
          else if (d === '\\') out += '\\';
          else if (d === 'n') out += '\n';
          else if (d === 't') out += '\t';
          else out += c + d;
          k += 2;
        } else if (c === '"') { closed = true; k++; break; }
        else { out += c; k++; }
      }
      if (!closed) return null;
      if (k < n && !WS.has(s[k])) return null;
      val = out;
      i = k;
    } else {
      let k = i;
      while (k < n && !WS.has(s[k])) {
        if (s[k] === '"') return null;
        k++;
      }
      const raw = s.slice(i, k);
      if (NUM_RE.test(raw)) val = Number(raw);
      else if (raw === 'true') val = true;
      else if (raw === 'false') val = false;
      else if (raw === 'null') val = null;
      else val = raw;
      i = k;
    }
    setProp(rec, key, val);
  }
  return rec;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}/;

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  line = line.replace(/\r+$/, '');
  if (/^\s*$/.test(line)) return { ok: false };
  let rec;
  if (line.trimStart()[0] === '{') {
    let obj;
    try { obj = JSON.parse(line); } catch (e) { return { ok: false }; }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
    rec = {};
    flatten(obj, '', rec);
  } else {
    rec = parseLogfmt(line);
    if (!rec) return { ok: false };
  }
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && ISO_RE.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) setProp(rec, '@t', t);
      }
      break;
    }
  }
  return { ok: true, record: rec };
}

module.exports = { parseLine };
