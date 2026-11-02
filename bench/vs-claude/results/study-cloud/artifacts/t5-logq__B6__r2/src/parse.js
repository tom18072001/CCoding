'use strict';

const FAIL = () => ({ ok: false });
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix + k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key + '.', out);
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
  const isWs = (c) => c === ' ' || c === '\t';
  while (i < n) {
    while (i < n && isWs(s[i])) i++;
    if (i >= n) break;
    const m = KEY_RE.exec(s.slice(i));
    if (!m) return null;
    const key = m[0];
    i += key.length;
    if (s[i] !== '=') return null;
    i++;
    let val;
    if (s[i] === '"') {
      i++;
      let out = '';
      let closed = false;
      while (i < n) {
        const c = s[i];
        if (c === '\\') {
          if (i + 1 >= n) return null;
          const d = s[i + 1];
          if (d === '"') out += '"';
          else if (d === '\\') out += '\\';
          else if (d === 'n') out += '\n';
          else if (d === 't') out += '\t';
          else out += '\\' + d;
          i += 2;
        } else if (c === '"') {
          closed = true;
          i++;
          break;
        } else {
          out += c;
          i++;
        }
      }
      if (!closed) return null;
      if (i < n && !isWs(s[i])) return null;
      val = out;
    } else {
      const start = i;
      while (i < n && !isWs(s[i]) && s[i] !== '"') i++;
      if (i < n && !isWs(s[i])) return null;
      const raw = s.slice(start, i);
      if (NUM_RE.test(raw)) val = Number(raw);
      else if (raw === 'true') val = true;
      else if (raw === 'false') val = false;
      else if (raw === 'null') val = null;
      else val = raw;
    }
    rec[key] = val;
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
  if (typeof line !== 'string') return FAIL();
  const s = line.endsWith('\r') ? line.slice(0, -1) : line;
  const trimmed = s.trim();
  if (trimmed === '') return FAIL();
  let rec;
  if (trimmed[0] === '{') {
    let obj;
    try {
      obj = JSON.parse(s);
    } catch (e) {
      return FAIL();
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return FAIL();
    rec = flatten(obj, '', {});
  } else {
    rec = parseLogfmt(s);
    if (rec === null) return FAIL();
  }
  addTime(rec);
  return { ok: true, record: rec };
}

module.exports = { parseLine };
