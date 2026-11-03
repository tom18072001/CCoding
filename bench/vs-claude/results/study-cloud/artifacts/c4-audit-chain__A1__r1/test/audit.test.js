import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, no whitespace', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }),
    '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
});
test('canonicalize sorts by code point, not UTF-16 unit', () => {
  assert.equal(canonicalize({ '￿': 1, '\u{1F600}': 2 }), '{"￿":1,"\u{1F600}":2}');
});
test('canonicalize integer-like keys sorted as strings', () => {
  assert.equal(canonicalize({ 2: 'a', 10: 'b', a: 1 }), '{"10":"b","2":"a","a":1}');
});
test('canonicalize matches JSON.stringify semantics', () => {
  assert.equal(canonicalize({ a: undefined, b: [undefined, () => 1], c: NaN, d: new Date(0) }),
    '{"b":[null,null],"c":null,"d":"1970-01-01T00:00:00.000Z"}');
  assert.equal(canonicalize(undefined), undefined);
  assert.equal(canonicalize('x'), '"x"');
  assert.throws(() => canonicalize(1n));
  const c = {}; c.c = c;
  assert.throws(() => canonicalize(c));
});

test('redact emails and phones at any depth, no mutation', () => {
  const input = { a: 'mail bob@example.com now', n: [{ p: '0912345678' }, '+84351234567 x'], k: 5 };
  const snap = structuredClone(input);
  const out = redact(input);
  assert.deepEqual(input, snap);
  assert.deepEqual(out, { a: 'mail [EMAIL] now', n: [{ p: '[PHONE]' }, '[PHONE] x'], k: 5 });
  assert.notEqual(out.n, input.n);
});
test('redact phone boundaries', () => {
  assert.equal(redact('0212345678'), '0212345678');       // bad first digit
  assert.equal(redact('09123456789'), '09123456789');     // trailing digit
  assert.equal(redact('10912345678'), '10912345678');     // leading digit
  assert.equal(redact('091234567'), '091234567');         // too short
  assert.equal(redact('call:0812345678.'), 'call:[PHONE].');
  assert.equal(redact('+84 912345678'), '+84 912345678'); // not in spec format
  for (const d of '35789') assert.equal(redact(`0${d}12345678`), '[PHONE]');
});
test('redact keeps keys, handles email with digits', () => {
  assert.deepEqual(redact({ 'a@b.com': '0912345678@x.vn' }), { 'a@b.com': '[EMAIL]' });
});
test('redact converts Dates via toJSON', () => {
  assert.deepEqual(redact({ d: new Date(0) }), { d: '1970-01-01T00:00:00.000Z' });
});

test('append builds linked chain with correct hashes', () => {
  const c = [];
  const r0 = append(c, { u: 'a@b.co' });
  const r1 = append(c, { n: 1 });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { u: '[EMAIL]' });
  assert.equal(r1.prev, r0.hash);
  assert.equal(c.length, 2);
  const h = createHash('sha256').update('{"entry":{"u":"[EMAIL]"},"prev":"' + '0'.repeat(64) + '","seq":0}').digest('hex');
  assert.equal(r0.hash, h);
  assert.deepEqual(verify(c), { ok: true });
});
test('PII never reaches hash input', () => {
  const a = [], b = [];
  append(a, { u: 'x@y.com', p: '0901234567' });
  append(b, { u: 'other@z.org', p: '0987654321' });
  assert.equal(a[0].hash, b[0].hash);
});
test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  let c = mk(); c[2].entry.i = 99;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = 'f'.repeat(64);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c.splice(1, 1);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[0].hash = c[0].hash.toUpperCase();
  assert.deepEqual(verify(c), { ok: false, index: 0 });
  c = mk(); c[3].seq = '3';
  assert.deepEqual(verify(c), { ok: false, index: 3 });
  assert.deepEqual(verify([]), { ok: true });
});
