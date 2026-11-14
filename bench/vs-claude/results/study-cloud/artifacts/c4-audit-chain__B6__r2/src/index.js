// Tamper-evident audit log with PII redaction.
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;

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

export function canonicalize(value) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value); // undefined/function/symbol -> undefined
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => {
      const s = canonicalize(v);
      return s === undefined ? 'null' : s;
    }).join(',') + ']';
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoint)) {
    const s = canonicalize(value[k]);
    if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

export function redact(entry) {
  if (typeof entry === 'string') return redactString(entry);
  if (entry === null || typeof entry !== 'object') return entry;
  if (typeof entry.toJSON === 'function') return redact(entry.toJSON());
  if (Array.isArray(entry)) return entry.map(redact);
  const out = {};
  for (const k of Object.keys(entry)) out[k] = redact(entry[k]);
  return out;
}

function computeHash(seq, prev, entry) {
  return createHash('sha256').update(canonicalize({ seq, prev, entry })).digest('hex');
}

export function append(chain, entry) {
  const safe = redact(entry);
  const seq = chain.length;
  const prev = seq === 0 ? GENESIS : chain[seq - 1].hash;
  const record = { seq, prev, entry: safe, hash: computeHash(seq, prev, safe) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    try {
      if (
        r === null || typeof r !== 'object' ||
        r.seq !== i || r.prev !== prev || typeof r.hash !== 'string' ||
        r.hash !== computeHash(r.seq, r.prev, r.entry)
      ) return { ok: false, index: i };
    } catch {
      return { ok: false, index: i };
    }
    prev = r.hash;
  }
  return { ok: true };
}
