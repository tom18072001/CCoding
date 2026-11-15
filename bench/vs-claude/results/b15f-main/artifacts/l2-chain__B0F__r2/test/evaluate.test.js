import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate, merge, resolveRef } from '../src/evaluate.js';

const prog = (files, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.program;
};
const ev = (src) => evaluate(prog(typeof src === 'string' ? { main: src } : src));

test('ví dụ mục 9: name/ports/http/https', () => {
  const r = ev('const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }');
  assert.deepStrictEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const r = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a" port = 1 }\nmode = "dev"',
  });
  assert.deepStrictEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
  assert.deepEqual(Object.keys(r.server), ['host', 'port']);
});

test('tham chiếu thấy giá trị cuối: khóa khai báo muộn và bị include ghi đè', () => {
  assert.deepStrictEqual(ev('a = "${b}"\nb = 1'), { a: 1, b: 1 });
  const r = ev({ main: 'x = "${y}"\ninclude "o"\n', o: 'y = 7' });
  assert.deepStrictEqual(r, { x: 7, y: 7 });
  const r2 = ev({ main: 'include "o"\nx = "v=${y}"\ny = 2', o: 'y = 1' });
  assert.deepStrictEqual(r2, { y: 2, x: 'v=2' });
});

test('thứ tự khóa khi ghi đè giữ chỗ cũ', () => {
  const r = ev('a = 1\nb = 2\nc = 3\na = [1]\nb { z = 1 }');
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
  assert.deepStrictEqual(r, { a: [1], b: { z: 1 }, c: 3 });
});

test('Block thay giá trị không phải đối tượng; Assign thay Block; mảng thay hẳn', () => {
  assert.deepStrictEqual(ev('a = 1\na { x = 1 }'), { a: { x: 1 } });
  assert.deepStrictEqual(ev({ main: 'include "o"\na = [3]', o: 'a = [1,2]' }), { a: [3] });
  assert.deepStrictEqual(ev({ main: 'include "o"\na = 5', o: 'a { x = 1 }' }), { a: 5 });
});

test('vị trí Block khởi tạo: Assign rồi Block lại; trộn sâu giữ vị trí cũ', () => {
  const m = merge(prog({ main: 'a { x = 1 }\na { y = 2 }\n' }));
  const o = m.root.entries.get('a').value;
  assert.deepEqual([o.line, o.column], [1, 1]);
  assert.deepEqual([...o.entries.keys()], ['x', 'y']);
  const m2 = merge(prog({ main: 'a { x = 1 }\na = 3\n  a { y = 2 }\na { z = 1 }' }));
  const o2 = m2.root.entries.get('a').value;
  assert.deepEqual([o2.line, o2.column, o2.file], [3, 3, 'main']);
  assert.deepEqual([...o2.entries.keys()], ['y', 'z']);
  assert.equal(m2.root.entries.get('a').stmt.line, 4);
});

test('merge thu thập mọi String kể cả bị ghi đè, trong mảng và const', () => {
  const m = merge(prog({ main: 'const c = "k"\na = "1"\na = ["2", ["3"]]\ninclude "o"', o: 'z = "4"\nz = 0' }));
  const vals = m.strings.map((s) => s.node.parts[0].value).sort();
  assert.deepEqual(vals, ['1', '2', '3', '4', 'k']);
  assert.equal(m.strings.find((s) => s.node.parts[0].value === 'k').const, true);
});

test('nội suy lồng, ${a} khi a = null, số đổi bằng JSON.stringify', () => {
  assert.deepStrictEqual(ev('a = "x${b}"\nb = "y${c}"\nc = 1.50'), { a: 'xy1.5', b: 'y1.5', c: 1.5 });
  assert.deepStrictEqual(ev('a = null\nb = "${a}"\nc = "v:${a}"'), { a: null, b: null, c: 'v:null' });
  assert.deepStrictEqual(ev('a = 1e21\nb = "${a}!"\nc = true\nd = "${c}-"'), { a: 1e21, b: '1e+21!', c: true, d: 'true-' });
  assert.deepStrictEqual(ev('a = ""\nb = "${a}"'), { a: '', b: '' });
});

test('hai ${x} trỏ cùng một mảng/đối tượng cho kết quả độc lập', () => {
  const r = ev('x = [1, [2]]\ny = "${x}"\nz = "${x}"\no { k = 1 }\no2 = "${o}"');
  assert.deepStrictEqual(r.y, [1, [2]]);
  assert.notEqual(r.y, r.z);
  assert.notEqual(r.y, r.x);
  assert.notEqual(r.y[1], r.z[1]);
  r.y[1].push(9);
  assert.deepStrictEqual(r.z, [1, [2]]);
  assert.deepStrictEqual(r.o2, { k: 1 });
  assert.notEqual(r.o2, r.o);
});

test('ref hằng có chỉ mục, hằng của chính tệp chứa chuỗi', () => {
  const r = ev({
    main: 'const lst = ["a", ["b"]]\nx = "${@lst.0}"\ny = "${@lst.1.0}-${@lst.0}"\ninclude "o"',
    o: 'const lst = ["Z"]\nw = "${@lst.0}"',
  });
  assert.deepStrictEqual(r, { x: 'a', y: 'b-a', w: 'Z' });
  assert.deepStrictEqual(ev('const a = "q"\nconst b = "${@a}2"\nv = "${@b}"'), { v: 'q2' });
});

test('resolveRef: đi qua mảng theo chỉ số chuẩn, không xuyên chuỗi', () => {
  const m = merge(prog({ main: 'a { l = [10, 20] }\ns = "t"\nn = null\nr = "${a}"' }));
  const R = (path, c = false) => resolveRef(m, { path, const: c }, 'main');
  assert.equal(R(['a', 'l', '1']).node.value, 20);
  assert.equal(R(['a', 'l', '2']), null);
  assert.equal(R(['a', 'l', '01']), null);
  assert.equal(R(['a', 'l', '-1']), null);
  assert.equal(R(['s', 'x']), null);
  assert.equal(R(['r', 'x']), null);
  assert.equal(R(['n']).node.type, 'Null');
  assert.equal(R(['n', 'x']), null);
  assert.equal(R(['toString']), null);
  assert.equal(R(['a']).kind, 'object');
  assert.equal(R(['nope'], true), null);
});

test('khóa __proto__ không làm hỏng kết quả', () => {
  const r = ev('__proto__ { a = 1 }');
  assert.deepEqual(Object.keys(r), ['__proto__']);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
});
