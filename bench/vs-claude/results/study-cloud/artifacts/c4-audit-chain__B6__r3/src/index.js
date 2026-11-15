// Tamper-evident audit log: hash-chained records with PII redaction.
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<!\d)(?:0|\+84)[35789]\d{8}(?!\d)/g;

// Compare strings by Unicode code point (not UTF-16 code unit).
function cmpCodePoints(a, b) {
  const x = [...a];
  const y = [...b];
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

function ser(value, key) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON(key);
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v, i) => ser(v, String(i)) ?? 'null').join(',') + ']';
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoints)) {
    const s = ser(value[k], k);
    if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

export function canonicalize(value) {
  return ser(value, '');
}

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(v) {
  if (typeof v === 'string') return redactString(v);
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toJSON === 'function') {
    // e.g. Date -> ISO string; redact the serialized form
    const j = v.toJSON();
    return j === v ? v : redactValue(j);
  }
  if (Array.isArray(v)) return v.map(redactValue);
  const out = {};
  for (const k of Object.keys(v)) out[k] = redactValue(v[k]);
  return out;
}

export function redact(entry) {
  return redactValue(entry);
}

function computeHash(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const clean = redact(entry);
  const seq = chain.length;
  const prev = seq === 0 ? GENESIS : chain[seq - 1].hash;
  const record = { seq, prev, entry: clean, hash: computeHash(seq, prev, clean) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    try {
      if (
        r === null || typeof r !== 'object' ||
        r.seq !== i || r.prev !== prev ||
        typeof r.hash !== 'string' || !('entry' in r) ||
        r.hash !== computeHash(r.seq, r.prev, r.entry)
      ) return { ok: false, index: i };
    } catch {
      return { ok: false, index: i };
    }
    prev = r.hash;
  }
  return { ok: true };
}
