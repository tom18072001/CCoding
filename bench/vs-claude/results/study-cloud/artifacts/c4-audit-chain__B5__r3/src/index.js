// Tamper-evident audit log: canonical JSON, PII redaction, SHA-256 hash chain.
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

function canon(value) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canon(v) ?? 'null').join(',') + ']';
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoint)) {
    const s = canon(value[k]);
    if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

export function canonicalize(value) {
  return canon(value);
}

const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(v) {
  if (typeof v === 'string') return redactString(v);
  if (Array.isArray(v)) return v.map(redactValue);
  if (v !== null && typeof v === 'object' && typeof v.toJSON !== 'function') {
    // fromEntries defines own properties (safe for "__proto__" keys)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactValue(x)]));
  }
  return v;
}

export function redact(entry) {
  return redactValue(entry);
}

function computeHash(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry }), 'utf8').digest('hex');
}

export function append(chain, entry) {
  const last = chain[chain.length - 1];
  const seq = chain.length;
  const prev = last ? last.hash : GENESIS;
  const red = redact(entry);
  const record = { seq, prev, entry: red, hash: computeHash(seq, prev, red) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  if (!Array.isArray(chain)) return { ok: false, index: 0 };
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    if (
      r === null || typeof r !== 'object' ||
      r.seq !== i || r.prev !== prev || typeof r.hash !== 'string' ||
      r.hash !== computeHash(i, prev, r.entry)
    ) return { ok: false, index: i };
    prev = r.hash;
  }
  return { ok: true };
}
