// Tamper-evident audit log: canonical JSON, PII redaction, SHA-256 hash chain.
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);

// Compare strings by Unicode code point (UTF-16 order differs for astral chars).
function cmpCodePoints(a, b) {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next();
    const y = ib.next();
    if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
    const d = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (d !== 0) return d;
  }
}

export function canonicalize(value) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value); // undefined/function/symbol -> undefined, as JSON.stringify
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

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const PHONE_RE = /(?<![0-9])(?:\+84|0)[35789][0-9]{8}(?![0-9])/g;

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(v) {
  if (typeof v === 'string') return redactString(v);
  if (Array.isArray(v)) return v.map(redactValue);
  if (v !== null && typeof v === 'object') {
    if (typeof v.toJSON === 'function') return redactValue(v.toJSON());
    return Object.fromEntries(Object.keys(v).map((k) => [k, redactValue(v[k])]));
  }
  return v;
}

export function redact(entry) {
  return redactValue(entry);
}

function hashRecord(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const clean = redact(entry);
  const seq = chain.length;
  const prev = seq === 0 ? GENESIS : chain[seq - 1].hash;
  const record = { seq, prev, entry: clean, hash: hashRecord(seq, prev, clean) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    if (
      r === null || typeof r !== 'object' ||
      r.seq !== i || r.prev !== prev || typeof r.hash !== 'string' ||
      r.hash !== hashRecord(i, prev, r.entry)
    ) {
      return { ok: false, index: i };
    }
    prev = r.hash;
  }
  return { ok: true };
}
