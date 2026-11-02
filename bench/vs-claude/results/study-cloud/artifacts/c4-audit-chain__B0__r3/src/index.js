// Tamper-evident audit log: canonical JSON, PII redaction, SHA-256 hash chain.
import { createHash } from 'node:crypto';

const ZERO = '0'.repeat(64);

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

function canon(value, key) {
  if (value !== null && (typeof value === 'object' || typeof value === 'bigint') && typeof value.toJSON === 'function') {
    value = value.toJSON(key);
  }
  if (value === null || typeof value !== 'object') {
    if (skipped(value)) return undefined;
    return JSON.stringify(value); // throws on BigInt, like JSON.stringify
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v, i) => {
      const s = canon(v, String(i));
      return s === undefined ? 'null' : s;
    }).join(',') + ']';
  }
  // Boxed primitives behave like JSON.stringify
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    return JSON.stringify(value.valueOf());
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoints)) {
    const s = canon(value[k], k);
    if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

export function canonicalize(value) {
  return canon(value, '');
}

function redactString(s) {
  return s
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g, '[PHONE]');
}

export function redact(entry) {
  if (typeof entry === 'string') return redactString(entry);
  if (Array.isArray(entry)) return entry.map(redact);
  if (entry !== null && typeof entry === 'object') {
    if (entry instanceof Date) return new Date(entry.getTime());
    const out = {};
    for (const k of Object.keys(entry)) out[k] = redact(entry[k]);
    return out;
  }
  return entry;
}

function hashOf(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const e = redact(entry);
  const seq = chain.length;
  const prev = seq ? chain[seq - 1].hash : ZERO;
  const record = { seq, prev, entry: e, hash: hashOf(seq, prev, e) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    let good = false;
    try {
      good =
        r !== null && typeof r === 'object' &&
        r.seq === i &&
        r.prev === (i === 0 ? ZERO : chain[i - 1] && chain[i - 1].hash) &&
        typeof r.hash === 'string' &&
        r.hash === hashOf(r.seq, r.prev, r.entry);
    } catch {
      good = false;
    }
    if (!good) return { ok: false, index: i };
  }
  return { ok: true };
}
