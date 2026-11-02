import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, omits undefined, keeps arrays', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: undefined, x: 2 }], c: null } }),
    '{"a":{"c":null,"d":[3,{"x":2,"z":1}]},"b":1}');
  assert.equal(canonicalize([undefined, 'é']), '[null,"é"]');
  assert.equal(canonicalize(undefined), undefined);
});

test('canonicalize sorts by code point, not UTF-16 unit', () => {
  const o = { '\u{1F600}': 1, '�': 2 };
  assert.equal(canonicalize(o), '{"�":2,"\u{1F600}":1}');
});

test('redact emails and phones at any depth, no mutation', () => {
  const input = { a: 'mail bob@example.com now', n: ['0912345678', { p: '+84 9', q: '+84912345678' }], k: 5 };
  const snap = JSON.stringify(input);
  const out = redact(input);
  assert.equal(JSON.stringify(input), snap);
  assert.deepEqual(out, { a: 'mail [EMAIL] now', n: ['[PHONE]', { p: '+84 9', q: '[PHONE]' }], k: 5 });
});

test('phone boundaries', () => {
  assert.equal(redact('0312345678'), '[PHONE]');
  assert.equal(redact('0212345678'), '0212345678');
  assert.equal(redact('01234567890'), '01234567890');
  assert.equal(redact('90912345678'), '90912345678');
  assert.equal(redact('09123456789'), '09123456789');
  assert.equal(redact('call 0912345678.'), 'call [PHONE].');
  assert.equal(redact('0912345678@x.com'), '[EMAIL]');
});

test('keys are not redacted', () => {
  assert.deepEqual(redact({ 'a@b.com': 'x' }), { 'a@b.com': 'x' });
});

test('append builds chain with redacted entries; PII not in hash input', () => {
  const chain = [];
  const r0 = append(chain, { who: 'a@b.com', tel: '0912345678' });
  const r1 = append(chain, { n: 1 });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { who: '[EMAIL]', tel: '[PHONE]' });
  assert.equal(r0.hash, createHash('sha256').update(canonicalize({ seq: 0, prev: r0.prev, entry: r0.entry })).digest('hex'));
  assert.equal(r1.prev, r0.hash);
  assert.equal(chain.length, 2);
  assert.ok(!JSON.stringify(chain).includes('a@b.com'));
  assert.deepEqual(verify(chain), { ok: true });
});

test('verify detects tampering at first bad index', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  assert.deepEqual(verify([]), { ok: true });
  let c = mk(); c[2].entry.i = 99;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = '1'.repeat(64);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c.splice(1, 1);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[3].seq = 7;
  assert.deepEqual(verify(c), { ok: false, index: 3 });
  c = mk(); c[0].hash = 'x';
  assert.deepEqual(verify(c), { ok: false, index: 0 });
});
