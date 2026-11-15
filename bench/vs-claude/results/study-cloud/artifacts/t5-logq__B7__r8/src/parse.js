'use strict';

const KEY_RE = /[A-Za-z_][A-Za-z0-9_.-]*/y;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const WS = new Set([' ', '\t']);

function setKey(obj, k, v) {
  Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function flatten(value, prefix, out) {
  for (const k of Object.keys(value)) {
    const v = value[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else setKey(out, name, v);
  }
}

function parseLogfmt(line) {
  const rec = {};
  const n = line.length;
  let i = 0;
  while (i < n) {
    if (WS.has(line[i])) { i++; continue; }
    KEY_RE.lastIndex = i;
    const m = KEY_RE.exec(line);
    if (!m) return null;
    const key = m[0];
    i += key.length;
    if (line[i] !== '=') return null;
    i++;
    let val;
    if (line[i] === '"') {
      i++;
      let s = '';
      let closed = false;
      while (i < n) {
        const c = line[i];
        if (c === '\\' && i + 1 < n) {
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
      if (i < n && !WS.has(line[i])) return null;
      val = s;
    } else {
      let j = i;
      while (j < n && !WS.has(line[j])) {
        if (line[j] === '"') return null;
        j++;
      }
      const raw = line.slice(i, j);
      i = j;
      if (NUM_RE.test(raw)) val = Number(raw);
      else if (raw === 'true') val = true;
      else if (raw === 'false') val = false;
      else if (raw === 'null') val = null;
      else val = raw;
    }
    setKey(rec, key, val);
  }
  return rec;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}/;

function addTime(rec) {
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
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
  if (typeof line !== 'string') return { ok: false };
  if (line.endsWith('\r')) line = line.slice(0, -1);
  if (line.trim() === '') return { ok: false };
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
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
