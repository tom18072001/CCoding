import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { mergeProgram, resolveRef, stringsOf } from '../src/merge.js';

function ev(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return evaluate(r.program);
}
const keys = (o) => Object.keys(o);

test('ví dụ mục 9: nội suy, mảng, giữ kiểu', () => {
  const main = `const env = "prod"
name = "svc-\${@env}"
ports = [80, 443]
http { port = "\${ports.0}" }
https { port = "\${ports.1}" }`;
  const out = ev({ main });
  assert.deepEqual(out, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  assert.deepEqual(keys(out), ['name', 'ports', 'http', 'https']);
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const out = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(out, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(keys(out), ['server', 'mode']);
});

test('ghi đè giữ chỗ khóa cũ; Block thay thế giá trị vô hướng', () => {
  const out = ev({ main: 'a = 1\nb = 2\na = 3\nc = 1\nc { x = 1 }\nb { y = 1 }' });
  assert.deepEqual(out, { a: 3, b: { y: 1 }, c: { x: 1 } });
  assert.deepEqual(keys(out), ['a', 'b', 'c']);
});

test('Assign thay đối tượng, Block sau đó tạo đối tượng mới (không trộn với cái cũ)', () => {
  const out = ev({ main: 'o { a = 1 }\no = 5\no { b = 2 }' });
  assert.deepEqual(out, { o: { b: 2 } });
});

test('include theo thứ tự: include sau ghi đè include trước, khóa sau include ghi đè', () => {
  const out = ev({
    main: 'include "a"\ninclude "b"\nz = 1\ninclude "c"',
    a: 'x = "a"\ny = "a"\nz = "a"',
    b: 'x = "b"',
    c: 'z = "c"',
  });
  assert.deepEqual(out, { x: 'b', y: 'a', z: 'c' });
  assert.deepEqual(keys(out), ['x', 'y', 'z']);
});

test('include trong khối vào đúng đối tượng hiện hành; tệp include lại hai lần', () => {
  const out = ev({ main: 's { include "i"\n k = 1 }\nt { include "i" }', i: 'h = "x"\nk = 0' });
  assert.deepEqual(out, { s: { h: 'x', k: 1 }, t: { h: 'x', k: 0 } });
});

test('mảng không bị trộn', () => {
  const out = ev({ main: 'include "b"\nl = [3]', b: 'l = [1, 2]' });
  assert.deepEqual(out, { l: [3] });
});

test('tham chiếu tới khóa khai báo muộn và khóa đã bị ghi đè', () => {
  const out = ev({
    main: 'include "b"\nu = "${late}"\nv = "${over}"\nlate = 7\nover = "mới"',
    b: 'over = "cũ"',
  });
  assert.deepEqual(out, { over: 'mới', u: 7, v: 'mới', late: 7 });
});

test('hằng có chỉ mục, hằng tham chiếu hằng, chỉ thấy hằng cùng tệp', () => {
  const out = ev({
    main: 'include "o"\nconst l = ["a", "b${@n}"]\nconst n = 5\nx = "${@l.1}"\ny = "${@l}"\nz = "${@l.0}-${@n}"',
    o: 'const n = "khác"\nw = "${@n}"',
  });
  assert.deepEqual(out, { w: 'khác', x: 'b5', y: ['a', 'b5'], z: 'a-5' });
});

test('nội suy: số, bool, null, chuỗi rỗng, thoát', () => {
  const out = ev({
    main: 'a = 1.50\nb = 1e21\nc = true\nd = null\ne = ""\nf = "${a}|${b}|${c}|${d}|"\ng = "\\${a}"\nh = "${d}"',
  });
  assert.equal(out.f, '1.5|1e+21|true|null|');
  assert.equal(out.e, '');
  assert.equal(out.g, '${a}');
  assert.equal(out.h, null);
});

test('nội suy lồng nhau và chuỗi thuần tham chiếu qua nhiều bước', () => {
  const out = ev({ main: 'a = "x"\nb = "${a}-y"\nc = "${b}-z"\nd = "${c}"\ne = "${t}"\nt = "${n}"\nn = [1]' });
  assert.equal(out.c, 'x-y-z');
  assert.equal(out.d, 'x-y-z');
  assert.deepEqual(out.e, [1]);
});

test('tham chiếu tới đối tượng, null, phần tử mảng lồng', () => {
  const out = ev({ main: 'o { p = 1 }\nc = "${o}"\nn = null\nm = "${n}"\nl = [[1, 2], "${o.p}"]\nq = "${l.0.1}"' });
  assert.deepEqual(out.c, { p: 1 });
  assert.equal(out.m, null);
  assert.deepEqual(out.l, [[1, 2], 1]);
  assert.equal(out.q, 2);
});

test('bản sao độc lập, không chia sẻ tham chiếu', () => {
  const out = ev({ main: 'l = [1, 2]\no { k = [1] }\na = "${l}"\nb = "${l}"\nc = "${o}"\nd = "${o}"' });
  assert.notEqual(out.a, out.b);
  assert.notEqual(out.l, out.a);
  assert.notEqual(out.c, out.d);
  assert.notEqual(out.c.k, out.d.k);
  out.a.push(9);
  assert.deepEqual(out.b, [1, 2]);
  assert.deepEqual(out.l, [1, 2]);
});

test('khóa __proto__ là khóa thường; kết quả là JSON thuần', () => {
  const r = parseProject({ main: '__proto__ { x = 1 }\ny = "${__proto__.x}"' }, 'main');
  const o = evaluate(r.program);
  assert.equal(Object.getPrototypeOf(o), Object.prototype);
  assert.deepEqual(Object.keys(o), ['__proto__', 'y']);
  assert.equal(o.y, 1);
  assert.equal(JSON.stringify(ev({ main: 'a = [1, "s", null, true]' })), '{"a":[1,"s",null,true]}');
});

test('merge: vị trí đối tượng, câu lệnh thắng, phân giải', () => {
  const r = parseProject({ main: 'a = 1\na { x = "s" }\na { y = [1, "t"] }\nb = "${a.y.1}"' }, 'main');
  const m = mergeProgram(r.program);
  const a = m.root.entries.get('a');
  assert.equal(a.value.kind, 'object');
  assert.deepEqual([a.value.file, a.value.line, a.value.column], ['main', 2, 1]);
  assert.equal(a.stmt.line, 2);
  assert.equal(a.lastStmt.line, 3);
  const ref = r.program.files.main.body[3].value.parts[0];
  const t = resolveRef(m, ref, 'main');
  assert.equal(t.node.type, 'String');
  assert.equal(resolveRef(m, { path: ['a', 'y', '01'], const: false }, 'main'), null);
  assert.equal(resolveRef(m, { path: ['b', 'x'], const: false }, 'main'), null); // không đi xuyên chuỗi
  assert.equal(resolveRef(m, { path: ['a', 'y', '2'], const: false }, 'main'), null);
  assert.equal(resolveRef(m, { path: ['toString'], const: false }, 'main'), null);
  assert.equal(stringsOf(resolveRef(m, { path: ['a'], const: false }, 'main')).length, 2);
});
