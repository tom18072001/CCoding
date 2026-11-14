import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';
import { evaluate } from '../src/evaluate.js';

const ev = (files) => {
  const p = parseProject(files, 'main');
  assert.equal(p.ok, true);
  assert.deepEqual(check(p.program), []);
  return evaluate(p.program);
};

test('ví dụ include và ghi đè (thứ tự khóa)', () => {
  const r = ev({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a" port = 1 }\nmode = "dev"' });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('ví dụ mục 9', () => {
  const r = ev({ main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }' });
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('ghi đè giữ vị trí khóa, khối thay giá trị, mảng không trộn', () => {
  const r = ev({
    main: 'include "f1"\ninclude "f2"\ninclude "f3"',
    f1: 'a = 1\nb = 2\nc { y = 1 }',
    f2: 'a { x = 1 }\nb = [1,2]\nc = 5',
    f3: 'b = [3]\nc { z = 1 }',
  });
  assert.deepEqual(r, { a: { x: 1 }, b: [3], c: { z: 1 } });
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
});

test('tham chiếu thấy giá trị cuối, kể cả khai báo muộn', () => {
  assert.deepEqual(ev({ main: 'include "f"\na = "${b}"\nb = 2', f: 'b = 1' }), { b: 2, a: 2 });
  assert.deepEqual(ev({ main: 'include "x"\nv = "z"', x: 'v = "y"\nw = "${v}"' }), { v: 'z', w: 'z' });
});

test('giữ kiểu và nối chuỗi', () => {
  const r = ev({ main: 'n = 1.50\nb = true\nz = null\nbig = 1e21\ns = "${n}|${b}|${z}|${big}|${n}"\nm = "${z}"\nk = "${b}"\nt = "\\${n} $ ${n}"\ne = ""' });
  assert.deepEqual(r, { n: 1.5, b: true, z: null, big: 1e21, s: '1.5|true|null|1e+21|1.5', m: null, k: true, t: '${n} $ 1.5', e: '' });
});

test('không chia sẻ tham chiếu; mảng, đối tượng, lồng nhau', () => {
  const r = ev({ main: 'l = [1, [2]]\na = "${l}"\nb = "${l}"\no { x = "${l.1}" }\np = "${o}"\nq = "${p}"' });
  assert.deepEqual(r.a, [1, [2]]);
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a[1], r.b[1]);
  assert.notEqual(r.p, r.q);
  assert.deepEqual(r.q, { x: [2] });
  assert.deepEqual(ev({ main: 'a = "x${b}"\nb = "y${c}"\nc = 3' }), { a: 'xy3', b: 'y3', c: 3 });
});

test('hằng: chỉ số vào mảng, tham chiếu hằng khác, không vào kết quả', () => {
  assert.deepEqual(ev({ main: 'const l = ["p", "q"]\nconst m = "${@l.1}!"\nx = "${@m}"\ny = "${@l}"' }), { x: 'q!', y: ['p', 'q'] });
  assert.deepEqual(ev({ main: 'include "b"\nconst k = "main"\nv = "${@k}"', b: 'const k = "b"\nw = "${@k}"' }), { w: 'b', v: 'main' });
});

test('include trong khối và include lặp', () => {
  assert.deepEqual(ev({ main: 's { include "f"\nk = 2 }\nt { include "f" }', f: 'k = 1\nj = 1' }), { s: { k: 2, j: 1 }, t: { k: 1, j: 1 } });
});

test('khóa đặc biệt', () => {
  const r = ev({ main: '__proto__ { a = 1 }\nconstructor = 2' });
  assert.deepEqual(Object.keys(r), ['__proto__', 'constructor']);
});
