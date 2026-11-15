import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts nested keys, omits undefined', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: undefined, x: 2 }], c: null } }),
    '{"a":{"c":null,"d":[3,{"x":2,"z":1}]},"b":1}');
  assert.equal(canonicalize([undefined, NaN, () => 1]), '[null,null,null]');
  assert.equal(canonicalize(new Date(0)), JSON.stringify(new Date(0)));
});

test('canonicalize sorts by code point, not UTF-16 unit', () => {
  const s = canonicalize({ '\u{1F600}': 2, '￿': 1 });
  assert.equal(s, '{"￿":1,"\u{1F600}":2}');
});

test('redact emails and phones at any depth, no mutation', () => {
  const input = { a: 'mail x.y@ex.com now', l: ['0912345678', { p: '+84 x +84812345678' }], n: 5, 'k@a.com': 'ok' };
  const snap = JSON.parse(JSON.stringify(input));
  const out = redact(input);
  assert.deepEqual(input, snap);
  assert.equal(out.a, 'mail [EMAIL] now');
  assert.equal(out.l[0], '[PHONE]');
  assert.equal(out.l[1].p, '+84 x [PHONE]');
  assert.equal(out.n, 5);
  assert.ok('k@a.com' in out);
  assert.notEqual(out.l, input.l);
});

test('redact phone boundaries', () => {
  assert.equal(redact('01234567890'), '01234567890');
  assert.equal(redact('00912345678'), '00912345678');
  assert.equal(redact('0212345678'), '0212345678');
  assert.equal(redact('09123456789'), '09123456789');
  assert.equal(redact('a 0912345678.'), 'a [PHONE].');
});

test('append builds linked chain without PII in hash input', () => {
  const c = [];
  const e = { who: 'a@b.com', tel: '0987654321' };
  const r0 = append(c, e);
  append(c, { n: 1 });
  append(c, { n: 2 });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { who: '[EMAIL]', tel: '[PHONE]' });
  assert.equal(e.who, 'a@b.com');
  assert.equal(c[1].prev, c[0].hash);
  assert.match(c[2].hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(verify(c), { ok: true });
  assert.deepEqual(verify([]), { ok: true });
});

test('verify detects tampering at correct index', () => {
  const mk = () => { const c = []; for (let i = 0; i < 3; i++) append(c, { i }); return c; };
  let c = mk(); c[1].entry.i = 9; assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[2].prev = '1'.repeat(64); assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].seq = 5; assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[0].hash = 'f'.repeat(64); assert.deepEqual(verify(c), { ok: false, index: 0 });
});
