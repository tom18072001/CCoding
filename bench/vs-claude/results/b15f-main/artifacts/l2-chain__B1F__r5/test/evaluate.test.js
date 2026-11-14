import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { buildContext, resolveRef, collectStrings, evalLocated } from '../src/merge.js';

function ev(files, entry = 'main') {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return evaluate(p.program);
}

test('ví dụ mục 9 (1): hằng, nội suy, chỉ mục mảng', () => {
  const r = ev({
    main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }',
  });
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  assert.deepEqual(Object.keys(r), ['name', 'ports', 'http', 'https']);
});

test('ví dụ mục 9 (2): include và ghi đè, thứ tự khóa', () => {
  const r = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
  assert.deepEqual(Object.keys(r.server), ['host', 'port']);
});

test('khóa khai báo sau include ghi đè khóa từ include', () => {
  const r = ev({ main: 'include "b"\nx = 2', b: 'x = 1\ny = 1' });
  assert.deepEqual(r, { x: 2, y: 1 });
});

test('ghi đè trước include bị include ghi đè lại; include sau thắng include trước', () => {
  const r = ev({ main: 'x = 0\ninclude "a"\ninclude "b"', a: 'x = 1\nz = 1', b: 'x = 2' });
  assert.deepEqual(r, { x: 2, z: 1 });
  assert.deepEqual(Object.keys(r), ['x', 'z']);
});

test('ghi đè không đổi vị trí khóa; Assign thay khối và ngược lại; mảng không trộn', () => {
  const r = ev({ main: 'a = 1\nb { k = 1 }\nc = [1, 2]\na = 2\nb = 5\nc = [3]\nd { x = 1 }\nd { y = 2 }\ne = 1\ne { z = 1 }' });
  assert.deepEqual(r, { a: 2, b: 5, c: [3], d: { x: 1, y: 2 }, e: { z: 1 } });
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c', 'd', 'e']);
});

test('include trong khối trộn vào đối tượng hiện hành', () => {
  const r = ev({ main: 'srv { a = 1\n include "i"\n b = 3 }', i: 'a = 9\nb = 9\nc = 9' });
  assert.deepEqual(r, { srv: { a: 9, b: 3, c: 9 } });
});

test('tham chiếu thấy giá trị cuối: khai báo muộn hoặc bị ghi đè', () => {
  const r = ev({
    main: 'x = "${late}"\ny = "v=${over}"\nover = 1\ninclude "i"\nover = 2\nlate = "L"',
    i: 'over = 100',
  });
  assert.deepEqual(r, { x: 'L', y: 'v=2', over: 2, late: 'L' });
});

test('${a} với a = null', () => {
  const r = ev({ main: 'a = null\nb = "${a}"\nc = "x${a}"' });
  assert.deepEqual(r, { a: null, b: null, c: 'xnull' });
});

test('giữ kiểu mảng/đối tượng và không chia sẻ tham chiếu', () => {
  const r = ev({ main: 'lst = [1, [2]]\nobj { k = [1] }\na = "${lst}"\nb = "${lst}"\no1 = "${obj}"\no2 = "${obj}"' });
  assert.deepEqual(r.a, [1, [2]]);
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.lst);
  assert.notEqual(r.a[1], r.b[1]);
  assert.notEqual(r.o1, r.o2);
  assert.notEqual(r.o1.k, r.obj.k);
  r.a.push(9);
  assert.deepEqual(r.b, [1, [2]]);
  assert.deepEqual(r.lst, [1, [2]]);
});

test('định dạng số khi nối chuỗi: 1.50, 1e21, bool', () => {
  const r = ev({ main: 'a = 1.50\nb = 1e21\nc = true\nd = -0\ns = "${a}|${b}|${c}|${d}"\nf = "${a}"' });
  assert.equal(r.s, '1.5|1e+21|true|0');
  assert.equal(r.f, 1.5);
});

test('${@lst.1} chỉ mục vào hằng mảng; hằng theo tệp chứa chuỗi', () => {
  const r = ev({
    main: 'const lst = ["x", "y"]\ncv = "${@lst.1}"\ncs = "<${@lst.0}>"\ninclude "i"',
    i: 'const lst = ["p", "q"]\nz = "${@lst.1}"',
  });
  assert.deepEqual(r, { cv: 'y', cs: '<x>', z: 'q' });
});

test('hằng tham chiếu hằng; nội suy lồng; chuỗi rỗng', () => {
  const r = ev({ main: 'const a = "A"\nconst b = "${@a}B"\nx = "${@b}!"\ny = "${z}"\nz = "<${x}>"\ne = ""' });
  assert.deepEqual(r, { x: 'AB!', y: '<AB!>', z: '<AB!>', e: '' });
});

test('đi qua mảng bằng chỉ số; khóa __proto__ không hỏng đối tượng', () => {
  const r = ev({ main: 'm = [[1, 2]]\nv = "${m.0.1}"' });
  assert.equal(r.v, 2);
  const q = ev({ main: '__proto__ { a = 1 }\nb = "${__proto__.a}"' });
  assert.equal(q.b, 1);
  assert.equal(Object.getPrototypeOf(q), Object.prototype);
  assert.deepEqual(Object.keys(q), ['__proto__', 'b']);
});

test('API nội bộ: resolveRef, collectStrings, evalLocated', () => {
  const p = parseProject({ main: 'a { s = "x" }\nl = ["p", "q"]\nr = "${a}"\nstr = "t"\nn = 1' }, 'main');
  const ctx = buildContext(p.program);
  const t = resolveRef(ctx, { path: ['a'], const: false }, 'main');
  assert.equal(t.kind, 'object');
  assert.equal(collectStrings(t).length, 1);
  assert.equal(resolveRef(ctx, { path: ['str', '0'], const: false }, 'main'), undefined);
  assert.equal(resolveRef(ctx, { path: ['l', '2'], const: false }, 'main'), undefined);
  assert.equal(resolveRef(ctx, { path: ['l', '01'], const: false }, 'main'), undefined);
  const loc = evalLocated(ctx, ctx.root);
  assert.deepEqual(loc.loc, { file: 'main', line: 1, column: 1 });
  const rNode = loc.entries.find((e) => e.key === 'r').node;
  assert.deepEqual(rNode.loc, { file: 'main', line: 3, column: 5 });
  assert.deepEqual(rNode.entries[0].node.loc, rNode.loc);
  const aNode = loc.entries.find((e) => e.key === 'a');
  assert.deepEqual(aNode.node.loc, { file: 'main', line: 1, column: 1 });
});
