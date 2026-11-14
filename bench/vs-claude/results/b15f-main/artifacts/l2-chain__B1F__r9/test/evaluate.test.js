import test from 'node:test';
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
https { port = "\${ports.1}" }
`;
  assert.deepEqual(ev({ main }), {
    name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 },
  });
});

test('include và ghi đè (mục 9), thứ tự khóa', () => {
  const files = {
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"\n',
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"\n',
  };
  const r = ev(files);
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('khóa khai báo sau include ghi đè; include sau ghi đè include trước', () => {
  const files = {
    a: 'x = 1\ny = 1\n', b: 'x = 2\n',
    main: 'x = 0\ninclude "a"\ninclude "b"\ny = 9\n',
  };
  assert.deepEqual(ev(files), { x: 2, y: 9 });
});

test('thứ tự khóa giữ chỗ cũ khi bị ghi đè', () => {
  const r = ev({ main: 'a = 1\nb = 2\nc = 3\na = [1]\nb { z = 1 }\n' });
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
  assert.deepEqual(r, { a: [1], b: { z: 1 }, c: 3 });
});

test('Assign ghi đè Block và ngược lại; mảng không trộn; trộn sâu', () => {
  assert.deepEqual(ev({ main: 'a { x = 1 }\na = 5\na { y = 2 }\n' }), { a: { y: 2 } });
  assert.deepEqual(ev({ main: 'l = [1,2,3]\nl = [9]\n' }), { l: [9] });
  assert.deepEqual(ev({ main: 'o { a { x = 1 } }\no { a { y = 2 } b = 1 }\n' }), { o: { a: { x: 1, y: 2 }, b: 1 } });
});

test('Ref tới khóa khai báo muộn hơn và khóa bị include ghi đè', () => {
  assert.deepEqual(ev({ main: 'u = "h-${later}"\nlater = "x"\n' }), { u: 'h-x', later: 'x' });
  const files = { inc: 'v = "cu"\nw = "${v}"\n', main: 'include "inc"\nv = "moi"\n' };
  assert.deepEqual(ev(files), { v: 'moi', w: 'moi' });
});

test('${@lst.1} và const theo tệp chứa chuỗi', () => {
  const files = {
    inc: 'const c = "inc"\nfrom_inc = "${@c}"\n',
    main: 'const lst = [10, 20]\nconst c = "main"\nn = "${@lst.1}"\ns = "k-${@lst.0}"\nm = "${@c}"\ninclude "inc"\n',
  };
  assert.deepEqual(ev(files), { n: 20, s: 'k-10', m: 'main', from_inc: 'inc' });
});

test('a = null rồi ${a}; nối chuỗi dùng JSON.stringify', () => {
  const r = ev({ main: 'a = null\nb = "${a}"\nc = "x${a}"\nd = 1.50\ne = "[${d}]"\nf = 1e21\ng = "${f}!"\nh = true\ni = "${h}${h}"\n' });
  assert.equal(r.b, null);
  assert.equal(r.c, 'xnull');
  assert.equal(r.e, '[1.5]');
  assert.equal(r.g, '1e+21!');
  assert.equal(r.i, 'truetrue');
});

test('chuỗi rỗng, chuỗi thuần Ref giữ kiểu, nội suy lồng', () => {
  const r = ev({ main: 'e = ""\nport = 8080\nsrv { host = "h" url = "http://${srv.host}:${port}" lim { max = "${port}" } }\nn1 = "${n2}"\nn2 = "${n3}-x"\nn3 = "z"\n' });
  assert.equal(r.e, '');
  assert.equal(r.srv.url, 'http://h:8080');
  assert.equal(r.srv.lim.max, 8080);
  assert.equal(r.n1, 'z-x');
});

test('Ref tới đối tượng và mảng giữ kiểu; không chia sẻ tham chiếu', () => {
  const r = ev({ main: 'arr = [1, [2]]\nx = "${arr}"\ny = "${arr}"\no { k = 1 }\np = "${o}"\nq = "${o}"\n' });
  assert.deepEqual(r.x, [1, [2]]);
  assert.notEqual(r.x, r.y);
  assert.notEqual(r.x, r.arr);
  assert.notEqual(r.x[1], r.y[1]);
  assert.notEqual(r.p, r.q);
  assert.notEqual(r.p, r.o);
  r.x.push(3);
  assert.deepEqual(r.y, [1, [2]]);
});

test('Ref đi qua mảng lồng', () => {
  const r = ev({ main: 'm = [[1, 2], [3]]\na = "${m.0.1}"\nb = "${m.1.0}"\n' });
  assert.equal(r.a, 2);
  assert.equal(r.b, 3);
});

test('khóa __proto__ là khóa thường', () => {
  const r = ev({ main: '__proto__ = 1\n' });
  assert.deepEqual(Object.keys(r), ['__proto__']);
});
