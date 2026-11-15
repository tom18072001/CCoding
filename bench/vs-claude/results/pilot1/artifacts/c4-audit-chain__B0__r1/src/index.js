// Tamper-evident audit log: canonical JSON, PII redaction, SHA-256 hash chain.
import { createHash } from 'node:crypto';

const ZERO_HASH = '0'.repeat(64);

// Compare strings by Unicode code point (not UTF-16 code unit, not locale).
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

function ser(value) {
  if (value !== null && (typeof value === 'object' || typeof value === 'bigint') && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  const t = typeof value;
  if (value === undefined || t === 'function' || t === 'symbol') return undefined;
  if (value === null || t !== 'object') return JSON.stringify(value); // BigInt throws here
  if (value instanceof Number || value instanceof String || value instanceof Boolean ||
      (typeof BigInt !== 'undefined' && value instanceof BigInt)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => ser(v) ?? 'null').join(',') + ']';
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoints)) {
    const s = ser(value[k]);
    if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

export function canonicalize(value) {
  return ser(value);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(v) {
  if (typeof v === 'string') return redactString(v);
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toJSON === 'function') return redactValue(v.toJSON());
  if (Array.isArray(v)) return v.map(redactValue);
  const out = {};
  for (const k of Object.keys(v)) {
    Object.defineProperty(out, k, {
      value: redactValue(v[k]), enumerable: true, writable: true, configurable: true,
    });
  }
  return out;
}

export function redact(entry) {
  return redactValue(entry);
}

function hashOf(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const r = redact(entry);
  const seq = chain.length;
  const prev = seq === 0 ? ZERO_HASH : chain[seq - 1].hash;
  const record = { seq, prev, entry: r, hash: hashOf(seq, prev, r) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = ZERO_HASH;
  for (let i = 0; i < chain.length; i++) {
    const rec = chain[i];
    try {
      if (rec === null || typeof rec !== 'object') return { ok: false, index: i };
      if (rec.seq !== i || rec.prev !== prev) return { ok: false, index: i };
      if (rec.hash !== hashOf(i, rec.prev, rec.entry)) return { ok: false, index: i };
      // Entry must already be redacted: PII must never be part of the hash input.
      if (canonicalize(redact(rec.entry)) !== canonicalize(rec.entry)) return { ok: false, index: i };
    } catch {
      return { ok: false, index: i };
    }
    prev = rec.hash;
  }
  return { ok: true };
}
