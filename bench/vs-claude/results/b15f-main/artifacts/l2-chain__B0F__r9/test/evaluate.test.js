import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';

function ev(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return evaluate(r.program);
}

test('ví dụ mục 9: ports và nội suy', () => {
  const main = `const env = "prod"
name = "svc-\${@env}"
ports = [80, 443]
http { port = "\${ports.0}" }
https { port = "\${ports.1}" }`;
  const r = ev({ main });
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  assert.deepEqual(Object.keys(r), ['name', 'ports', 'http', 'https']);
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const r = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('khóa khai báo sau include ghi đè; include sau ghi đè include trước', () => {
  const r = ev({
    main: 'x = 0\ninclude "a"\ninclude "b"\ny = "main"',
    a: 'x = 1\ny = "a"\nz = "a"',
    b: 'x = 2\nz = "b"',
  });
  assert.deepEqual(r, { x: 2, y: 'main', z: 'b' });
});

test('tham chiếu tới khóa khai báo muộn và tới giá trị cuối cùng', () => {
  const r = ev({ main: 'a = "${b}"\nb = 1\nb = 2' });
  assert.deepEqual(r, { a: 2, b: 2 });
});

test('thứ tự khóa khi ghi đè giữ chỗ cũ', () => {
  const r = ev({ main: 'a = 1\nb = 2\nc = 3\na { x = 1 }\nb = [1]' });
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
  assert.deepEqual(r, { a: { x: 1 }, b: [1], c: 3 });
});

test('Block thay giá trị không phải đối tượng; Assign thay đối tượng; mảng không trộn', () => {
  const r = ev({ main: 'a = 1\na { x = 1 }\nb { y = 1 }\nb = 5\nl = [1,2]\nl = [3]' });
  assert.deepEqual(r, { a: { x: 1 }, b: 5, l: [3] });
});

test('${a} với a = null giữ null; nối chuỗi ra "null"', () => {
  const r = ev({ main: 'a = null\nb = "${a}"\nc = "x-${a}"' });
  assert.deepEqual(r, { a: null, b: null, c: 'x-null' });
});

test('${@lst.1} chỉ mục vào hằng', () => {
  const r = ev({ main: 'const lst = ["p", "q"]\nv = "${@lst.1}"\nw = "i-${@lst.0}"' });
  assert.deepEqual(r, { v: 'q', w: 'i-p' });
});

test('hai ${x} cùng trỏ một mảng cho hai mảng khác nhau', () => {
  const r = ev({ main: 'x = [1, [2]]\na = "${x}"\nb = "${x}"' });
  assert.deepEqual(r.a, [1, [2]]);
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.x);
  assert.notEqual(r.a[1], r.b[1]);
});

test('số 1.50 và 1e21 trong nội suy', () => {
  const r = ev({ main: 'a = 1.50\nb = 1e21\ns = "${a}|${b}"' });
  assert.equal(r.s, '1.5|1e+21');
});

test('nội suy lồng và đối tượng giữ kiểu', () => {
  const r = ev({ main: 'a = "${b}-1"\nb = "${c}-2"\nc = "z"\no { k = 1 }\np = "${o}"' });
  assert.equal(r.a, 'z-2-1');
  assert.deepEqual(r.p, { k: 1 });
});

test('hằng theo tệp chứa chuỗi; chuỗi rỗng', () => {
  const r = ev({
    main: 'const c = "m"\ninclude "o"\ne = ""\nv = "${@c}"',
    o: 'const c = "o"\nw = "${@c}"',
  });
  assert.deepEqual(r, { w: 'o', e: '', v: 'm' });
});
