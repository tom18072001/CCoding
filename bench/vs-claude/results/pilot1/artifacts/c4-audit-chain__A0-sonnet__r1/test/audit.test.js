import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, keeps arrays, omits undefined', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: undefined }], c: null } }),
    '{"a":{"c":null,"d":[3,{"z":1}]},"b":1}');
  assert.equal(canonicalize([undefined, 1]), '[null,1]');
  assert.equal(canonicalize('x"'), JSON.stringify('x"'));
});

test('canonicalize sorts by code point, not UTF-16 unit', () => {
  // U+1F600 (surrogates D83D..) vs U+FF5E: code point order puts FF5E first
  assert.equal(canonicalize({ '\u{1F600}': 1, '～': 2 }), '{"～":2,"\u{1F600}":1}');
});

test('redact emails and phones at any depth', () => {
  const input = { a: 'mail bob@example.com now', n: ['0912345678', { p: '+84 912345678 / +84912345678' }], k: 5 };
  const snap = JSON.stringify(input);
  const out = redact(input);
  assert.deepEqual(out, { a: 'mail [EMAIL] now', n: ['[PHONE]', { p: '+84 912345678 / [PHONE]' }], k: 5 });
  assert.equal(JSON.stringify(input), snap);
});

test('phone boundaries', () => {
  assert.equal(redact('0312345678').valueOf(), '[PHONE]');
  assert.equal(redact('0212345678'), '0212345678');
  assert.equal(redact('0412345678'), '0412345678');
  assert.equal(redact('10912345678'), '10912345678');
  assert.equal(redact('09123456789'), '09123456789');
  assert.equal(redact('call 0987654321.'), 'call [PHONE].');
  assert.equal(redact('1+84912345678'), '1+84912345678');
  assert.equal(redact('+849123456789'), '+849123456789');
});

test('keys unchanged', () => {
  assert.deepEqual(redact({ 'a@b.com': 'x' }), { 'a@b.com': 'x' });
});

test('append builds linked chain with redacted entries and correct hash', () => {
  const c = [];
  const r0 = append(c, { who: 'a@b.com' });
  const r1 = append(c, { tel: '0912345678' });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { who: '[EMAIL]' });
  assert.equal(r1.prev, r0.hash);
  assert.equal(r1.hash, createHash('sha256').update(canonicalize({ seq: 1, prev: r0.hash, entry: r1.entry })).digest('hex'));
  assert.equal(c.length, 2);
  assert.ok(!JSON.stringify(c).includes('a@b.com'));
  assert.deepEqual(verify(c), { ok: true });
});

test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  assert.deepEqual(verify([]), { ok: true });
  let c = mk(); c[2].entry.i = 99; assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = 'x'; assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[3].seq = 7; assert.deepEqual(verify(c), { ok: false, index: 3 });
  c = mk(); c.splice(1, 1); assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[0].hash = 'f'.repeat(64); assert.deepEqual(verify(c), { ok: false, index: 0 });
});
