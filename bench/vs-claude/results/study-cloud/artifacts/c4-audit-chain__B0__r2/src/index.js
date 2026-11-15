// Tamper-evident audit log: canonical JSON, PII redaction, hash chain.
import { createHash } from 'node:crypto';

const ZERO_HASH = '0'.repeat(64);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;

// Compare strings by Unicode code point (default sort compares UTF-16 code units).
function cmpCodePoints(a, b) {
  const x = [...a];
  const y = [...b];
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

function isSkipped(v) {
  return v === undefined || typeof v === 'function' || typeof v === 'symbol';
}

function ser(value, stack) {
  let v = value;
  if (v !== null && typeof v === 'object' && typeof v.toJSON === 'function') v = v.toJSON();
  if (v !== null && typeof v === 'object' &&
      (v instanceof Number || v instanceof String || v instanceof Boolean)) {
    v = v.valueOf();
  }
  if (v === null) return 'null';
  if (typeof v === 'bigint') throw new TypeError('Do not know how to serialize a BigInt');
  if (typeof v !== 'object') return JSON.stringify(v); // string, number, boolean (undefined/fn/symbol handled by callers)
  if (stack.includes(v)) throw new TypeError('Converting circular structure to JSON');
  stack.push(v);
  let out;
  if (Array.isArray(v)) {
    out = '[' + v.map((el) => (isSkipped(el) ? 'null' : ser(el, stack) ?? 'null')).join(',') + ']';
  } else {
    const parts = [];
    for (const k of Object.keys(v).sort(cmpCodePoints)) {
      const val = v[k];
      if (isSkipped(val)) continue;
      const s = ser(val, stack);
      if (s === undefined) continue; // toJSON returned undefined
      parts.push(JSON.stringify(k) + ':' + s);
    }
    out = '{' + parts.join(',') + '}';
  }
  stack.pop();
  return out;
}

export function canonicalize(value) {
  if (isSkipped(value)) return undefined; // same as JSON.stringify
  return ser(value, []);
}

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

export function redact(entry) {
  if (typeof entry === 'string') return redactString(entry);
  if (Array.isArray(entry)) return entry.map(redact);
  if (entry !== null && typeof entry === 'object') {
    return Object.fromEntries(Object.keys(entry).map((k) => [k, redact(entry[k])]));
  }
  return entry;
}

function hashRecord(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const red = redact(entry); // only the redacted copy ever reaches the hash
  const seq = chain.length;
  const prev = seq === 0 ? ZERO_HASH : chain[seq - 1].hash;
  const record = { seq, prev, entry: red, hash: hashRecord(seq, prev, red) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = ZERO_HASH;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    if (r === null || typeof r !== 'object') return { ok: false, index: i };
    if (r.seq !== i || r.prev !== prev) return { ok: false, index: i };
    let bad;
    try {
      bad = r.hash !== hashRecord(i, r.prev, r.entry) ||
        canonicalize(redact(r.entry)) !== canonicalize(r.entry);
    } catch {
      bad = true;
    }
    if (bad) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
