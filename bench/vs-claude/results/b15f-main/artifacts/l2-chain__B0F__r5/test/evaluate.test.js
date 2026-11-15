import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';

function ev(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.ok(r.ok, JSON.stringify(r.error));
  return evaluate(r.program);
}
const keys = (o) => Object.keys(o);
const R = (s) => s.replaceAll('@{', '${'); // viết @{...} cho gọn trong template

test('ví dụ mục 9: cấu hình đầy đủ', () => {
  const out = ev({ main: R(`const env = "prod"
name = "svc-@{@env}"
ports = [80, 443]
http { port = "@{ports.0}" }
https { port = "@{ports.1}" }
`) });
  assert.deepStrictEqual(out, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  assert.deepStrictEqual(keys(out), ['name', 'ports', 'http', 'https']);
});

test('ví dụ mục 9: include và ghi đè', () => {
  const out = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"\n',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"\n',
  });
  assert.deepStrictEqual(out, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepStrictEqual(keys(out), ['server', 'mode']);
});

test('include sau ghi đè include trước; khóa sau include ghi đè', () => {
  const out = ev({
    main: 'include "a"\ninclude "b"\nz = 1\n',
    a: 'x = 1\ny = 1\nz = 0\n',
    b: 'x = 2\n',
  });
  assert.deepStrictEqual(out, { x: 2, y: 1, z: 1 });
});

test('Block thay giá trị không phải đối tượng; mảng bị thay hẳn', () => {
  const out = ev({ main: 'a = 1\na { b = 2 }\nl = [1,2,3]\nl = [9]\nm { k = 1 }\nm = [1]\nm { q = 2 }\n' });
  assert.deepStrictEqual(out, { a: { b: 2 }, l: [9], m: { q: 2 } });
});

test('thứ tự khóa giữ chỗ khi ghi đè', () => {
  const out = ev({ main: 'a = 1\nb = 2\nc = 3\na = [1]\nb { x = 1 }\n' });
  assert.deepStrictEqual(keys(out), ['a', 'b', 'c']);
  assert.deepStrictEqual(out, { a: [1], b: { x: 1 }, c: 3 });
});

test('tham chiếu tới khóa khai báo muộn và khóa bị ghi đè', () => {
  const out = ev({
    main: R('include "base"\nv = "@{late}"\nlate = "L"\nw = "pre-@{late}"\n'),
    base: 'late = "old"\n',
  });
  assert.deepStrictEqual(out, { late: 'L', v: 'L', w: 'pre-L' });
});

test('hằng chỉ mục vào mảng, hằng của tệp chứa chuỗi', () => {
  const out = ev({
    main: R('include "inc"\nx = "@{@lst.1}"\ny = "n=@{@lst.0}"\nconst lst = [10, "s"]\n'),
    inc: R('const lst = [1, 2]\nz = "@{@lst.1}"\n'),
  });
  assert.deepStrictEqual(out, { z: 2, x: 's', y: 'n=10' });
});

test('nội suy lồng và số chuyển bằng JSON.stringify', () => {
  const out = ev({ main: R('a = "x@{b}"\nb = "y@{c}"\nc = 1.50\nd = 1e21\ne = "@{d}|@{c}|@{t}|@{n}"\nt = true\nn = null\n') });
  assert.strictEqual(out.a, 'xy1.5');
  assert.strictEqual(out.e, '1e+21|1.5|true|null');
});

test('a = null rồi ${a}; chuỗi rỗng; \\$ là văn bản', () => {
  const out = ev({ main: R('a = null\nb = "@{a}"\nc = "v@{a}"\nd = ""\ne = "\\@{a}"\n').replace('\\${a}', '\\${a}') });
  assert.deepStrictEqual(out, { a: null, b: null, c: 'vnull', d: '', e: '${a}' });
});

test('giữ nguyên kiểu đích; không chia sẻ tham chiếu mảng/đối tượng', () => {
  const out = ev({ main: R('arr = [1, [2]]\np = "@{arr}"\nq = "@{arr}"\nobj { k = 1 }\no = "@{obj}"\n') });
  assert.deepStrictEqual(out.p, [1, [2]]);
  assert.notStrictEqual(out.p, out.arr);
  assert.notStrictEqual(out.p, out.q);
  assert.notStrictEqual(out.p[1], out.arr[1]);
  out.p[1].push(3);
  assert.deepStrictEqual(out.arr, [1, [2]]);
  assert.deepStrictEqual(out.o, { k: 1 });
  assert.notStrictEqual(out.o, out.obj);
});

test('tham chiếu thuần tới đối tượng và tới khóa con', () => {
  const out = ev({ main: R('a { b = 1 }\nc = "@{a}"\nd = "@{a.b}"\n') });
  assert.deepStrictEqual(out.c, { b: 1 });
  assert.strictEqual(out.d, 1);
});

test('include trong khối và tệp được include nhiều lần', () => {
  const out = ev({
    main: 's { include "d"\n k = 1 }\nt { include "d" }\n',
    d: 'v = 5\n',
  });
  assert.deepStrictEqual(out, { s: { v: 5, k: 1 }, t: { v: 5 } });
});

test('đầu vào có vòng include không lặp vô hạn', () => {
  const out = ev({ main: 'include "a"\nx = 1\n', a: 'include "main"\ny = 2\n' });
  assert.deepStrictEqual(out, { y: 2, x: 1 });
});
