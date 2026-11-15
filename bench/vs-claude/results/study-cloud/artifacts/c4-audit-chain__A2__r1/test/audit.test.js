import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, omits undefined, matches JSON.stringify otherwise', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { y: 1, x: undefined }], c: null } }), '{"a":{"c":null,"d":[3,{"y":1}]},"b":1}');
  assert.equal(canonicalize([undefined, 'é"\n']), JSON.stringify([undefined, 'é"\n']));
  assert.equal(canonicalize(new Date(0)), JSON.stringify(new Date(0)));
});
test('canonicalize sorts by code point, not UTF-16 unit', () => {
  const o = { '～': 1, '\u{1F600}': 2 };
  assert.equal(canonicalize(o), '{"～":1,"\u{1F600}":2}');
});
test('redact emails and phones, deep, arrays, no mutation', () => {
  const e = { a: 'mail bob@x.com or 0912345678', n: [{ p: '+84398765432' }, 'x'], k: 5 };
  const copy = structuredClone(e);
  const r = redact(e);
  assert.deepEqual(e, copy);
  assert.deepEqual(r, { a: 'mail [EMAIL] or [PHONE]', n: [{ p: '[PHONE]' }, 'x'], k: 5 });
});
test('phone boundaries', () => {
  for (const s of ['0212345678', '091234567', '09123456789', '10912345678', '5912345678901'])
    assert.equal(redact(s), s);
  assert.equal(redact('(0812345678)'), '([PHONE])');
  assert.equal(redact('0712345678,+84512345678'), '[PHONE],[PHONE]');
  assert.equal(redact('0912345678@x.com'), '[EMAIL]');
});
test('keys unchanged', () => {
  assert.deepEqual(redact({ 'a@b.com': 'a@b.com' }), { 'a@b.com': '[EMAIL]' });
});
test('append builds linked chain, hash over redacted entry only', () => {
  const c = [];
  const r0 = append(c, { u: 'a@b.com' });
  const r1 = append(c, { p: '0912345678' });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { u: '[EMAIL]' });
  assert.equal(r1.prev, r0.hash);
  assert.equal(r0.hash, createHash('sha256').update(canonicalize({ seq: 0, prev: r0.prev, entry: r0.entry })).digest('hex'));
  assert.equal(c[1], r1);
  assert.ok(!JSON.stringify(c).includes('a@b.com'));
  assert.deepEqual(verify(c), { ok: true });
});
test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  let c = mk(); c[2].entry.i = 9; assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = 'x'; assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c.splice(1, 1); assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[3].hash = '0'; assert.deepEqual(verify(c), { ok: false, index: 3 });
  assert.deepEqual(verify([]), { ok: true });
});
