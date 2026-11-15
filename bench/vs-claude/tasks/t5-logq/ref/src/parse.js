'use strict';
const NUM = /^-?\d+(\.\d+)?$/;
const KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const WS = (c) => c === ' ' || c === '\t';

function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function parseLogfmt(s) {
  const rec = {};
  const n = s.length;
  let i = 0;
  while (i < n) {
    while (i < n && WS(s[i])) i++;
    if (i >= n) break;
    let j = i;
    while (j < n && s[j] !== '=' && !WS(s[j])) j++;
    if (j >= n || s[j] !== '=') return null;
    const key = s.slice(i, j);
    if (!KEY.test(key)) return null;
    j++;
    let val;
    if (s[j] === '"') {
      let k = j + 1;
      let out = '';
      let closed = false;
      while (k < n) {
        const c = s[k];
        if (c === '\\' && k + 1 < n) {
          const d = s[k + 1];
          out += d === '"' ? '"' : d === '\\' ? '\\' : d === 'n' ? '\n' : d === 't' ? '\t' : '\\' + d;
          k += 2;
          continue;
        }
        if (c === '"') {
          closed = true;
          k++;
          break;
        }
        out += c;
        k++;
      }
      if (!closed) return null;
      if (k < n && !WS(s[k])) return null;
      val = out;
      i = k;
    } else {
      let k = j;
      while (k < n && !WS(s[k])) {
        if (s[k] === '"') return null;
        k++;
      }
      const raw = s.slice(j, k);
      val = NUM.test(raw) ? Number(raw) : raw === 'true' ? true : raw === 'false' ? false : raw === 'null' ? null : raw;
      i = k;
    }
    rec[key] = val;
  }
  return rec;
}

function parseLine(line) {
  const s = String(line).replace(/\r$/, '');
  if (!s.trim()) return { ok: false };
  let rec;
  if (s.trimStart()[0] === '{') {
    let v;
    try {
      v = JSON.parse(s);
    } catch {
      return { ok: false };
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false };
    rec = flatten(v, '', {});
  } else {
    rec = parseLogfmt(s);
    if (!rec) return { ok: false };
  }
  for (const f of ['@timestamp', 'ts', 'time']) {
    if (Object.prototype.hasOwnProperty.call(rec, f)) {
      const v = rec[f];
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) rec['@t'] = t;
      }
      break;
    }
  }
  return { ok: true, record: rec };
}

module.exports = { parseLine };
