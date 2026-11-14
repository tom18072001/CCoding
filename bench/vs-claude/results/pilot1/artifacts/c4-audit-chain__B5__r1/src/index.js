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

const skipped = (v) => v === undefined || typeof v === 'function' || typeof v === 'symbol';

export function canonicalize(value) {
  if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    value = value.toJSON();
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value); // undefined/function/symbol -> undefined; BigInt throws, like JSON.stringify
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => (skipped(v) ? 'null' : canonicalize(v) ?? 'null')).join(',') + ']';
  }
  const parts = [];
  for (const k of Object.keys(value).sort(cmpCodePoint)) {
    const v = value[k];
    if (skipped(v)) continue;
    const s = canonicalize(v);
    if (s === undefined) continue; // toJSON returned undefined
    parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const PHONE_RE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

function redactValue(v) {
  if (typeof v === 'string') return redactString(v);
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toJSON === 'function') return redactValue(v.toJSON()); // e.g. Date; avoid PII leaking via toJSON
  if (Array.isArray(v)) return v.map(redactValue);
  const out = {};
  for (const k of Object.keys(v)) out[k] = redactValue(v[k]);
  return out;
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
  if (!Array.isArray(chain)) return { ok: false, index: 0 };
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    try {
      if (!r || typeof r !== 'object' || r.seq !== i || r.prev !== prev || r.hash !== hashOf(i, prev, r.entry)) {
        return { ok: false, index: i };
      }
    } catch {
      return { ok: false, index: i };
    }
    prev = r.hash;
  }
  return { ok: true };
}
