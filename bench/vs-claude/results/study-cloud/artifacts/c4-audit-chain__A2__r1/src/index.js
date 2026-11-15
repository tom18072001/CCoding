// Tamper-evident audit log.
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);

function cmpCodePoint(a, b) {
  const ia = a[Symbol.iterator](), ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next(), y = ib.next();
    if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
    const d = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (d) return d;
  }
}

// Returns the canonical string, or undefined where JSON.stringify yields undefined.
function ser(value, key) {
  if (value !== null && (typeof value === 'object' || typeof value === 'bigint') && typeof value.toJSON === 'function') {
    value = value.toJSON(key);
  }
  if (value !== null && typeof value === 'object') {
    if (value instanceof Number || value instanceof String || value instanceof Boolean) value = value.valueOf();
  }
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined': case 'function': case 'symbol': return undefined;
    case 'string': case 'number': case 'boolean': return JSON.stringify(value);
    case 'bigint': throw new TypeError('Do not know how to serialize a BigInt');
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v, i) => ser(v, String(i)) ?? 'null').join(',') + ']';
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoint)) {
    const s = ser(value[k], k);
    if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

export function canonicalize(value) {
  return ser(value, '');
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<![0-9])(?:0|\+84)[35789][0-9]{8}(?![0-9])/g;

function redactString(s) {
  // E-mails first so digits in a local part cannot leave a half-redacted address.
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function red(v, key) {
  if (v !== null && typeof v === 'object' && typeof v.toJSON === 'function') v = v.toJSON(key);
  if (typeof v === 'string') return redactString(v);
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x, i) => red(x, String(i)));
  if (v instanceof Number || v instanceof Boolean) return v.valueOf();
  if (v instanceof String) return redactString(v.valueOf());
  return Object.fromEntries(Object.keys(v).map((k) => [k, red(v[k], k)]));
}

export function redact(entry) {
  return red(entry, '');
}

function hashOf(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const clean = redact(entry);
  const last = chain[chain.length - 1];
  const seq = chain.length;
  const prev = last ? last.hash : GENESIS;
  const record = { seq, prev, entry: clean, hash: hashOf(seq, prev, clean) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  if (!Array.isArray(chain)) return { ok: false, index: 0 };
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    let good = false;
    try {
      good = r !== null && typeof r === 'object' && r.seq === i && r.prev === prev &&
        typeof r.hash === 'string' && r.hash === hashOf(r.seq, r.prev, r.entry);
    } catch { good = false; }
    if (!good) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
