// Tamper-evident audit log.
import { createHash } from 'node:crypto';

const ZERO = '0'.repeat(64);

function cmpCodePoint(a, b) {
  const ia = a[Symbol.iterator](), ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next(), y = ib.next();
    if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
    const d = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (d) return d;
  }
}

function ser(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(ser).join(',') + ']';
  return '{' + Object.keys(v).sort(cmpCodePoint)
    .map((k) => JSON.stringify(k) + ':' + ser(v[k])).join(',') + '}';
}

export function canonicalize(value) {
  // JSON round-trip applies JSON.stringify semantics (toJSON, undefined/function
  // omission, null for non-finite, cycle/BigInt errors); then re-serialize sorted.
  const json = JSON.stringify(value);
  if (json === undefined) return undefined;
  return ser(JSON.parse(json));
}

const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const PHONE = /(?<![0-9])(?:0|\+84)[35789][0-9]{8}(?![0-9])/g;

function redactString(s) {
  return s.replace(EMAIL, '[EMAIL]').replace(PHONE, '[PHONE]');
}

function walk(v, stack) {
  if (typeof v === 'string') return redactString(v);
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toJSON === 'function') return walk(v.toJSON(), stack);
  if (stack.has(v)) throw new TypeError('Converting circular structure');
  stack.add(v);
  let out;
  if (Array.isArray(v)) {
    out = v.map((x) => walk(x, stack));
  } else {
    out = {};
    for (const k of Object.keys(v)) {
      Object.defineProperty(out, k, {
        value: walk(v[k], stack), enumerable: true, writable: true, configurable: true,
      });
    }
  }
  stack.delete(v);
  return out;
}

export function redact(entry) {
  return walk(entry, new Set());
}

const sha = (x) => createHash('sha256').update(canonicalize(x), 'utf8').digest('hex');

export function append(chain, entry) {
  const clean = redact(entry);
  if (canonicalize(clean) === undefined) throw new TypeError('entry is not serializable');
  const seq = chain.length;
  const prev = seq === 0 ? ZERO : chain[seq - 1].hash;
  const record = { seq, prev, entry: clean, hash: sha({ seq, prev, entry: clean }) };
  chain.push(record);
  return record;
}

export function verify(chain) {
  if (!Array.isArray(chain)) return { ok: false, index: 0 };
  let prev = ZERO;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    try {
      if (!r || typeof r !== 'object' || r.seq !== i || r.prev !== prev ||
          typeof r.hash !== 'string' || r.hash !== sha({ seq: r.seq, prev: r.prev, entry: r.entry })) {
        return { ok: false, index: i };
      }
    } catch {
      return { ok: false, index: i };
    }
    prev = r.hash;
  }
  return { ok: true };
}
