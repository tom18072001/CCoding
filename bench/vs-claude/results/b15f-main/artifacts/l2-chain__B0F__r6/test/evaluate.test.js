import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';

function ev(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.ok(r.ok, JSON.stringify(r.error));
  return evaluate(r.program);
}

test('ví dụ mục 9 (đã bỏ dấu phẩy)', () => {
  const main = `const env = "prod"
name = "svc-\${@env}"
ports = [80, 443]
http { port = "\${ports.0}" }
https { port = "\${ports.1}" }`;
  assert.deepEqual(ev({ main }), { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('include và ghi đè, thứ tự khóa', () => {
  const out = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(out, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(out), ['server', 'mode']);
});

test('tham chiếu khóa khai báo muộn hơn', () => {
  assert.deepEqual(ev({ main: 'a = "${b}"\nb = 5' }), { a: 5, b: 5 });
});

test('tham chiếu thấy giá trị bị include ghi đè', () => {
  const out = ev({ main: 'include "x.cfg"\nv = 2\nr = "${v}"', 'x.cfg': 'v = 1' });
  assert.deepEqual(out, { v: 2, r: 2 });
});

test('khóa bị thay vẫn giữ vị trí cũ', () => {
  const out = ev({ main: 'a = 1\nb = 2\na = "x"\nb { c = 1 }' });
  assert.deepEqual(Object.keys(out), ['a', 'b']);
  assert.deepEqual(out, { a: 'x', b: { c: 1 } });
});

test('block thay giá trị vô hướng; assign thay block', () => {
  assert.deepEqual(ev({ main: 'a = 1\na { x = 1 }' }), { a: { x: 1 } });
  assert.deepEqual(ev({ main: 'a { x = 1 }\na = 2' }), { a: 2 });
});

test('mảng không bị trộn', () => {
  assert.deepEqual(ev({ main: 'a = [1,2,3]\na = [4]' }), { a: [4] });
  assert.deepEqual(ev({ main: 'include "b"\na = [9]', b: 'a = [1,2]' }), { a: [9] });
});

test('${a} khi a = null', () => {
  assert.deepEqual(ev({ main: 'a = null\nb = "${a}"\nc = "x${a}"' }), { a: null, b: null, c: 'xnull' });
});

test('${@lst.1} chỉ mục vào hằng', () => {
  assert.deepEqual(ev({ main: 'const lst = [10, "k"]\na = "${@lst.1}"\nb = "${@lst.0}!"' }), { a: 'k', b: '10!' });
});

test('hằng thuộc tệp chứa chuỗi', () => {
  const out = ev({
    main: 'const c = "m"\ninclude "o"\nx = "${@c}"',
    o: 'const c = "o"\ny = "${@c}"',
  });
  assert.deepEqual(out, { y: 'o', x: 'm' });
});

test('số: 1.50 ra 1.5, 1e21 ra 1e+21 khi nối chuỗi', () => {
  const out = ev({ main: 'a = "n=${n}"\nn = 1.50\nb = "${m}"\nm = 1e21\nc = "${m}|${t}"\nt = true' });
  assert.equal(out.a, 'n=1.5');
  assert.equal(out.b, 1e21);
  assert.equal(out.c, '1e+21|true');
});

test('nội suy lồng', () => {
  assert.deepEqual(ev({ main: 'a = "1${b}"\nb = "2${c}"\nc = "3"' }), { a: '123', b: '23', c: '3' });
});

test('chuỗi rỗng', () => {
  assert.deepEqual(ev({ main: 'a = ""' }), { a: '' });
});

test('hai ${x} cùng trỏ một mảng ra hai mảng khác tham chiếu', () => {
  const out = ev({ main: 'x = [1, [2]]\na = "${x}"\nb = "${x}"' });
  assert.deepEqual(out.a, [1, [2]]);
  assert.notEqual(out.a, out.b);
  assert.notEqual(out.a, out.x);
  assert.notEqual(out.a[1], out.b[1]);
  out.a[1].push(3);
  assert.deepEqual(out.b, [1, [2]]);
});

test('tham chiếu tới đối tượng giữ kiểu, bản sao', () => {
  const out = ev({ main: 's { a = 1 }\nc = "${s}"' });
  assert.deepEqual(out.c, { a: 1 });
  assert.notEqual(out.c, out.s);
});

test('khóa __proto__ là khóa thường', () => {
  const out = ev({ main: '__proto__ = 1' });
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.equal(Object.keys(out)[0], '__proto__');
});
