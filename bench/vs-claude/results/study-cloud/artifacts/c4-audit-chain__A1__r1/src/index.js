// Tamper-evident audit log.
import { createHash } from 'node:crypto';

const ZERO_HASH = '0'.repeat(64);

function cmpCodePoint(a, b) {
  const x = Array.from(a, (c) => c.codePointAt(0));
  const y = Array.from(b, (c) => c.codePointAt(0));
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

function ser(value, key, stack) {
  if (value !== null && (typeof value === 'object' || typeof value === 'bigint') &&
      typeof value.toJSON === 'function') {
    value = value.toJSON(key);
  }
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    value = value.valueOf();
  }
  switch (typeof value) {
    case 'undefined': case 'function': case 'symbol': return undefined;
    case 'bigint': throw new TypeError('Do not know how to serialize a BigInt');
    case 'string': case 'number': case 'boolean': return JSON.stringify(value);
  }
  if (value === null) return 'null';
  if (stack.includes(value)) throw new TypeError('Converting circular structure');
  stack.push(value);
  let out;
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i++) parts.push(ser(value[i], String(i), stack) ?? 'null');
    out = '[' + parts.join(',') + ']';
  } else {
    const parts = [];
    for (const k of Object.keys(value).sort(cmpCodePoint)) {
      const s = ser(value[k], k, stack);
      if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
    }
    out = '{' + parts.join(',') + '}';
  }
  stack.pop();
  return out;
}

export function canonicalize(value) {
  return ser(value, '', []);
}

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const PHONE_RE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function red(v, key) {
  if (typeof v === 'string') return redactString(v);
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toJSON === 'function') {
    const j = v.toJSON(key);
    return j === v ? v : red(j, key);
  }
  if (v instanceof String) return redactString(v.valueOf());
  if (Array.isArray(v)) return v.map((x, i) => red(x, String(i)));
  const out = {};
  for (const k of Object.keys(v)) {
    Object.defineProperty(out, k, {
      value: red(v[k], k), enumerable: true, writable: true, configurable: true,
    });
  }
  return out;
}

export function redact(entry) {
  return red(entry, '');
}

function hashOf(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  if (!Array.isArray(chain)) throw new TypeError('chain must be an array');
  const safe = redact(entry);
  const seq = chain.length;
  const prev = seq === 0 ? ZERO_HASH : chain[seq - 1].hash;
  const record = { seq, prev, entry: safe, hash: hashOf(seq, prev, safe) };
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
      good = r !== null && typeof r === 'object' && r.seq === i && r.prev === prev &&
        typeof r.hash === 'string' && r.hash === hashOf(i, prev, r.entry);
    } catch { good = false; }
    if (!good) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
