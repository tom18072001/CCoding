import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { buildModel, evalTree, resolveRef, stringsOf, listRefs } from '../src/resolve.js';

const ev = (files, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return evaluate(p.program);
};

test('ví dụ mục 9: nội suy, hằng, chỉ mục', () => {
  const r = ev({
    main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }',
  });
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

test('ghi đè giữa các include: include sau thắng, khóa sau include thắng, mảng không trộn', () => {
  const r = ev({
    main: 'include "a"\ninclude "b"\nx = 9\nlst = [1]',
    a: 'x = 1\ny = 1\nlst = [7, 8, 9]\nk { p = 1 }',
    b: 'y = 2\nk { q = 2 }\nlst = [5, 6]',
  });
  assert.deepEqual(r, { x: 9, y: 2, lst: [1], k: { p: 1, q: 2 } });
  assert.deepEqual(Object.keys(r), ['x', 'y', 'lst', 'k']);
});

test('include trong khối vào đối tượng hiện hành', () => {
  const r = ev({ main: 's { a = 1\n include "i"\n c = 3 }', i: 'a = 0\nb = 2' });
  assert.deepEqual(r, { s: { a: 0, b: 2, c: 3 } });
});

test('Block thay giá trị không phải đối tượng; Assign thay đối tượng', () => {
  assert.deepEqual(ev({ main: 'a = 1\na { b = 2 }\nc { d = 1 }\nc = 5' }), { a: { b: 2 }, c: 5 });
});

test('tham chiếu tới khóa khai báo muộn và khóa bị ghi đè thấy giá trị cuối', () => {
  const r = ev({
    main: 'u = "${later}"\nv = "${o}"\ninclude "i"\nlater = "L"\no = 2',
    i: 'o = 1',
  });
  assert.deepEqual(r, { u: 'L', v: 2, o: 2, later: 'L' });
});

test('thứ tự khóa: ghi đè khóa giữ chỗ cũ', () => {
  const r = ev({ main: 'a = 1\nb = 2\nc { x = 1 }\na = { }'.replace('a = { }', 'a = [3]') });
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
  const r2 = ev({ main: 'a = 1\nb = 2\na { z = 1 }' });
  assert.deepEqual(Object.keys(r2), ['a', 'b']);
  assert.deepEqual(r2.a, { z: 1 });
});

test('hai ${x} trỏ cùng mảng cho hai mảng khác nhau', () => {
  const r = ev({ main: 'x = [1, [2]]\na = "${x}"\nb = "${x}"' });
  assert.deepEqual(r.a, [1, [2]]);
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.x);
  assert.notEqual(r.a[1], r.b[1]);
  r.a[1].push(9);
  assert.deepEqual(r.b, [1, [2]]);
});

test('đối tượng qua ${} không chia sẻ tham chiếu', () => {
  const r = ev({ main: 'o { k = 1 }\np = "${o}"' });
  assert.deepEqual(r.p, { k: 1 });
  assert.notEqual(r.p, r.o);
});

test('a = null rồi ${a}', () => {
  const r = ev({ main: 'a = null\nb = "${a}"\nc = "x${a}"' });
  assert.deepEqual(r, { a: null, b: null, c: 'xnull' });
});

test('const có chỉ mục ${@lst.1}, const khai báo muộn, const tham chiếu const', () => {
  const r = ev({ main: 'a = "${@lst.1}"\nb = "n=${@lst.0}"\nconst lst = [10, "${@z}"]\nconst z = "zz"\nc = "${@lst.1}"' });
  assert.deepEqual(r, { a: 'zz', b: 'n=10', c: 'zz' });
});

test('hằng thuộc tệp chứa chuỗi', () => {
  const r = ev({ main: 'const c = "M"\nm = "${@c}"\ninclude "i"', i: 'const c = "I"\ni = "${@c}"' });
  assert.deepEqual(r, { m: 'M', i: 'I' });
});

test('số sang chuỗi bằng JSON.stringify; bool; nội suy lồng', () => {
  const r = ev({ main: 'n = 1.50\nbig = 1e21\nt = true\ns = "${n}|${big}|${t}"\nl1 = "<${s}>"\nl2 = "${l1}!"\nneg = -0' });
  assert.equal(r.s, '1.5|1e+21|true');
  assert.equal(r.l1, '<1.5|1e+21|true>');
  assert.equal(r.l2, '<1.5|1e+21|true>!');
  assert.ok(Object.is(r.neg, 0));
});

test('chuỗi rỗng, chuỗi thuần tham chiếu giữ kiểu, tham chiếu qua mảng/chuỗi trong mảng', () => {
  const r = ev({ main: 'e = ""\nl = [1, "${p}", ["${q}"]]\np = 5\nq = "x"\nm = "${l.2.0}"' });
  assert.deepEqual(r, { e: '', l: [1, 5, ['x']], p: 5, q: 'x', m: 'x' });
});

test('khóa __proto__ không làm hỏng kết quả', () => {
  const r = ev({ main: '__proto__ { a = 1 }' });
  assert.deepEqual(Object.keys(r), ['__proto__']);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
});

test('API resolve: phân giải, S(đích) chỉ định nghĩa thắng, vị trí nguồn', () => {
  const p = parseProject({ main: 'a = "old"\na = "${b}"\nb = [ "x" ]\nc = "${b}"' }, 'main').program;
  const m = buildModel(p);
  const refs = listRefs(p);
  assert.deepEqual(refs.map((r) => [r.pure, r.ref.path[0]]), [[true, 'b'], [true, 'b']]);
  const res = resolveRef(m, 'main', refs[0].ref);
  assert.equal(res.found, true);
  assert.deepEqual(stringsOf(res.target).map((s) => s.node.parts[0].value), ['x']);
  assert.equal(resolveRef(m, 'main', { path: ['a', 'x'], const: false }).found, false); // không xuyên chuỗi
  const t = evalTree(m);
  const c = t.entries.find((e) => e.key === 'c').node;
  assert.equal(c.kind, 'array');
  assert.deepEqual([c.pos.line, c.pos.column, c.items[0].pos.line, c.items[0].pos.column], [4, 5, 4, 5]);
  const b = t.entries.find((e) => e.key === 'b').node;
  assert.deepEqual([b.pos.line, b.pos.column, b.items[0].pos.column], [3, 5, 7]);
});
