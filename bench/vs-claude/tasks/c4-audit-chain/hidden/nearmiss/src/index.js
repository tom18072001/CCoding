import crypto from 'node:crypto';
export function canonicalize(v) {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalize(x))).join(',')}]`;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?<!\d)(?:\+84|0)[35789]\d{8}(?!\d)/g;
export function redact(e) {
  if (typeof e === 'string') return e.replace(EMAIL, '[EMAIL]').replace(PHONE, '[PHONE]');
  if (Array.isArray(e)) return e.map(redact);
  if (e && typeof e === 'object') return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, redact(v)]));
  return e;
}
const ZERO = '0'.repeat(64);
const h = (seq, prev, entry) => crypto.createHash('sha256').update(canonicalize({ seq, prev, entry })).digest('hex');
export function append(chain, entry) {
  const seq = chain.length, prev = seq ? chain[seq - 1].hash : ZERO, red = redact(entry);
  const rec = { seq, prev, entry: red, hash: h(seq, prev, red) }; chain.push(rec); return rec;
}
export function verify(chain) {
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i], prev = i ? chain[i - 1].hash : ZERO;
    if (r.seq !== i || r.prev !== prev && r.hash !== h(r.seq, r.prev, r.entry)) return { ok: false, index: i };
  }
  return { ok: true };
}
