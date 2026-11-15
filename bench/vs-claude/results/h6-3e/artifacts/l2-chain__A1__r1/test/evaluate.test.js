import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';
import { evaluate } from '../src/evaluate.js';

const ev = (files, entry = 'main') => {
  if (typeof files === 'string') files = { main: files };
  const p = parseProject(files, entry);
  assert.equal(p.ok, true);
  assert.deepEqual(check(p.program), []);
  return evaluate(p.program);
};

test('ví dụ mục 9', () => {
  const r = ev(`const env = "prod"
name = "svc-\${@env}"
ports = [80, 443]
http { port = "\${ports.0}" }
https { port = "\${ports.1}" }`);
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('include và ghi đè, thứ tự khóa', () => {
  const r = ev({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a" port = 1 }\nmode = "dev"' });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('thứ tự khóa giữ chỗ cũ khi ghi đè; Assign/Block thay thế nhau', () => {
  const r = ev({
    main: 'a = 1\nb = 2\ninclude "i1"\ninclude "i2"\ninclude "i3"',
    i1: 'a { x = 1 }\nb = [1]',
    i2: 'b = [2]\na { y = 2 }',
    i3: 'c = 1',
  });
  assert.deepEqual(r, { a: { x: 1, y: 2 }, b: [2], c: 1 });
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
  const files = { main: 'include "p"\ninclude "q"\ninclude "r"', p: 'a { x = 1 }', q: 'a = 5', r: 'a { y = 1 }' };
  assert.deepEqual(ev(files), { a: { y: 1 } });
});

test('tham chiếu thấy giá trị cuối cùng', () => {
  assert.deepEqual(ev({ main: 'x = "${y}"\ninclude "b"\ny = 2', b: 'y = 1' }), { x: 2, y: 2 });
});

test('giữ kiểu và nối chuỗi', () => {
  const r = ev('n = 1.50\nbig = 1e21\nb = false\nz = null\nl = [1, [2]]\no { k = "v" }\n' +
    'a = "${n}"\nc = "${z}"\nd = "${l}"\ne = "${o}"\nf = "${n}-${big}-${b}-${z}-${o.k}"\ng = ""\nh = "${l.1}"');
  assert.equal(r.a, 1.5);
  assert.equal(r.c, null);
  assert.deepEqual(r.d, [1, [2]]);
  assert.deepEqual(r.e, { k: 'v' });
  assert.equal(r.f, '1.5-1e+21-false-null-v');
  assert.equal(r.g, '');
  assert.deepEqual(r.h, [2]);
});

test('không chia sẻ tham chiếu; nội suy lồng; hằng', () => {
  const r = ev('l = [1]\na = "${l}"\nb = "${l}"\nc = "x${d}"\nd = "y${@k.1}"\nconst k = ["p", "q"]');
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.l);
  r.a.push(9);
  assert.deepEqual(r.b, [1]);
  assert.equal(r.c, 'xyq');
});

test('hằng của từng tệp, chuỗi thuần tham chiếu tới chuỗi khác tệp', () => {
  const r = ev({ main: 'const k = "m"\ninclude "b"\nv = "${@k}"', b: 'const k = "b"\nw = "${@k}"' });
  assert.deepEqual(r, { w: 'b', v: 'm' });
});

test('khóa __proto__ là khóa thường', () => {
  const r = ev('__proto__ { a = 1 }');
  assert.deepEqual(Object.keys(r), ['__proto__']);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
});
