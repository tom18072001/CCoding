import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

test('canonicalize sorts keys deeply, drops undefined props', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: undefined, x: 2 }], c: null } }),
    '{"a":{"c":null,"d":[3,{"x":2,"z":1}]},"b":1}');
  assert.equal(canonicalize([undefined, () => 1]), '[null,null]');
  assert.equal(canonicalize('é"'), JSON.stringify('é"'));
});

test('canonicalize sorts by code point, not UTF-16 unit', () => {
  assert.equal(canonicalize({ '\u{1F600}': 1, '～': 2 }), '{"～":2,"\u{1F600}":1}');
});

test('redact emails and phones, nested, no mutation', () => {
  const input = { 'a@b.co': 'x', m: 'mail john.doe+t@ex.com or 0912345678, +84387654321.', l: ['0351234567', { n: 'x@y.vn' }], n: 5 };
  const snap = JSON.stringify(input);
  const out = redact(input);
  assert.equal(JSON.stringify(input), snap);
  assert.equal(out.m, 'mail [EMAIL] or [PHONE], [PHONE].');
  assert.deepEqual(out.l, ['[PHONE]', { n: '[EMAIL]' }]);
  assert.equal(out['a@b.co'], 'x');
  assert.equal(out.n, 5);
  assert.notEqual(out.l, input.l);
});

test('phone boundaries', () => {
  for (const s of ['01234567890', '0212345678', '09123456789', '10912345678', '+8409123456']) {
    assert.equal(redact(s), s, s);
  }
  assert.equal(redact('(0912345678)'), '([PHONE])');
  assert.equal(redact('0912345678@x.com'), '[EMAIL]');
});

test('append builds chain with redacted entries; PII never hashed', () => {
  const chain = [];
  const r0 = append(chain, { who: 'a@b.com', t: 1 });
  const r1 = append(chain, { tel: '0912345678' });
  assert.equal(r0.seq, 0);
  assert.equal(r0.prev, '0'.repeat(64));
  assert.deepEqual(r0.entry, { who: '[EMAIL]', t: 1 });
  assert.equal(r1.prev, r0.hash);
  assert.equal(r1.hash, createHash('sha256').update(canonicalize({ seq: 1, prev: r0.hash, entry: { tel: '[PHONE]' } })).digest('hex'));
  assert.equal(chain.length, 2);
  assert.ok(!JSON.stringify(chain).includes('0912345678'));
  assert.deepEqual(verify(chain), { ok: true });
});

test('verify detects tampering', () => {
  const mk = () => { const c = []; for (let i = 0; i < 4; i++) append(c, { i }); return c; };
  assert.deepEqual(verify([]), { ok: true });
  let c = mk(); c[2].entry.i = 9; assert.deepEqual(verify(c), { ok: false, index: 2 });
  c = mk(); c[1].prev = 'x'; assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c.splice(1, 1); assert.deepEqual(verify(c), { ok: false, index: 1 });
  c = mk(); c[3].seq = 7; assert.deepEqual(verify(c), { ok: false, index: 3 });
  c = mk(); c[0] = null; assert.deepEqual(verify(c), { ok: false, index: 0 });
});
