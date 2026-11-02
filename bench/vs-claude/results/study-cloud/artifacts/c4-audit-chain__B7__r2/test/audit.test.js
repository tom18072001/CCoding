import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, omits undefined, matches JSON.stringify otherwise', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: undefined }], c: 'x' } }), '{"a":{"c":"x","d":[3,{"z":1}]},"b":1}');
  assert.equal(canonicalize([undefined, () => 1]), '[null,null]');
  assert.equal(canonicalize({ d: new Date(0), n: null }), '{"d":"1970-01-01T00:00:00.000Z","n":null}');
});

test('canonicalize sorts by code point, not UTF-16 unit', () => {
  assert.equal(canonicalize({ '\u{1F600}': 1, '～': 2 }), '{"～":2,"\u{1F600}":1}');
});

test('redact emails and VN mobiles, deep, no mutation, keys kept', () => {
  const input = { 'a@b.com': 'mail a.b+c@x.co.uk or 0912345678, +84912345678', l: ['0399999999', { n: 'x@y.vn' }], n: 5 };
  const snap = JSON.stringify(input);
  const out = redact(input);
  assert.equal(JSON.stringify(input), snap);
  assert.deepEqual(out, { 'a@b.com': 'mail [EMAIL] or [PHONE], [PHONE]', l: ['[PHONE]', { n: '[EMAIL]' }], n: 5 });
});

test('phone boundaries', () => {
  assert.equal(redact('09123456789'), '09123456789');
  assert.equal(redact('109123456789'), '109123456789');
  assert.equal(redact('0212345678'), '0212345678');
  assert.equal(redact('call 0812345678.'), 'call [PHONE].');
});

test('append builds chain; PII never reaches hash input', () => {
  const chain = [];
  const r0 = append(chain, { who: 'a@b.com', tel: '0912345678' });
  const r1 = append(chain, { ok: true });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { who: '[EMAIL]', tel: '[PHONE]' });
  assert.equal(r1.prev, r0.hash);
  const h = createHash('sha256').update(canonicalize({ seq: 0, prev: r0.prev, entry: r0.entry })).digest('hex');
  assert.equal(r0.hash, h);
  assert.ok(!JSON.stringify(chain).includes('a@b.com'));
  assert.deepEqual(verify(chain), { ok: true });
});

test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  assert.deepEqual(verify([]), { ok: true });
  let c = mk(); c[2].entry.i = 99; assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = 'x'; assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c.splice(1, 1); assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[0].seq = 5; assert.deepEqual(verify(c), { ok: false, index: 0 });
});
