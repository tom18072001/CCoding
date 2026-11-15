'use strict';

const NUM_RE = /^-?\d+(\.\d+)?$/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*/;
const WS = new Set([' ', '\t', '\n', '\v', '\f', '\r']);

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else setOwn(out, name, v);
  }
}

function parseLogfmt(line) {
  const rec = {};
  const n = line.length;
  let i = 0;
  while (i < n) {
    if (WS.has(line[i])) { i++; continue; }
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
          else s += c + d;
          i += 2;
        } else if (c === '"') {
          closed = true;
          i++;
          break;
        } else { s += c; i++; }
      }
      if (!closed) return null;
      if (i < n && !WS.has(line[i])) return null;
      value = s;
    } else {
      const start = i;
      while (i < n && !WS.has(line[i])) {
        if (line[i] === '"') return null;
        i++;
      }
      const raw = line.slice(start, i);
      if (NUM_RE.test(raw)) value = Number(raw);
      else if (raw === 'true') value = true;
      else if (raw === 'false') value = false;
      else if (raw === 'null') value = null;
      else value = raw;
    }
    setOwn(rec, key, value);
  }
  return rec;
}

function addTime(rec) {
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}/.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) setOwn(rec, '@t', t);
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
