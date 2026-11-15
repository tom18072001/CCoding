// Tamper-evident audit log.
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;

// Compare strings by Unicode code point (not UTF-16 code unit).
function cmpCodePoints(a, b) {
  const x = Array.from(a, (c) => c.codePointAt(0));
  const y = Array.from(b, (c) => c.codePointAt(0));
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

export function canonicalize(value) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value); // undefined/function/symbol -> undefined
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v) ?? 'null').join(',') + ']';
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoints)) {
    const s = canonicalize(value[k]);
    if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

export function redact(entry) {
  if (typeof entry === 'string') return redactString(entry);
  if (entry === null || typeof entry !== 'object') return entry;
  if (typeof entry.toJSON === 'function') return redact(entry.toJSON());
  if (Array.isArray(entry)) return entry.map(redact);
  const out = {};
  for (const k of Object.keys(entry)) {
    Object.defineProperty(out, k, {
      value: redact(entry[k]), enumerable: true, writable: true, configurable: true,
    });
  }
  return out;
}

function hashOf(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const seq = chain.length;
  const prev = seq === 0 ? GENESIS : chain[seq - 1].hash;
  const red = redact(entry);
  const record = { seq, prev, entry: red, hash: hashOf(seq, prev, red) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    if (
      !r || typeof r !== 'object' || r.seq !== i || r.prev !== prev ||
      typeof r.hash !== 'string' || r.hash !== hashOf(i, r.prev, r.entry)
    ) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
