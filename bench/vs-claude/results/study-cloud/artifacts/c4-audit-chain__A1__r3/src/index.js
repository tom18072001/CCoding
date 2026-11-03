// Tamper-evident audit log.
import { createHash } from 'node:crypto';

const ZERO = '0'.repeat(64);

function cmpCodePoint(a, b) {
  const x = Array.from(a, (c) => c.codePointAt(0));
  const y = Array.from(b, (c) => c.codePointAt(0));
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

export function canonicalize(value) {
  const stack = [];
  const walk = (holder, key, v) => {
    if (v !== null && (typeof v === 'object' || typeof v === 'bigint') && typeof v.toJSON === 'function') {
      v = v.toJSON(key);
    }
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return undefined;
    if (v === null || typeof v !== 'object') return JSON.stringify(v); // throws on BigInt
    if (v instanceof Number || v instanceof String || v instanceof Boolean) return JSON.stringify(v);
    if (stack.includes(v)) throw new TypeError('Converting circular structure');
    stack.push(v);
    let out;
    if (Array.isArray(v)) {
      out = '[' + v.map((x, i) => walk(v, String(i), x) ?? 'null').join(',') + ']';
    } else {
      const parts = [];
      for (const k of Object.keys(v).sort(cmpCodePoint)) {
        const s = walk(v, k, v[k]);
        if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
      }
      out = '{' + parts.join(',') + '}';
    }
    stack.pop();
    return out;
  };
  return walk({ '': value }, '', value);
}

const EMAIL_RE = /[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}\-]+(?:\.[\p{L}\p{N}\-]+)+/gu;
const PHONE_RE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;

function redactString(s) {
  return s.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

export function redact(entry) {
  const stack = [];
  const walk = (v, key) => {
    if (v !== null && typeof v === 'object' && typeof v.toJSON === 'function') v = v.toJSON(key);
    if (typeof v === 'string') return redactString(v);
    if (v instanceof String) return redactString(String(v));
    if (v === null || typeof v !== 'object') return v;
    if (stack.includes(v)) throw new TypeError('Cannot redact circular structure');
    stack.push(v);
    let out;
    if (Array.isArray(v)) out = v.map((x, i) => walk(x, String(i)));
    else out = Object.fromEntries(Object.keys(v).map((k) => [k, walk(v[k], k)]));
    stack.pop();
    return out;
  };
  return walk(entry, '');
}

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

export function append(chain, entry) {
  const safe = redact(entry);
  const seq = chain.length;
  const prev = seq === 0 ? ZERO : chain[seq - 1].hash;
  const hash = sha256(canonicalize({ seq, prev, entry: safe }));
  const record = { seq, prev, entry: safe, hash };
  chain.push(record);
  return record;
}

export function verify(chain) {
  if (!Array.isArray(chain)) return { ok: false, index: 0 };
  let prev = ZERO;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    try {
      if (
        r === null || typeof r !== 'object' ||
        r.seq !== i || r.prev !== prev || typeof r.hash !== 'string' ||
        r.hash !== sha256(canonicalize({ seq: r.seq, prev: r.prev, entry: r.entry }))
      ) return { ok: false, index: i };
    } catch {
      return { ok: false, index: i };
    }
    prev = r.hash;
  }
  return { ok: true };
}
