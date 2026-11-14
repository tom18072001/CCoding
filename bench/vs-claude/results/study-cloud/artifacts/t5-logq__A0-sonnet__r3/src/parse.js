'use strict';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function parseLogfmt(line) {
  const rec = {};
  const n = line.length;
  let i = 0;
  const isWs = (c) => c === ' ' || c === '\t';
  while (i < n) {
    while (i < n && isWs(line[i])) i++;
    if (i >= n) break;
    let j = i;
    while (j < n && line[j] !== '=' && !isWs(line[j])) j++;
    if (j >= n || line[j] !== '=') return null;
    const key = line.slice(i, j);
    if (!KEY_RE.test(key)) return null;
    i = j + 1;
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
      let k = i;
      while (k < n && !isWs(line[k])) {
        if (line[k] === '"') return null;
        k++;
      }
      const raw = line.slice(i, k);
      i = k;
      if (NUM_RE.test(raw)) value = Number(raw);
      else if (raw === 'true') value = true;
      else if (raw === 'false') value = false;
      else if (raw === 'null') value = null;
      else value = raw;
    }
    rec[key] = value;
  }
  return rec;
}

function parseLine(line) {
  if (typeof line !== 'string') return { ok: false };
  line = line.replace(/\r$/, '');
  const trimmed = line.trim();
  if (trimmed === '') return { ok: false };
  let record;
  if (trimmed[0] === '{') {
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch (e) {
      return { ok: false };
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false };
    record = flatten(obj, '', {});
  } else {
    record = parseLogfmt(line);
    if (record === null) return { ok: false };
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
