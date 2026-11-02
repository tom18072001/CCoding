// Tamper-evident audit log: canonical JSON, PII redaction, SHA-256 hash chain.
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);

const cmpCodePoint = (a, b) => {
  const ia = a[Symbol.iterator](), ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next(), y = ib.next();
    if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
    const d = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (d) return d;
  }
};

const unwrap = (v) => (v !== null && typeof v === 'object' && typeof v.toJSON === 'function' ? v.toJSON() : v);

export function canonicalize(value) {
  value = unwrap(value);
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v) ?? 'null').join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    // Boxed primitives behave like JSON.stringify
    if (value instanceof Number || value instanceof String || value instanceof Boolean) return JSON.stringify(value);
    const parts = [];
    for (const k of Object.keys(value).sort(cmpCodePoint)) {
      const s = canonicalize(value[k]);
      if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
    }
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(value);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<!\d)(?:0|\+84)[35789]\d{8}(?!\d)/g;

const redactString = (s) => s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');

function redactValue(v) {
  v = unwrap(v); // toJSON output (e.g. strings) must be redacted too
  if (typeof v === 'string') return redactString(v);
  if (Array.isArray(v)) return v.map(redactValue);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).map((k) => [k, redactValue(v[k])]));
  }
  return v;
}

export function redact(entry) {
  return redactValue(entry);
}

const hashOf = (seq, prev, entry) =>
  createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');

export function append(chain, entry) {
  const redacted = redact(entry);
  const last = chain[chain.length - 1];
  const seq = chain.length;
  const prev = last ? last.hash : GENESIS;
  const record = { seq, prev, entry: redacted, hash: hashOf(seq, prev, redacted) };
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
      r.hash !== hashOf(i, prev, r.entry)
    ) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
