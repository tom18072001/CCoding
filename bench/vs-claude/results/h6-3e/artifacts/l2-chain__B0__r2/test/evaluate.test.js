import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';
import { evaluate } from '../src/evaluate.js';

const ev = (files, entry = 'main') => {
  const p = parseProject(typeof files === 'string' ? { main: files } : files, entry);
  assert.equal(p.ok, true);
  assert.deepEqual(check(p.program), []);
  return evaluate(p.program);
};

test('ví dụ spec: ports/http/https', () => {
  const r = ev('const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }');
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('include và ghi đè, thứ tự khóa', () => {
  const r = ev({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a" port = 1 }\nmode = "dev"' });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('Assign thay Block, Block thay giá trị khác, mảng không trộn, giữ vị trí khóa', () => {
  const files = {
    main: 'a = 1\nb = 2\nx { k = 1 }\ny = 1\nl = [1,2]\ninclude "i"\ninclude "j"',
    i: 'a = 3\nx = 5\ny { k = 1 }\nl = [3]',
    j: 'x { z = 1 }',
  };
  const r = ev(files);
  assert.deepEqual(Object.keys(r), ['a', 'b', 'x', 'y', 'l']);
  assert.deepEqual(r, { a: 3, b: 2, x: { z: 1 }, y: { k: 1 }, l: [3] });
});

test('khối trộn sâu qua include, include sau ghi đè include trước', () => {
  const r = ev({
    main: 'include "i"\ninclude "j"\ns { n = 3 }',
    i: 's { a = 1 b = 1 }\nv = "i"',
    j: 's { b = 2 }\nv = "j"',
  });
  assert.deepEqual(r, { s: { a: 1, b: 2, n: 3 }, v: 'j' });
});

test('tham chiếu thấy giá trị cuối, kể cả khai báo muộn', () => {
  assert.deepEqual(ev('a = "${b}"\nb = 2'), { a: 2, b: 2 });
  assert.deepEqual(ev({ main: 'a = "${v}"\ninclude "i"\nv = "m"', i: 'v = "i"' }), { a: 'm', v: 'm' });
});

test('giữ kiểu, ép chuỗi, lồng nhau', () => {
  const r = ev('n = 1.50\nbig = 1e21\nt = true\nz = null\nl = [1, [2]]\na = "${n}"\nb = "${l}"\nc = "${l}"\ns = "${n}|${big}|${t}|${z}"\ne = ""\nn2 = "${a}!"\nd = "${n2}"');
  assert.deepEqual(r.a, 1.5);
  assert.deepEqual(r.b, [1, [2]]);
  assert.notEqual(r.b, r.c);
  assert.notEqual(r.b[1], r.c[1]);
  assert.equal(r.s, '1.5|1e+21|true|null');
  assert.equal(r.e, '');
  assert.equal(r.n2, '1.5!');
  assert.equal(r.d, '1.5!');
});

test('tham chiếu tới đối tượng, chỉ mục mảng, hằng mảng', () => {
  const r = ev('const lst = [10, 20]\nsrv { h = "x" }\ncopy = "${srv}"\nh = "${srv.h}"\nsec = "${@lst.1}"\nall = "${@lst}"');
  assert.deepEqual(r, { srv: { h: 'x' }, copy: { h: 'x' }, h: 'x', sec: 20, all: [10, 20] });
  assert.notEqual(r.copy, r.srv);
});

test('nội suy ví dụ spec', () => {
  const r = ev('port = 8080\nserver { host = "0.0.0.0"\n url = "http://${server.host}:${port}"\n limits { max = "${port}" } }');
  assert.equal(r.server.url, 'http://0.0.0.0:8080');
  assert.equal(r.server.limits.max, 8080);
});

test('khóa __proto__ là khóa thường', () => {
  const r = ev('__proto__ { a = 1 }');
  assert.deepEqual(Object.keys(r), ['__proto__']);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
});

test('đường dẫn không đi xuyên qua chuỗi; null là đích hợp lệ; hằng trong tệp include', () => {
  assert.deepEqual(ev('a = null\nb = "${a}"\nc = "x${a}"'), { a: null, b: null, c: 'xnull' });
  assert.deepEqual(ev({ main: 'include "i"\nv = "${@k}"\nconst k = "m"', i: 'w = "${@k}"\nconst k = "i"' }), { w: 'i', v: 'm' });
});
