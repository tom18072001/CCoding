// Tamper-evident audit log.
import { createHash } from 'node:crypto';

const ZERO_HASH = '0'.repeat(64);

// Compare strings by Unicode code point (not UTF-16 code unit).
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

const skipped = (v) => v === undefined || typeof v === 'function' || typeof v === 'symbol';

function canon(value) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => (skipped(v) ? 'null' : canon(v))).join(',') + ']';
  }
  // Boxed primitives serialize as their primitive, as in JSON.stringify.
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    return JSON.stringify(value);
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoints)) {
    const v = value[k];
    if (skipped(v)) continue;
    parts.push(JSON.stringify(k) + ':' + canon(v));
  }
  return '{' + parts.join(',') + '}';
}

export function canonicalize(value) {
  return skipped(value) ? undefined : canon(value);
}

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const PHONE_RE = /(?<![0-9])(?:0|\+84)[35789][0-9]{8}(?![0-9])/g;

function redactString(s) {
  // E-mails first so digits inside an address are consumed with it.
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(value) {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  // Resolve toJSON first so PII it produces cannot bypass redaction.
  if (typeof value.toJSON === 'function') return redactValue(value.toJSON());
  if (Array.isArray(value)) return value.map(redactValue);
  if (value instanceof String) return redactString(String(value));
  if (value instanceof Number || value instanceof Boolean) return value.valueOf();
  const out = {};
  for (const k of Object.keys(value)) out[k] = redactValue(value[k]);
  return out;
}

export function redact(entry) {
  return redactValue(entry);
}

function hashRecord(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const last = chain[chain.length - 1];
  const seq = chain.length;
  const prev = last ? last.hash : ZERO_HASH;
  const safe = redact(entry);
  const record = { seq, prev, entry: safe, hash: hashRecord(seq, prev, safe) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  if (!Array.isArray(chain)) return { ok: false, index: 0 };
  let prev = ZERO_HASH;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    let good = false;
    try {
      good =
        r !== null && typeof r === 'object' &&
        r.seq === i && r.prev === prev && typeof r.hash === 'string' &&
        r.hash === hashRecord(i, prev, r.entry);
    } catch { good = false; }
    if (!good) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
