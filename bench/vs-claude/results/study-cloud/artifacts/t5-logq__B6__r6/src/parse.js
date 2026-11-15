'use strict';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const WS = /\s/;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (isPlainObject(v)) {
      flatten(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

function parseLogfmt(s) {
  const rec = {};
  const n = s.length;
  let i = 0;
  const isSp = (c) => c === ' ' || c === '\t';
  while (i < n) {
    while (i < n && isSp(s[i])) i++;
    if (i >= n) break;
    let j = i;
    while (j < n && s[j] !== '=' && !WS.test(s[j])) j++;
    if (j >= n || s[j] !== '=') return null;
    const key = s.slice(i, j);
    if (!KEY_RE.test(key)) return null;
    i = j + 1;
    let value;
    if (s[i] === '"') {
      i++;
      let buf = '';
      let closed = false;
      while (i < n) {
        const c = s[i];
        if (c === '\\') {
          if (i + 1 >= n) return null;
          const d = s[i + 1];
          if (d === '"') buf += '"';
          else if (d === '\\') buf += '\\';
          else if (d === 'n') buf += '\n';
          else if (d === 't') buf += '\t';
          else buf += '\\' + d;
          i += 2;
        } else if (c === '"') {
          closed = true;
          i++;
          break;
        } else {
          buf += c;
          i++;
        }
      }
      if (!closed) return null;
      if (i < n && !WS.test(s[i])) return null;
      value = buf;
    } else {
      let e = i;
      while (e < n && !WS.test(s[e])) {
        if (s[e] === '"') return null;
        e++;
      }
      const raw = s.slice(i, e);
      i = e;
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
  const s = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (s.trim() === '') return { ok: false };
  let rec;
  if (s.trimStart()[0] === '{') {
    let v;
    try {
      v = JSON.parse(s);
    } catch (e) {
      return { ok: false };
    }
    if (!isPlainObject(v)) return { ok: false };
    rec = flatten(v, '', {});
  } else {
    rec = parseLogfmt(s);
    if (rec === null) return { ok: false };
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
