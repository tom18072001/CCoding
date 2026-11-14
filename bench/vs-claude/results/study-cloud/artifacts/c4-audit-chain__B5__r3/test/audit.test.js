import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys, drops undefined, keeps arrays', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: undefined }], c: 'x' } }),
    '{"a":{"c":"x","d":[3,{"z":1}]},"b":1}');
  assert.equal(canonicalize([undefined]), '[null]');
});

test('canonicalize sorts by code point, not UTF-16 unit', () => {
  const o = { '\u{1F600}': 1, '～': 2 };
  assert.equal(canonicalize(o), '{"～":2,"\u{1F600}":1}');
});

test('redact emails and phones deeply, no mutation', () => {
  const input = { msg: 'a.b@x.com call 0912345678 or +84 912345678 / +84912345678', l: ['0356789012', { n: 'x@y.vn' }], 'a@b.com': 1 };
  const copy = structuredClone(input);
  const out = redact(input);
  assert.deepEqual(input, copy);
  assert.equal(out.msg, '[EMAIL] call [PHONE] or +84 912345678 / [PHONE]');
  assert.deepEqual(out.l, ['[PHONE]', { n: '[EMAIL]' }]);
  assert.equal(out['a@b.com'], 1);
});

test('phone boundaries', () => {
  assert.equal(redact('01234567890'), '01234567890');
  assert.equal(redact('00912345678'), '00912345678');
  assert.equal(redact('09123456789'), '09123456789');
  assert.equal(redact('0212345678'), '0212345678');
  assert.equal(redact('0412345678'), '0412345678');
  assert.equal(redact('x 0812345678.'), 'x [PHONE].');
});

test('append builds chain; PII not in hash input', () => {
  const chain = [];
  const r0 = append(chain, { who: 'bob@example.com', tel: '0987654321' });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { who: '[EMAIL]', tel: '[PHONE]' });
  const expected = createHash('sha256').update(canonicalize({ seq: 0, prev: r0.prev, entry: r0.entry })).digest('hex');
  assert.equal(r0.hash, expected);
  const r1 = append(chain, { k: 1 });
  assert.equal(r1.prev, r0.hash);
  assert.equal(chain.length, 2);
  assert.ok(!JSON.stringify(chain).includes('example.com'));
  assert.deepEqual(verify(chain), { ok: true });
});

test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 3; i++) append(c, { i }); return c; };
  assert.deepEqual(verify([]), { ok: true });
  let c = mk(); c[1].entry.i = 9;
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[2].prev = 'f'.repeat(64);
  assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c.splice(0, 1);
  assert.deepEqual(verify(c), { ok: false, index: 0 });
  c = mk(); c[1].hash = c[1].hash.toUpperCase();
  assert.deepEqual(verify(c), { ok: false, index: 1 });
});
