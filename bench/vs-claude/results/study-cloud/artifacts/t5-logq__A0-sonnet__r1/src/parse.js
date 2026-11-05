'use strict';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}/;

function setProp(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const name = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, name, out);
    else setProp(out, name, v);
  }
}

const isWs = (c) => c === ' ' || c === '\t';

function parseLogfmt(line) {
  const rec = {};
  const n = line.length;
  let i = 0;
  while (i < n) {
    while (i < n && isWs(line[i])) i++;
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
        if (c === '\\' && i + 1 < n) {
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
      const raw = line.slice(start, i);
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

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  line = line.replace(/\r$/, '');
  if (line.trim() === '') return { ok: false };
  let record;
  if (line.trim()[0] === '{') {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      return { ok: false };
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
    record = {};
    flatten(obj, '', record);
  } else {
    record = parseLogfmt(line);
    if (!record) return { ok: false };
  }
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (Object.prototype.hasOwnProperty.call(record, f)) {
      const v = record[f];
      if (typeof v === 'string' && ISO_RE.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) record['@t'] = t;
      }
      break;
    }
  }
  return { ok: true, record };
}

module.exports = { parseLine };
