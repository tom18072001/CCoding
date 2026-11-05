import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize basics', () => {
  assert.equal(canonicalize({ b: 1, a: [3, { d: 1, c: undefined, a: 2 }] }), '{"a":[3,{"a":2,"d":1}],"b":1}');
  assert.equal(canonicalize([undefined, () => 1]), '[null,null]');
  assert.equal(canonicalize('x'), '"x"');
  assert.equal(canonicalize(new Date(0)), JSON.stringify(new Date(0)));
  assert.equal(canonicalize(undefined), undefined);
});
test('canonicalize sorts by code point, not UTF-16 unit', () => {
  const o = { '\u{1F600}': 1, '￿': 2 };
  assert.equal(canonicalize(o), '{"￿":2,"\u{1F600}":1}');
});
test('canonicalize throws on cycles', () => {
  const a = {}; a.a = a;
  assert.throws(() => canonicalize(a));
});
test('redact emails and phones at depth, in arrays', () => {
  const input = { m: 'mail a.b@x.com now', n: ['0912345678', { p: '+84381234567 and 0321234567' }], k: 5 };
  const snap = JSON.stringify(input);
  const out = redact(input);
  assert.equal(JSON.stringify(input), snap);
  assert.deepEqual(out, { m: 'mail [EMAIL] now', n: ['[PHONE]', { p: '[PHONE] and [PHONE]' }], k: 5 });
});
test('phone boundaries', () => {
  for (const s of ['0212345678', '0412345678', '09123456789', '10912345678', '091234567', '+840212345678'])
    assert.equal(redact(s), s, s);
  assert.equal(redact('(0912345678)'), '([PHONE])');
  assert.equal(redact('+84912345678'), '[PHONE]');
});
test('keys unchanged; email with phone-like local part', () => {
  assert.deepEqual(redact({ 'a@b.co': '0912345678@b.co' }), { 'a@b.co': '[EMAIL]' });
});
test('redact keeps __proto__ key as own data', () => {
  const o = JSON.parse('{"__proto__":{"e":"a@b.co"}}');
  const r = redact(o);
  assert.deepEqual(Object.keys(r), ['__proto__']);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
});
test('append builds chain, PII never hashed', () => {
  const c = [];
  const r0 = append(c, { u: 'bob@example.com', t: '0987654321' });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { u: '[EMAIL]', t: '[PHONE]' });
  assert.equal(r0.hash, createHash('sha256').update(canonicalize({ seq: 0, prev: r0.prev, entry: r0.entry })).digest('hex'));
  const r1 = append(c, { a: 1 });
  assert.equal(r1.prev, r0.hash);
  assert.equal(c.length, 2);
  assert.ok(!JSON.stringify(c).includes('bob@'));
  assert.deepEqual(verify(c), { ok: true });
});
test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  assert.deepEqual(verify([]), { ok: true });
  let c = mk(); c[2].entry.i = 99; assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = 'x'; assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[3].seq = 7; assert.deepEqual(verify(c), { ok: false, index: 3 });
  c = mk(); c.splice(1, 1); assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[0] = null; assert.deepEqual(verify(c), { ok: false, index: 0 });
  c = mk(); c[2].hash = 5; assert.deepEqual(verify(c), { ok: false, index: 2 });
});
