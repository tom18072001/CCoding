// Tamper-evident audit log: canonical JSON, PII redaction, SHA-256 hash chain.
import { createHash } from 'node:crypto';

const ZERO_HASH = '0'.repeat(64);

// Compare strings by Unicode code point (not UTF-16 code unit).
function cmpCodePoint(a, b) {
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

function canon(value, inArray) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return inArray ? 'null' : undefined;
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value); // bigint throws, like JSON
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canon(v, true)).join(',') + ']';
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoint)) {
    const s = canon(value[k], false);
    if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

export function canonicalize(value) {
  return canon(value, false);
}

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const PHONE_RE = /(?<!\d)(?:0|\+84)[35789]\d{8}(?!\d)/g;

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(v) {
  if (typeof v === 'string') return redactString(v);
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toJSON === 'function') return redactValue(v.toJSON()); // e.g. Date
  if (Array.isArray(v)) return v.map(redactValue);
  const out = {};
  for (const k of Object.keys(v)) {
    // defineProperty so a "__proto__" key stays an own data property
    Object.defineProperty(out, k, {
      value: redactValue(v[k]), enumerable: true, writable: true, configurable: true,
    });
  }
  return out;
}

export function redact(entry) {
  return redactValue(entry);
}

function hashRecord(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const prev = chain.length ? chain[chain.length - 1].hash : ZERO_HASH;
  const seq = chain.length;
  const safe = redact(entry);
  const record = { seq, prev, entry: safe, hash: hashRecord(seq, prev, safe) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = ZERO_HASH;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    let good = false;
    try {
      good = r !== null && typeof r === 'object' && r.seq === i && r.prev === prev &&
        typeof r.hash === 'string' && r.hash === hashRecord(i, prev, r.entry);
    } catch {
      good = false;
    }
    if (!good) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
