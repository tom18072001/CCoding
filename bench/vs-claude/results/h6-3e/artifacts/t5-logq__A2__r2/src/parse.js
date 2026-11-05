'use strict';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function setProp(obj, key, value) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function flatten(value, prefix, out) {
  for (const key of Object.keys(value)) {
    const v = value[key];
    const path = prefix ? prefix + '.' + key : key;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, path, out);
    } else {
      setProp(out, path, v);
    }
  }
}

function parseLogfmt(line) {
  const rec = {};
  const n = line.length;
  let i = 0;
  const isWs = (c) => c === ' ' || c === '\t';
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
      let j = i;
      while (j < n && !isWs(line[j])) {
        if (line[j] === '"') return null;
        j++;
      }
      const raw = line.slice(i, j);
      i = j;
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
