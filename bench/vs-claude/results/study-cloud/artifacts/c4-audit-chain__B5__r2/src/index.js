// Tamper-evident audit log: canonical JSON, PII redaction, SHA-256 hash chain.
import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);

function cmpCodePoint(a, b) {
  const x = Array.from(a, (c) => c.codePointAt(0));
  const y = Array.from(b, (c) => c.codePointAt(0));
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

const omitted = (v) => v === undefined || typeof v === 'function' || typeof v === 'symbol';

function ser(v) {
  if (v !== null && typeof v === 'object' && typeof v.toJSON === 'function') v = v.toJSON();
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map((x) => (omitted(x) ? 'null' : ser(x))).join(',') + ']';
  if (v instanceof Number || v instanceof String || v instanceof Boolean) return JSON.stringify(v);
  const parts = [];
  for (const k of Object.keys(v).sort(cmpCodePoint)) {
    const val = v[k];
    if (omitted(val)) continue;
    parts.push(JSON.stringify(k) + ':' + ser(val));
  }
  return '{' + parts.join(',') + '}';
}

export function canonicalize(value) {
  if (omitted(value)) return undefined; // same as JSON.stringify
  return ser(value);
}

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const PHONE_RE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(v) {
  if (typeof v === 'string') return redactString(v);
  if (v !== null && typeof v === 'object' && typeof v.toJSON === 'function') {
    return redactValue(v.toJSON());
  }
  if (Array.isArray(v)) return v.map(redactValue);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      Object.defineProperty(out, k, {
        value: redactValue(v[k]), enumerable: true, writable: true, configurable: true,
      });
    }
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
  const safe = redact(entry);
  const seq = chain.length;
  const prev = seq === 0 ? GENESIS : chain[seq - 1].hash;
  const record = { seq, prev, entry: safe, hash: hashOf(seq, prev, safe) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  let prev = GENESIS;
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
