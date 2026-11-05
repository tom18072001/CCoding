// Tamper-evident audit log: canonical JSON, PII redaction, SHA-256 hash chain.
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);

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

function ser(value, stack) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') throw new TypeError('Do not know how to serialize a BigInt');
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    return JSON.stringify(value); // undefined stays undefined
  }
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    return JSON.stringify(value);
  }
  if (stack.includes(value)) throw new TypeError('Converting circular structure to JSON');
  stack.push(value);
  let out;
  if (Array.isArray(value)) {
    out = '[' + Array.from(value, (v) => ser(v, stack) ?? 'null').join(',') + ']';
  } else {
    const parts = [];
    for (const k of Object.keys(value).sort(cmpCodePoint)) {
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

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const PHONE_RE = /(?<![0-9])(?:\+84|0)[35789][0-9]{8}(?![0-9])/g;

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(v) {
  if (typeof v === 'string') return redactString(v);
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toJSON === 'function') {
    const j = v.toJSON();
    if (j === v) return v;
    return redactValue(j);
  }
  if (Array.isArray(v)) return Array.from(v, redactValue);
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

function computeHash(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const seq = chain.length;
  const prev = seq === 0 ? GENESIS : chain[seq - 1].hash;
  const clean = redact(entry);
  const record = { seq, prev, entry: clean, hash: computeHash(seq, prev, clean) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  if (!Array.isArray(chain)) return { ok: false, index: 0 };
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    try {
      if (!r || typeof r !== 'object' || r.seq !== i || r.prev !== prev ||
          typeof r.hash !== 'string' || r.hash !== computeHash(i, r.prev, r.entry)) {
        return { ok: false, index: i };
      }
    } catch {
      return { ok: false, index: i };
    }
    prev = r.hash;
  }
  return { ok: true };
}
