import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize: sorted keys, no whitespace, undefined omitted', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { y: 1, x: undefined }], c: 'é' } }), '{"a":{"c":"é","d":[3,{"y":1}]},"b":1}');
  assert.equal(canonicalize({ 10: 1, 2: 2, b: 3 }), '{"10":1,"2":2,"b":3}');
  assert.equal(canonicalize([undefined, 1]), '[null,1]');
});
test('canonicalize: code point order beyond BMP', () => {
  const hi = '\u{1F600}', bmp = '～';
  assert.equal(canonicalize({ [bmp]: 1, [hi]: 2 }), `{"${bmp}":1,"${hi}":2}`);
});
test('redact: emails and phones, nested, no mutation', () => {
  const e = { m: 'a.b@ex.com, 0912345678', l: ['+84 not', '+84912345678', { n: 'x@y.vn' }], k: 5 };
  const snap = structuredClone(e);
  assert.deepEqual(redact(e), { m: '[EMAIL], [PHONE]', l: ['+84 not', '[PHONE]', { n: '[EMAIL]' }], k: 5 });
  assert.deepEqual(e, snap);
});
test('redact: phone boundaries', () => {
  assert.equal(redact('00912345678'), '00912345678');
  assert.equal(redact('09123456789'), '09123456789');
  assert.equal(redact('0212345678'), '0212345678');
  assert.equal(redact('call 0312345678.'), 'call [PHONE].');
  assert.equal(redact('0912345678@mail.com'), '[EMAIL]');
  assert.equal(redact('1+84912345678'), '1+84912345678');
});
test('append/verify: chain, redacted entry hashed', () => {
  const c = [];
  const r0 = append(c, { u: 'a@b.com' });
  const r1 = append(c, { p: '0987654321' });
  assert.equal(r0.prev, '0'.repeat(64));
  assert.equal(r1.prev, r0.hash);
  assert.equal(r1.seq, 1);
  assert.deepEqual(r0.entry, { u: '[EMAIL]' });
  const h = createHash('sha256').update(canonicalize({ seq: 0, prev: r0.prev, entry: { u: '[EMAIL]' } })).digest('hex');
  assert.equal(r0.hash, h);
  assert.deepEqual(verify(c), { ok: true });
  assert.deepEqual(verify([]), { ok: true });
});
test('verify: detects tampering at first bad index', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  let c = mk(); c[2].entry.i = 99;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = 'f'.repeat(64);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c.splice(1, 1);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[3].hash = c[3].hash.toUpperCase();
  assert.deepEqual(verify(c), { ok: false, index: 3 });
});
