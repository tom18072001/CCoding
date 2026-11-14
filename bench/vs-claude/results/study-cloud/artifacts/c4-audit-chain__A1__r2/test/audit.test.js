import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, omits undefined', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { y: 1, x: undefined }], c: 'é' } }),
    '{"a":{"c":"é","d":[3,{"y":1}]},"b":1}');
  assert.equal(canonicalize([undefined, () => 1]), '[null,null]');
  assert.equal(canonicalize(undefined), undefined);
  assert.equal(canonicalize({ 2: 'a', 1: 'b' }), '{"1":"b","2":"a"}');
});
test('canonicalize orders by code point, not UTF-16 unit', () => {
  // U+FF5E (BMP) vs U+1F600 (surrogates D83D..): code point order puts FF5E first
  assert.equal(canonicalize({ '\u{1F600}': 1, '～': 2 }), '{"～":2,"\u{1F600}":1}');
});
test('redact emails and phones, deep, incl. arrays', () => {
  const input = { a: 'mail bob.x+1@ex.co.uk now', k: ['0912345678', { p: 'call +84351234567.' }], n: 5 };
  const snap = JSON.stringify(input);
  const out = redact(input);
  assert.deepEqual(out, { a: 'mail [EMAIL] now', k: ['[PHONE]', { p: 'call [PHONE].' }], n: 5 });
  assert.equal(JSON.stringify(input), snap);
  assert.notEqual(out.k, input.k);
});
test('phone boundaries', () => {
  for (const s of ['0212345678', '01234567890', '09123456789', '109123456789', '091234567', '+84212345678'])
    assert.equal(redact(s), s, s);
  assert.equal(redact('x0912345678y'), 'x[PHONE]y');
  assert.equal(redact('(+84912345678)'), '([PHONE])');
  assert.equal(redact('0912345678@ex.com'), '[EMAIL]');
});
test('keys unchanged', () => {
  assert.deepEqual(redact({ 'a@b.com': 'a@b.com' }), { 'a@b.com': '[EMAIL]' });
});
test('append builds linked chain with redacted hash input', () => {
  const c = [];
  const r0 = append(c, { who: 'a@b.com', t: '0912345678' });
  const r1 = append(c, { z: 1 });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { who: '[EMAIL]', t: '[PHONE]' });
  const h = createHash('sha256').update(canonicalize({ seq: 0, prev: r0.prev, entry: r0.entry })).digest('hex');
  assert.equal(r0.hash, h);
  assert.equal(r1.prev, r0.hash);
  assert.equal(c.length, 2);
  assert.deepEqual(verify(c), { ok: true });
  assert.deepEqual(verify(JSON.parse(JSON.stringify(c))), { ok: true });
});
test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  let c = mk(); c[2].entry.i = 9;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = 'f'.repeat(64);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c.splice(1, 1);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[3].seq = 7;
  assert.deepEqual(verify(c), { ok: false, index: 3 });
  c = mk(); c[0].hash = c[0].hash.toUpperCase();
  assert.deepEqual(verify(c), { ok: false, index: 0 });
  c = mk(); c[2] = null;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
  assert.deepEqual(verify([]), { ok: true });
});
test('redact is linear on pathological input', () => {
  const t = Date.now();
  redact('a'.repeat(200000)); redact('a.'.repeat(100000)); redact('a@'.repeat(50000));
  assert.ok(Date.now() - t < 2000);
});
