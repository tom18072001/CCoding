import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, drops undefined', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { y: 1, x: undefined }], c: null } }),
    '{"a":{"c":null,"d":[3,{"y":1}]},"b":1}');
  assert.equal(canonicalize([undefined]), '[null]');
});
test('canonicalize sorts by code point, not UTF-16 unit', () => {
  assert.equal(canonicalize({ '\u{1F600}': 1, '￿': 2 }), '{"￿":2,"\u{1F600}":1}');
});
test('redact emails and phones, deep, no mutation, keys kept', () => {
  const input = { 'a@b.com': 'x', n: ['mail me: john.doe@example.co.uk', { p: '0912345678' }], q: '+84389999999 ok', k: 5 };
  const snap = structuredClone(input);
  const out = redact(input);
  assert.deepEqual(input, snap);
  assert.deepEqual(out, { 'a@b.com': 'x', n: ['mail me: [EMAIL]', { p: '[PHONE]' }], q: '[PHONE] ok', k: 5 });
});
test('phone boundaries', () => {
  assert.equal(redact('0212345678'), '0212345678');
  assert.equal(redact('09123456789'), '09123456789');
  assert.equal(redact('90912345678'), '90912345678');
  assert.equal(redact('call 0912345678.'), 'call [PHONE].');
  assert.equal(redact('0912345678@x.com'), '[EMAIL]');
});
test('redaction applies before hashing', () => {
  const c = [];
  const r = append(c, { who: 'a@b.com', ph: ['0987654321'] });
  assert.deepEqual(r.entry, { who: '[EMAIL]', ph: ['[PHONE]'] });
  const expect = createHash('sha256').update(canonicalize({ seq: 0, prev: '0'.repeat(64), entry: r.entry })).digest('hex');
  assert.equal(r.hash, expect);
  assert.ok(!JSON.stringify(c).includes('a@b.com'));
});
test('chain linkage and tamper detection', () => {
  const c = [];
  append(c, { a: 1 }); append(c, { a: 2 }); append(c, { a: 3 });
  assert.equal(c[0].prev, '0'.repeat(64));
  assert.equal(c[1].prev, c[0].hash);
  assert.deepEqual(verify(c), { ok: true });
  assert.deepEqual(verify([]), { ok: true });
  const t = structuredClone(c); t[1].entry.a = 9;
  assert.deepEqual(verify(t), { ok: false, index: 1 });
  const u = structuredClone(c); u.splice(1, 1);
  assert.deepEqual(verify(u), { ok: false, index: 1 });
  const w = structuredClone(c); w[2].prev = 'x';
  assert.deepEqual(verify(w), { ok: false, index: 2 });
  assert.deepEqual(verify([null]), { ok: false, index: 0 });
});
