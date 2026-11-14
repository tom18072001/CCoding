import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, omits undefined', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: undefined }], c: 'x' } }),
    '{"a":{"c":"x","d":[3,{"z":1}]},"b":1}');
  assert.equal(canonicalize([undefined]), '[null]');
});
test('canonicalize sorts by code point, not UTF-16 unit', () => {
  assert.equal(canonicalize({ '\u{1F600}': 1, '～': 2 }), '{"～":2,"\u{1F600}":1}');
});
test('redact emails and phones deeply without mutation', () => {
  const input = { a: 'mail x.y@ex.com or 0912345678', n: [{ p: '+84351234567' }, 'a@b.vn'], 'k@x.com': 1, num: 5 };
  const snap = structuredClone(input);
  const out = redact(input);
  assert.deepEqual(input, snap);
  assert.deepEqual(out, { a: 'mail [EMAIL] or [PHONE]', n: [{ p: '[PHONE]' }, '[EMAIL]'], 'k@x.com': 1, num: 5 });
});
test('phone boundaries', () => {
  assert.equal(redact('0212345678'), '0212345678'); // bad first digit
  assert.equal(redact('09123456789'), '09123456789'); // trailing digit
  assert.equal(redact('90912345678'), '90912345678'); // leading digit
  assert.equal(redact('+8491234567'), '+8491234567'); // too short
  assert.equal(redact('call 0912345678.'), 'call [PHONE].');
  assert.equal(redact('0912345678@x.com'), '[EMAIL]');
});
test('append chains and PII never reaches hash', () => {
  const c = [];
  const r0 = append(c, { u: 'a@b.com', p: '0912345678' });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { u: '[EMAIL]', p: '[PHONE]' });
  const expect = createHash('sha256').update(canonicalize({ seq: 0, prev: r0.prev, entry: r0.entry })).digest('hex');
  assert.equal(r0.hash, expect);
  const r1 = append(c, { x: 1 });
  assert.equal(r1.prev, r0.hash);
  assert.equal(c.length, 2);
  assert.deepEqual(verify(c), { ok: true });
  assert.deepEqual(verify([]), { ok: true });
});
test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 3; i++) append(c, { i }); return c; };
  let c = mk(); c[1].entry.i = 9; assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[2].prev = 'f'.repeat(64); assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c.splice(0, 1); assert.deepEqual(verify(c), { ok: false, index: 0 });
  c = mk(); c[1].seq = 5; assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[0].hash = 'x'; assert.deepEqual(verify(c), { ok: false, index: 0 });
});
