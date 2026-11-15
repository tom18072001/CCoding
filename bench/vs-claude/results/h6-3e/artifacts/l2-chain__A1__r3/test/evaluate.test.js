import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';
import { evaluate } from '../src/evaluate.js';

const ev = (files) => {
  const p = parseProject(typeof files === 'string' ? { main: files } : files, 'main');
  assert.equal(p.ok, true);
  assert.deepEqual(check(p.program), []);
  return evaluate(p.program);
};

test('ví dụ mục 9: nội suy, mảng, hằng', () => {
  const r = ev('const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }');
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const r = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('tham chiếu thấy giá trị cuối; khóa muộn; include bị ghi đè', () => {
  assert.deepEqual(ev({ main: 'x = "${y}"\ninclude "i"\ny = 9', i: 'y = 1' }), { x: 9, y: 9 });
  assert.deepEqual(ev({ main: 'a = "${b}"\ninclude "i"', i: 'b = 1' }), { a: 1, b: 1 });
});

// trùng khóa trong một tệp là lỗi, nên ghi đè được thực hiện qua include (tệp base rồi tệp main)
const over = (base, top) => ev({ main: `include "i"\n${top}`, i: base });

test('ghi đè khối/giá trị, mảng không trộn, thứ tự khóa giữ chỗ cũ', () => {
  assert.deepEqual(over('a = [1,2]\nb = 1', 'a = [3]\nb { x = 1 }'), { a: [3], b: { x: 1 } });
  const r = over('a = 1\nb = 2', 'a { x = 1 }');
  assert.deepEqual(Object.keys(r), ['a', 'b']);
  assert.deepEqual(r, { a: { x: 1 }, b: 2 });
  assert.deepEqual(over('a { x = 1 }', 'a = 5'), { a: 5 });
  assert.deepEqual(ev({ main: 'include "i"\ninclude "j"\na { z = 1 }', i: 'a = 5', j: 'a { x = 1 }\na2 = 0' }), {
    a: { x: 1, z: 1 }, a2: 0,
  });
  // khối trộn sâu qua nhiều tầng
  assert.deepEqual(over('a { b { x = 1 y = 1 } c = 1 }', 'a { b { y = 2 } }'), { a: { b: { x: 1, y: 2 }, c: 1 } });
});

test('đánh giá chuỗi: giữ kiểu, nối chuỗi, số, null, lồng', () => {
  const r = ev('n = 1.50\nbig = 1e21\nt = true\nz = null\ns = "${n}|${big}|${t}|${z}|"\nk = "${z}"\ne = ""\nl = [1, "${n}"]\nm = "${l}"\nq = "${s}!"');
  assert.equal(r.s, '1.5|1e+21|true|null|');
  assert.equal(r.k, null);
  assert.equal(r.e, '');
  assert.deepEqual(r.m, [1, 1.5]);
  assert.equal(r.q, '1.5|1e+21|true|null|!');
});

test('không chia sẻ tham chiếu', () => {
  const r = ev('l = [1]\na = "${l}"\nb = "${l}"\no { k = [] }\nc = "${o}"\nd = "${o}"');
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.l);
  assert.notEqual(r.c, r.d);
  assert.notEqual(r.c.k, r.d.k);
});

test('tham chiếu hằng và chỉ mục; chuỗi escape', () => {
  assert.deepEqual(ev('const l = ["x", [5]]\na = "${@l.0}-${@l.1.0}"\nb = "${@l.1}"\nc = "\\${a}"'), {
    a: 'x-5', b: [5], c: '${a}',
  });
  assert.deepEqual(ev('const a = "A"\nconst b = "${@a}B"\nv = "${@b}"'), { v: 'AB' });
});

test('khóa __proto__ không làm hỏng', () => {
  const r = ev('__proto__ = 1');
  assert.deepEqual(Object.keys(r), ['__proto__']);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
});
