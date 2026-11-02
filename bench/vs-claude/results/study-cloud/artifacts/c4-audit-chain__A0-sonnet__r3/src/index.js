// Tamper-evident audit log.
import { createHash } from 'node:crypto';

const ZERO_HASH = '0'.repeat(64);

// Compare strings by Unicode code point (UTF-16 default order differs for astral chars).
function cmpCodePoints(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

function applyToJSON(value, key = '') {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    return value.toJSON(key);
  }
  return value;
}

export function canonicalize(value) {
  return canon(value, '');
}

function canon(value, key) {
  value = applyToJSON(value, key);
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    value = value.valueOf();
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v, i) => canon(v, String(i)) ?? 'null').join(',') + ']';
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoints)) {
    const s = canon(value[k], k);
    if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<![0-9])(?:0|\+84)[35789][0-9]{8}(?![0-9])/g;

function scrub(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(value, key) {
  value = applyToJSON(value, key);
  if (value instanceof String) value = value.valueOf();
  if (typeof value === 'string') return scrub(value);
  if (Array.isArray(value)) return value.map((v, i) => redactValue(v, String(i)));
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = redactValue(value[k], k);
    return out;
  }
  return value;
}

export function redact(entry) {
  return redactValue(entry, '');
}

function sha(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const clean = redact(entry);
  const seq = chain.length;
  const prev = seq === 0 ? ZERO_HASH : chain[seq - 1].hash;
  const record = { seq, prev, entry: clean, hash: sha(seq, prev, clean) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = ZERO_HASH;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    if (
      r === null || typeof r !== 'object' ||
      r.seq !== i || r.prev !== prev || typeof r.hash !== 'string'
    ) return { ok: false, index: i };
    let h;
    try { h = sha(r.seq, r.prev, r.entry); } catch { return { ok: false, index: i }; }
    if (h !== r.hash) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
