import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, omits undefined, keeps arrays', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined }, 'A': true }), '{"A":true,"a":{"d":[3,{"y":2,"z":1}]},"b":1}');
  assert.equal(canonicalize('x"y'), JSON.stringify('x"y'));
  assert.equal(canonicalize(null), 'null');
});
test('redact emails and VN mobiles at any depth, no mutation', () => {
  const e = { msg: 'mail an.nguyen@ics.vn or call 0912345678', nested: { list: ['+84987654321', 'x'] }, n: 5 };
  const copy = JSON.parse(JSON.stringify(e));
  const r = redact(e);
  assert.equal(r.msg, 'mail [EMAIL] or call [PHONE]');
  assert.deepEqual(r.nested.list, ['[PHONE]', 'x']);
  assert.equal(r.n, 5);
  assert.deepEqual(e, copy);
});
test('phone boundaries and prefixes', () => {
  assert.equal(redact('id 10912345678'), 'id 10912345678');
  assert.equal(redact('09123456789'), '09123456789');
  assert.equal(redact('0212345678'), '0212345678');
  assert.equal(redact('tel:0312345678.'), 'tel:[PHONE].');
});
test('record shape and hash definition', () => {
  const c = [];
  const r0 = append(c, { who: 'a@b.co', k: 1 });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { who: '[EMAIL]', k: 1 });
  const want = crypto.createHash('sha256').update(canonicalize({ seq: 0, prev: '0'.repeat(64), entry: { who: '[EMAIL]', k: 1 } })).digest('hex');
  assert.equal(r0.hash, want);
  const r1 = append(c, { k: 2 });
  assert.equal(r1.prev, r0.hash);
  assert.equal(c.length, 2);
});
test('PII never reaches hash input', () => {
  const c1 = [], c2 = [];
  append(c1, { m: 'x@y.com' }); append(c2, { m: 'other@z.org' });
  assert.equal(c1[0].hash, c2[0].hash);
});
test('verify detects first tampered record', () => {
  const c = [];
  for (let i = 0; i < 5; i++) append(c, { i });
  assert.deepEqual(verify(c), { ok: true });
  c[2].entry.i = 99;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
});
test('verify detects reorder and broken link', () => {
  const c = [];
  for (let i = 0; i < 4; i++) append(c, { i });
  const swapped = [c[0], c[2], c[1], c[3]];
  assert.deepEqual(verify(swapped), { ok: false, index: 1 });
  const d = c.map((r) => ({ ...r })); d[3].prev = 'f'.repeat(64);
  assert.deepEqual(verify(d), { ok: false, index: 3 });
  assert.deepEqual(verify([]), { ok: true });
});
