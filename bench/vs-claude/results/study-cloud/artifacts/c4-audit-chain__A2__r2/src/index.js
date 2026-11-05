// Tamper-evident audit log.
import { createHash } from 'node:crypto';

const ZERO_HASH = '0'.repeat(64);

function cmpCodePoints(a, b) {
  const ia = a[Symbol.iterator](), ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next(), y = ib.next();
    if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
    const d = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (d !== 0) return d;
  }
}

// Returns a string, or undefined when JSON.stringify would yield undefined.
function ser(value, stack) {
  if (value !== null && (typeof value === 'object' || typeof value === 'bigint') &&
      typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    value = value.valueOf();
  }
  switch (typeof value) {
    case 'string': return JSON.stringify(value);
    case 'number': return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    case 'boolean': return value ? 'true' : 'false';
    case 'bigint': throw new TypeError('Do not know how to serialize a BigInt');
    case 'undefined': case 'function': case 'symbol': return undefined;
  }
  if (value === null) return 'null';
  if (stack.includes(value)) throw new TypeError('Converting circular structure');
  stack.push(value);
  let out;
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i++) parts.push(ser(value[i], stack) ?? 'null');
    out = '[' + parts.join(',') + ']';
  } else {
    const parts = [];
    for (const k of Object.keys(value).sort(cmpCodePoints)) {
      const s = ser(value[k], stack);
      if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
    }
    out = '{' + parts.join(',') + '}';
  }
  stack.pop();
  return out;
}

export function canonicalize(value) {
  return ser(value, []);
}

const EMAIL_RE = /[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}\-]+(?:\.[\p{L}\p{N}\-]+)+/gu;
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

function hashRecord(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry })).digest('hex');
}

export function append(chain, entry) {
  const safe = redact(entry);
  const seq = chain.length;
  const prev = seq === 0 ? ZERO_HASH : chain[seq - 1].hash;
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
      good = r !== null && typeof r === 'object' &&
        r.seq === i && r.prev === prev && typeof r.hash === 'string' &&
        // PII must never be part of a hashed entry
        canonicalize(redact(r.entry)) === canonicalize(r.entry) &&
        r.hash === hashRecord(i, prev, r.entry);
    } catch { good = false; }
    if (!good) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
