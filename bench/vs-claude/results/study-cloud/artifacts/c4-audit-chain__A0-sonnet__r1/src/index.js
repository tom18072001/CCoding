// Tamper-evident audit log.
import { createHash } from 'node:crypto';

const ZERO = '0'.repeat(64);

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
  const out = ser(value, []);
  return out; // undefined at top level, like JSON.stringify
}

function ser(value, stack) {
  if (value !== null && (typeof value === 'object' || typeof value === 'bigint') &&
      typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string': case 'number': case 'boolean':
      return JSON.stringify(value);
    case 'bigint':
      throw new TypeError('Do not know how to serialize a BigInt');
    case 'undefined': case 'function': case 'symbol':
      return undefined;
  }
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    return JSON.stringify(value);
  }
  if (stack.includes(value)) throw new TypeError('Converting circular structure');
  stack.push(value);
  let res;
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i++) parts.push(ser(value[i], stack) ?? 'null');
    res = '[' + parts.join(',') + ']';
  } else {
    const parts = [];
    for (const k of Object.keys(value).sort(cmpCodePoints)) {
      const s = ser(value[k], stack);
      if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
    }
    res = '{' + parts.join(',') + '}';
  }
  stack.pop();
  return res;
}

const EMAIL_RE = /[A-Za-z0-9._%+'\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)+/g;
const PHONE_RE = /(?<![0-9])(?:0|\+84)[35789][0-9]{8}(?![0-9])/g;

function scrub(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function red(value, stack) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (typeof value === 'string') return scrub(value);
  if (value instanceof String) return scrub(String(value));
  if (value === null || typeof value !== 'object') return value;
  if (stack.includes(value)) throw new TypeError('Converting circular structure');
  stack.push(value);
  let out;
  if (Array.isArray(value)) {
    out = value.map((v) => red(v, stack));
  } else {
    out = {};
    for (const k of Object.keys(value)) {
      Object.defineProperty(out, k, {
        value: red(value[k], stack), enumerable: true, writable: true, configurable: true,
      });
    }
  }
  stack.pop();
  return out;
}

export function redact(entry) {
  return red(entry, []);
}

function hashOf(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const seq = chain.length;
  const prev = seq === 0 ? ZERO : chain[seq - 1].hash;
  const redacted = redact(entry);
  const record = { seq, prev, entry: redacted, hash: hashOf(seq, prev, redacted) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = ZERO;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    let good = false;
    try {
      good = r !== null && typeof r === 'object' && r.seq === i && r.prev === prev &&
        typeof r.hash === 'string' && r.hash === hashOf(i, prev, r.entry);
    } catch { good = false; }
    if (!good) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
