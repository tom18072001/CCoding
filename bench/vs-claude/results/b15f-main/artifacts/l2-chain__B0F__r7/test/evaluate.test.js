import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate, buildMerged, resolveRef, NOT_FOUND } from '../src/evaluate.js';

const prog = (files, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.program;
};
const ev = (files, entry) => evaluate(prog(files, entry));

test('ví dụ mục 9: svc-prod', () => {
  const main = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }';
  assert.deepEqual(ev({ main }), { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('include và ghi đè mục 9, thứ tự khóa', () => {
  const r = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('ghi đè không đổi vị trí khóa', () => {
  const r = ev({ main: 'a = 1\nb = 2\na = 3\nc { x = 1 }\nb { y = 1 }' });
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
  assert.deepEqual(r, { a: 3, b: { y: 1 }, c: { x: 1 } });
});

test('mảng thay hẳn mảng cũ; Block thay giá trị không phải đối tượng', () => {
  const r = ev({ main: 'a = [1,2,3]\na = [9]\nb = 1\nb { c = 2 }\nd { e = 1 }\nd = 5' });
  assert.deepEqual(r, { a: [9], b: { c: 2 }, d: 5 });
});

test('${a} với a = null giữ null; nối chuỗi ra "null"', () => {
  assert.deepEqual(ev({ main: 'a = null\nb = "${a}"\nc = "x${a}"' }), { a: null, b: null, c: 'xnull' });
});

test('tham chiếu tới khóa khai báo muộn và bị ghi đè', () => {
  const r = ev({ main: 'include "b.cfg"\nx = "${y}"\ny = 2', 'b.cfg': 'y = 1' });
  assert.deepEqual(r, { y: 2, x: 2 });
});

test('1.50 → "1.5", 1e21, bool', () => {
  const r = ev({ main: 'n = 1.50\nb = true\ns = "${n}|${b}|${big}"\nbig = 1e21' });
  assert.equal(r.s, '1.5|true|1e+21');
});

test('nội suy lồng và Ref hằng theo tệp chứa chuỗi', () => {
  const r = ev({
    main: 'include "o.cfg"\nconst c = "main"\na = "${@c}"\nb = "${o}"',
    'o.cfg': 'const c = "other"\no = "${@c}-${p}"\np = "p"',
  });
  assert.deepEqual(r, { o: 'other-p', p: 'p', a: 'main', b: 'other-p' });
});

test('hằng là mảng, đi tiếp bằng chỉ mục', () => {
  const r = ev({ main: 'const l = [10, [20, 30]]\nx = "${@l.1.0}"\ny = "${@l}"' });
  assert.deepEqual(r, { x: 20, y: [10, [20, 30]] });
});

test('hai ${x} trỏ mảng cho ra hai mảng độc lập', () => {
  const r = ev({ main: 'x = [1, [2]]\na = "${x}"\nb = "${x}"' });
  assert.deepEqual(r.a, [1, [2]]);
  r.a.push(9);
  r.a[1].push(8);
  assert.deepEqual(r.b, [1, [2]]);
  assert.deepEqual(r.x, [1, [2]]);
});

test('khóa __proto__ không làm hỏng kết quả', () => {
  assert.deepEqual(Object.keys(ev({ main: '__proto__ = 1' })), ['__proto__']);
});

test('resolveRef gọi trực tiếp', () => {
  const p = prog({ main: 'const c = [1, 2]\na { b = [5, "x"] }\ns = "t"' });
  const merged = buildMerged(p);
  const ref = (path, c = false) => ({ type: 'Ref', path, const: c, line: 1, column: 1 });
  assert.equal(resolveRef(ref(['a', 'b', '0']), 'main', merged).node.value, 5);
  const o = resolveRef(ref(['a']), 'main', merged);
  assert.equal(o.kind, 'object');
  assert.equal(o.line, 2);
  assert.equal(o.column, 1);
  assert.equal(resolveRef(ref(['s', '0']), 'main', merged), NOT_FOUND); // không xuyên chuỗi
  assert.equal(resolveRef(ref(['a', 'b', '1', '0']), 'main', merged), NOT_FOUND);
  assert.equal(resolveRef(ref(['a', 'b', '01']), 'main', merged), NOT_FOUND);
  assert.equal(resolveRef(ref(['a', 'b', '2']), 'main', merged), NOT_FOUND);
  assert.equal(resolveRef(ref(['c', '1'], true), 'main', merged).node.value, 2);
  assert.equal(resolveRef(ref(['c', '2'], true), 'main', merged), NOT_FOUND);
  assert.equal(resolveRef(ref(['nope'], true), 'main', merged), NOT_FOUND);
});
