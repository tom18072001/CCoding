import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, drops undefined, matches JSON.stringify otherwise', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: undefined, x: 2 }], c: 'é"' } }),
    '{"a":{"c":"é\\"","d":[3,{"x":2,"z":1}]},"b":1}');
  assert.equal(canonicalize([undefined, () => 1, null]), '[null,null,null]');
  assert.equal(canonicalize(new Date(0)), JSON.stringify(new Date(0)));
  assert.equal(canonicalize('x'), '"x"');
});

test('canonicalize sorts by code point, not UTF-16 unit', () => {
  const astral = '\u{1F600}', bmp = '�';
  assert.equal(canonicalize({ [astral]: 1, [bmp]: 2 }), `{"${bmp}":2,"${astral}":1}`);
});

test('redact emails and VN mobiles, deep, incl. arrays, keys untouched, no mutation', () => {
  const input = { 'a@b.com': 'x', msg: 'mail me@example.com or 0912345678 / +84987654321.',
    list: ['0351234567', { n: ['bob.k+t@mail.co.vn'] }], num: 5 };
  const snap = structuredClone(input);
  const out = redact(input);
  assert.deepEqual(input, snap);
  assert.deepEqual(out, { 'a@b.com': 'x', msg: 'mail [EMAIL] or [PHONE] / [PHONE].',
    list: ['[PHONE]', { n: ['[EMAIL]'] }], num: 5 });
});

test('phone boundaries', () => {
  for (const s of ['0212345678', '01234567890', '9012345678', '091234567', '+840912345678']) {
    assert.equal(redact(s), s);
  }
  assert.equal(redact('0912345678 9'), '[PHONE] 9');
  assert.equal(redact('call:0912345678.'), 'call:[PHONE].');
  assert.equal(redact('0912345678@x.com'), '[EMAIL]');
});

test('append builds chain; PII never reaches hash input', () => {
  const c = [];
  const r0 = append(c, { u: 'a@b.com', p: '0912345678' });
  const r1 = append(c, { k: 1 });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { u: '[EMAIL]', p: '[PHONE]' });
  assert.equal(r0.hash, createHash('sha256').update(canonicalize({ seq: 0, prev: r0.prev, entry: r0.entry })).digest('hex'));
  assert.equal(r1.prev, r0.hash);
  assert.equal(c.length, 2);
  assert.ok(!JSON.stringify(c).includes('a@b.com'));
  assert.deepEqual(verify(c), { ok: true });
  assert.deepEqual(verify([]), { ok: true });
});

test('verify detects tampering at first bad index', () => {
  const build = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  let c = build(); c[2].entry.i = 99;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = build(); c[1].prev = '1'.repeat(64);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = build(); c.splice(1, 1);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = build(); c[0].seq = 5;
  assert.deepEqual(verify(c), { ok: false, index: 0 });
  c = build(); c[3].hash = 'x';
  assert.deepEqual(verify(c), { ok: false, index: 3 });
});
