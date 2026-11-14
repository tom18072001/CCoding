// Tamper-evident audit log with PII redaction.
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);

function cmpCodePoint(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

function canon(value, inArray) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canon(v, true)).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    // Boxed primitives etc. serialise like JSON.stringify
    if (value instanceof Number || value instanceof String || value instanceof Boolean) {
      return JSON.stringify(value);
    }
    const parts = [];
    for (const k of Object.keys(value).sort(cmpCodePoint)) {
      const s = canon(value[k], false);
      if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
    }
    return '{' + parts.join(',') + '}';
  }
  const s = JSON.stringify(value);
  if (s === undefined) return inArray ? 'null' : undefined; // undefined/function/symbol
  return s;
}

export function canonicalize(value) {
  return canon(value, false);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(v) {
  if (typeof v === 'string') return redactString(v);
  if (Array.isArray(v)) return v.map(redactValue);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = redactValue(v[k]);
    return out;
  }
  return v;
}

export function redact(entry) {
  return redactValue(entry);
}

function hashOf(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const clean = redact(entry);
  const seq = chain.length;
  const prev = seq === 0 ? GENESIS : chain[seq - 1].hash;
  const record = { seq, prev, entry: clean, hash: hashOf(seq, prev, clean) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    if (
      !r || r.seq !== i || r.prev !== prev ||
      typeof r.hash !== 'string' || r.hash !== hashOf(r.seq, r.prev, r.entry)
    ) {
      return { ok: false, index: i };
    }
    prev = r.hash;
  }
  return { ok: true };
}
