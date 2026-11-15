import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, omits undefined', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: undefined }], c: 'x' } }),
    '{"a":{"c":"x","d":[3,{"z":1}]},"b":1}');
  assert.equal(canonicalize([undefined, () => 1]), '[null,null]');
});
test('canonicalize sorts by code point, not UTF-16 unit', () => {
  const o = { '\u{1F600}': 1, '～': 2 };
  assert.equal(canonicalize(o), '{"～":2,"\u{1F600}":1}');
});
test('canonicalize matches JSON.stringify otherwise', () => {
  const v = { n: [1.5, -0, NaN, null, true], s: 'a"\n ', d: new Date(0) };
  assert.equal(canonicalize(v), JSON.stringify({ d: v.d, n: v.n, s: v.s }));
});
test('redact emails and phones deeply without mutation', () => {
  const input = { a: 'mail bob@example.com or 0912345678', k: ['+84 x', '+84912345678', { z: 'x.y+z@a.b.vn' }], 'a@b.com': 1, n: 5 };
  const snap = JSON.stringify(input);
  const out = redact(input);
  assert.equal(JSON.stringify(input), snap);
  assert.deepEqual(out, { a: 'mail [EMAIL] or [PHONE]', k: ['+84 x', '[PHONE]', { z: '[EMAIL]' }], 'a@b.com': 1, n: 5 });
  assert.notEqual(out.k, input.k);
});
test('phone boundaries', () => {
  const r = (s) => redact({ s }).s;
  assert.equal(r('0312345678'), '[PHONE]');
  assert.equal(r('0212345678'), '0212345678');
  assert.equal(r('0412345678'), '0412345678');
  assert.equal(r('03123456789'), '03123456789');
  assert.equal(r('90312345678'), '90312345678');
  assert.equal(r('(0987654321)'), '([PHONE])');
  assert.equal(r('+84812345678,0512345678'), '[PHONE],[PHONE]');
  assert.equal(r('0912345678@x.com'), '[EMAIL]');
});
test('append builds chain with redacted hash input', () => {
  const c = [];
  const r0 = append(c, { who: 'a@b.com', t: 1 });
  const r1 = append(c, { p: '0912345678' });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { who: '[EMAIL]', t: 1 });
  assert.equal(r0.hash, createHash('sha256').update('{"entry":{"t":1,"who":"[EMAIL]"},"prev":"' + '0'.repeat(64) + '","seq":0}').digest('hex'));
  assert.equal(r1.prev, r0.hash);
  assert.equal(c.length, 2);
  assert.ok(!JSON.stringify(c).includes('0912345678'));
  assert.deepEqual(verify(c), { ok: true });
});
test('append does not alias caller entry', () => {
  const e = { a: { b: 1 } };
  const c = [];
  append(c, e);
  e.a.b = 2;
  assert.deepEqual(verify(c), { ok: true });
});
test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  assert.deepEqual(verify([]), { ok: true });
  let c = mk(); c[2].entry.i = 99;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = '1'.repeat(64);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c.splice(1, 1);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[0].seq = 5;
  assert.deepEqual(verify(c), { ok: false, index: 0 });
  c = mk(); c[3].hash = 'x';
  assert.deepEqual(verify(c), { ok: false, index: 3 });
  c = mk(); c[1] = null;
  assert.deepEqual(verify(c), { ok: false, index: 1 });
});
