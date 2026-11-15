import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

const ZERO = '0'.repeat(64);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const clone = (v) => JSON.parse(JSON.stringify(v));

describe('canonicalize', () => {
  test('sắp khóa lồng nhau', () => {
    assert.equal(canonicalize({ b: 1, a: { d: 1, c: 2 } }), '{"a":{"c":2,"d":1},"b":1}');
  });
  test('mảng giữ thứ tự và sắp khóa object trong mảng', () => {
    assert.equal(canonicalize([3, 1, { b: 1, a: 2 }]), '[3,1,{"a":2,"b":1}]');
  });
  test('không có khoảng trắng', () => {
    assert.ok(!/\s/.test(canonicalize({ a: [1, 2], b: { c: 'x' } })));
  });
  test('undefined bị bỏ trong object, thành null trong mảng', () => {
    assert.equal(canonicalize({ a: undefined, b: 1 }), '{"b":1}');
    assert.equal(canonicalize([undefined, 1]), '[null,1]');
    assert.equal(canonicalize({ x: [undefined] }), '{"x":[null]}');
  });
  test('sắp theo code point với ký tự astral', () => {
    const o = { '￿': 1, '\u{1F600}': 2 };
    assert.equal(canonicalize(o), '{"￿":1,"\u{1F600}":2}');
    assert.equal(canonicalize({ '\u{1F600}': 2, '￿': 1 }), '{"￿":1,"\u{1F600}":2}');
  });
  test('khớp JSON.stringify với input không có object', () => {
    for (const v of [1, 'a"b\n', null, true, [1, 'x', null, [2]], 'é ']) {
      assert.equal(canonicalize(v), JSON.stringify(v));
    }
  });
});

describe('redact', () => {
  test('email và số điện thoại ở object lồng nhau và mảng', () => {
    const out = redact({
      a: 'mail a.b+c@example.com ok',
      n: { p: '0912345678', q: '+84912345678' },
      l: ['x@y.org', ['0387654321'], { z: '+84 không' }],
    });
    assert.equal(out.a, 'mail [EMAIL] ok');
    assert.equal(out.n.p, '[PHONE]');
    assert.equal(out.n.q, '[PHONE]');
    assert.equal(out.l[0], '[EMAIL]');
    assert.equal(out.l[1][0], '[PHONE]');
    assert.equal(out.l[2].z, '+84 không');
  });
  test('khóa không đổi', () => {
    const out = redact({ 'u@x.com': 'v', '0912345678': 'w' });
    assert.deepEqual(Object.keys(out), ['u@x.com', '0912345678']);
  });
  test('không mutate input và trả bản sao', () => {
    const input = { a: 'u@x.com', b: ['0912345678', { c: 'u@x.com' }] };
    const before = clone(input);
    const out = redact(input);
    assert.deepEqual(input, before);
    assert.notEqual(out, input);
    assert.notEqual(out.b, input.b);
    assert.notEqual(out.b[1], input.b[1]);
  });
  test('số có chữ số đứng trước hoặc sau không bị thay', () => {
    for (const s of ['09123456789', '00912345678', '1912345678', '0912345678 9'.replace(' ', ''), '+849123456789', '8409123456789']) {
      assert.ok(!redact({ s }).s.includes('[PHONE]'), s);
    }
  });
  test('ranh giới không phải chữ số vẫn thay', () => {
    assert.equal(redact(['tel:0912345678.']).at(0), 'tel:[PHONE].');
    assert.equal(redact(['a 0912345678,+84912345678']).at(0), 'a [PHONE],[PHONE]');
  });
  test('đầu số 0/1/2/4/6 không bị thay', () => {
    for (const d of '01246') {
      for (const p of ['0', '+84']) {
        const s = `${p}${d}12345678`;
        assert.equal(redact({ s }).s, s, s);
      }
    }
  });
  test('đầu số 3/5/7/8/9 được thay', () => {
    for (const d of '35789') {
      assert.equal(redact({ s: `0${d}12345678` }).s, '[PHONE]');
      assert.equal(redact({ s: `+84${d}12345678` }).s, '[PHONE]');
    }
  });
  test('email chứa chữ số kiểu số điện thoại thành [EMAIL]', () => {
    assert.equal(redact({ e: '0912345678@x.com' }).e, '[EMAIL]');
  });
  test('nhiều PII trong một chuỗi', () => {
    assert.equal(
      redact({ s: 'a@b.com, 0912345678 và c@d.vn / +84387654321' }).s,
      '[EMAIL], [PHONE] và [EMAIL] / [PHONE]',
    );
  });
  test('giá trị không phải chuỗi giữ nguyên', () => {
    const input = { n: 912345678, b: true, z: null, a: [1, false, null] };
    assert.deepEqual(redact(input), input);
  });
});

describe('append', () => {
  test('record đầu: seq 0, prev 64 số 0; record sau liên kết đúng', () => {
    const chain = [];
    const r0 = append(chain, { m: 'one' });
    const r1 = append(chain, { m: 'two' });
    assert.equal(r0.seq, 0);
    assert.equal(r0.prev, ZERO);
    assert.equal(r1.seq, 1);
    assert.equal(r1.prev, r0.hash);
    assert.equal(chain.length, 2);
    assert.equal(chain[0], r0);
    assert.equal(chain[1], r1);
  });
  test('hash là sha256 của canonicalize({seq,prev,entry})', () => {
    const chain = [];
    append(chain, { b: 1, a: 2 });
    const r = append(chain, { k: [1, 2] });
    assert.match(r.hash, /^[0-9a-f]{64}$/);
    assert.equal(r.hash, sha(canonicalize({ seq: r.seq, prev: r.prev, entry: r.entry })));
  });
  test('PII không còn trong chain và hash tính trên entry đã redact', () => {
    const chain = [];
    const raw = { who: 'user@example.com', tel: ['0912345678', '+84912345678'], n: { m: 'x 0387654321' } };
    const before = clone(raw);
    const r = append(chain, raw);
    assert.deepEqual(raw, before);
    const dump = JSON.stringify(chain);
    for (const p of ['user@example.com', '0912345678', '+84912345678', '0387654321']) {
      assert.ok(!dump.includes(p), p);
    }
    assert.deepEqual(r.entry, {
      who: '[EMAIL]',
      tel: ['[PHONE]', '[PHONE]'],
      n: { m: 'x [PHONE]' },
    });
    const expected = sha(canonicalize({ seq: 0, prev: ZERO, entry: redact(raw) }));
    assert.equal(r.hash, expected);
    const rawHash = sha(canonicalize({ seq: 0, prev: ZERO, entry: raw }));
    assert.notEqual(r.hash, rawHash);
  });
});

describe('verify', () => {
  const build = (n = 5) => {
    const c = [];
    for (let i = 0; i < n; i++) append(c, { i, msg: `event ${i}` });
    return c;
  };
  const rehash = (r) => sha(canonicalize({ seq: r.seq, prev: r.prev, entry: r.entry }));

  test('chain rỗng và hợp lệ', () => {
    assert.deepEqual(verify([]), { ok: true });
    assert.deepEqual(verify(build()), { ok: true });
  });
  test('sửa entry', () => {
    const c = build();
    c[2].entry.msg = 'tampered';
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  test('sửa prev', () => {
    const c = build();
    c[3].prev = ZERO;
    assert.deepEqual(verify(c), { ok: false, index: 3 });
  });
  test('sửa hash', () => {
    const c = build();
    c[1].hash = 'f'.repeat(64);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('đổi seq', () => {
    const c = build();
    c[2].seq = 7;
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  test('sửa entry và tính lại hash của chính nó vẫn bị phát hiện ở record kế', () => {
    const c = build();
    c[1].entry.msg = 'forged';
    c[1].hash = rehash(c[1]);
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  test('hoán đổi record', () => {
    const c = build();
    [c[1], c[2]] = [c[2], c[1]];
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('xóa record giữa chain', () => {
    const c = build();
    c.splice(2, 1);
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  test('xóa record đầu', () => {
    const c = build();
    c.shift();
    assert.deepEqual(verify(c), { ok: false, index: 0 });
  });
  test('trả về index đầu tiên khi có nhiều chỗ hỏng', () => {
    const c = build();
    c[4].entry.msg = 'x';
    c[1].entry.msg = 'y';
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('record null/không phải object không throw', () => {
    for (const bad of [null, undefined, 5, 'x']) {
      const c = build(3);
      c[1] = bad;
      assert.deepEqual(verify(c), { ok: false, index: 1 });
    }
    assert.deepEqual(verify([null]), { ok: false, index: 0 });
  });
});
