import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, omits undefined', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { y: 1, x: undefined }], c: null } }),
    '{"a":{"c":null,"d":[3,{"y":1}]},"b":1}');
  assert.equal(canonicalize([undefined]), '[null]');
});
test('canonicalize sorts by code point, not UTF-16 unit', () => {
  assert.equal(canonicalize({ '\u{1F600}': 1, '～': 2 }), '{"～":2,"\u{1F600}":1}');
});
test('redact emails and phones at any depth', () => {
  const input = { a: 'mail me@x.com or 0912345678', n: [{ p: '+84 ' , q: '+84912345678' }, 'x'], k: 5 };
  const snap = JSON.stringify(input);
  const out = redact(input);
  assert.equal(out.a, 'mail [EMAIL] or [PHONE]');
  assert.equal(out.n[0].q, '[PHONE]');
  assert.equal(JSON.stringify(input), snap);
});
test('phone boundaries', () => {
  for (const s of ['01234567890', '0212345678', '09123456789', '109123456789'])
    assert.equal(redact({ s }).s, s);
  assert.equal(redact({ s: 'call 0391234567.' }).s, 'call [PHONE].');
  assert.equal(redact({ s: '0912345678@mail.vn' }).s, '[EMAIL]');
});
test('keys unchanged', () => {
  assert.deepEqual(redact({ 'a@b.com': 'x' }), { 'a@b.com': 'x' });
});
test('append builds chain with redacted entry and PII-free hash', () => {
  const c = [];
  const r0 = append(c, { u: 'a@b.com' });
  const r1 = append(c, { p: '0912345678' });
  assert.equal(r0.prev, '0'.repeat(64));
  assert.equal(r1.prev, r0.hash);
  assert.equal(r1.seq, 1);
  assert.deepEqual(r0.entry, { u: '[EMAIL]' });
  const h = createHash('sha256').update(canonicalize({ seq: 0, prev: r0.prev, entry: { u: '[EMAIL]' } })).digest('hex');
  assert.equal(r0.hash, h);
  assert.ok(!JSON.stringify(c).includes('a@b.com'));
  assert.deepEqual(verify(c), { ok: true });
});
test('verify detects tampering', () => {
  const c = [];
  for (let i = 0; i < 4; i++) append(c, { i });
  assert.deepEqual(verify([]), { ok: true });
  const t = structuredClone(c); t[2].entry.i = 99;
  assert.deepEqual(verify(t), { ok: false, index: 2 });
  const d = structuredClone(c); d.splice(1, 1);
  assert.deepEqual(verify(d), { ok: false, index: 1 });
  const p = structuredClone(c); p[3].prev = 'f'.repeat(64);
  assert.deepEqual(verify(p), { ok: false, index: 3 });
});
