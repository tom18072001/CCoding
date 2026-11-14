import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys by code point at depth', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: undefined, x: 2 }], c: null } }),
    '{"a":{"c":null,"d":[3,{"x":2,"z":1}]},"b":1}');
  // U+FF5E (BMP) must sort before U+1F600 (surrogate pair) by code point
  assert.equal(canonicalize({ '\u{1F600}': 1, '～': 2 }), '{"～":2,"\u{1F600}":1}');
  assert.equal(canonicalize([undefined, () => 1]), '[null,null]');
  assert.equal(canonicalize(undefined), undefined);
  assert.equal(canonicalize({ d: new Date(0), n: NaN }), '{"d":"1970-01-01T00:00:00.000Z","n":null}');
});

test('redact emails and phones, deep, non-mutating', () => {
  const input = { a: 'mail bob@example.com or 0912345678', l: ['+84 x +84312345678', { n: 'x@y.vn' }], n: 5 };
  const snap = structuredClone(input);
  const out = redact(input);
  assert.deepEqual(input, snap);
  assert.deepEqual(out, { a: 'mail [EMAIL] or [PHONE]', l: ['+84 x [PHONE]', { n: '[EMAIL]' }], n: 5 });
  assert.notEqual(out.l, input.l);
});

test('phone boundaries', () => {
  assert.equal(redact('0212345678'), '0212345678'); // first digit 2 invalid
  assert.equal(redact('09123456789'), '09123456789'); // followed by digit
  assert.equal(redact('90912345678'), '90912345678'); // preceded by digit
  assert.equal(redact('0912345678.'), '[PHONE].');
  assert.equal(redact('+84912345678'), '[PHONE]');
  assert.equal(redact('0912345678@x.com'), '[EMAIL]');
  assert.deepEqual(redact({ 'a@b.com': 'x' }), { 'a@b.com': 'x' });
});

test('append builds linked chain with redacted hashed entries', () => {
  const c = [];
  const r0 = append(c, { u: 'a@b.com' });
  const r1 = append(c, { p: '0987654321' });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { u: '[EMAIL]' });
  assert.equal(r1.prev, r0.hash);
  assert.equal(r0.hash, createHash('sha256')
    .update('{"entry":{"u":"[EMAIL]"},"prev":"' + '0'.repeat(64) + '","seq":0}').digest('hex'));
  assert.equal(c.length, 2);
  assert.deepEqual(verify(c), { ok: true });
  assert.deepEqual(verify([]), { ok: true });
});

test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  let c = mk(); c[2].entry.i = 99;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = 'x';
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c.splice(1, 1);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[0].seq = 5;
  assert.deepEqual(verify(c), { ok: false, index: 0 });
  c = mk(); c[3].hash = 'f'.repeat(64);
  assert.deepEqual(verify(c), { ok: false, index: 3 });
  // PII smuggled in with a recomputed hash is still rejected
  c = mk(); c[3].entry = { i: 'a@b.com' };
  c[3].hash = createHash('sha256').update(canonicalize({ seq: 3, prev: c[3].prev, entry: c[3].entry })).digest('hex');
  assert.deepEqual(verify(c), { ok: false, index: 3 });
});
