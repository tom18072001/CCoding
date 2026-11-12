import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate, mergeProgram, resolveRef } from '../src/evaluate.js';

const ev = (files, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return evaluate(p.program);
};

test('ví dụ mục 9: nội suy, mảng, hằng', () => {
  const main = [
    'const env = "prod"',
    'name = "svc-${@env}"',
    'ports = [80, 443]',
    'http { port = "${ports.0}" }',
    'https { port = "${ports.1}" }',
  ].join('\n');
  assert.deepEqual(ev({ main }), {
    name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 },
  });
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const r = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('tham chiếu tới khóa khai báo muộn', () => {
  assert.deepEqual(ev({ main: 'a = "${b}"\nb = 3' }), { a: 3, b: 3 });
});

test('tham chiếu thấy giá trị cuối khi include bị ghi đè', () => {
  const r = ev({
    main: 'x = "v=${v}"\ninclude "o.cfg"\nv = 1',
    'o.cfg': 'v = 9\ny = "${v}"',
  });
  assert.deepEqual(r, { x: 'v=1', v: 1, y: 1 });
});

test('thứ tự khóa khi ghi đè giữ chỗ cũ', () => {
  const r = ev({ main: 'a = 1\nb = 2\na { z = 1 }\nc = 3\nb = 5' });
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
  assert.deepEqual(r, { a: { z: 1 }, b: 5, c: 3 });
});

test('block thay vô hướng, assign thay block, mảng không trộn', () => {
  assert.deepEqual(ev({ main: 'a = [1,2]\na = [3]\nb { x = 1 }\nb = 2\nc = 1\nc { y = 1 }' }),
    { a: [3], b: 2, c: { y: 1 } });
});

test('include kiểu hình thoi', () => {
  const r = ev({
    main: 'include "b"\ninclude "c"',
    b: 'include "d"\nb = 1',
    c: 'include "d"\nc = 2',
    d: 'd = 4\nshared { k = 1 }',
  });
  assert.deepEqual(r, { d: 4, shared: { k: 1 }, b: 1, c: 2 });
  assert.deepEqual(Object.keys(r), ['d', 'shared', 'b', 'c']);
});

test('include trong khối vào đúng đối tượng', () => {
  assert.deepEqual(ev({ main: 's { include "i"\n m = 1 }', i: 'k = 2\nm = 0' }), { s: { k: 2, m: 1 } });
});

test('hai ${x} trỏ tới mảng cho hai mảng khác nhau', () => {
  const r = ev({ main: 'x = [1, [2]]\na = "${x}"\nb = "${x}"' });
  assert.deepEqual(r.a, [1, [2]]);
  assert.deepEqual(r.b, [1, [2]]);
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.x);
  assert.notEqual(r.a[1], r.b[1]);
  r.a[1].push(9);
  assert.deepEqual(r.b, [1, [2]]);
});

test('đối tượng qua ${} giữ nguyên kiểu và độc lập', () => {
  const r = ev({ main: 'o { k = 1 }\np = "${o}"' });
  assert.deepEqual(r.p, { k: 1 });
  assert.notEqual(r.p, r.o);
});

test('${@lst.1} chỉ mục vào hằng mảng', () => {
  assert.deepEqual(ev({ main: 'const lst = ["a", "b"]\nx = "${@lst.1}"\ny = "p-${@lst.0}"' }),
    { x: 'b', y: 'p-a' });
});

test('a = null rồi ${a}', () => {
  assert.deepEqual(ev({ main: 'a = null\nb = "${a}"\nc = "x${a}"' }), { a: null, b: null, c: 'xnull' });
});

test('nối chuỗi: số dùng JSON.stringify, bool, nội suy lồng', () => {
  const r = ev({ main: 'n = 1.50\nbig = 1e21\nt = true\ns = "${n}|${big}|${t}"\nz = "<${s}>"\ne = ""' });
  assert.equal(r.s, '1.5|1e+21|true');
  assert.equal(r.z, '<1.5|1e+21|true>');
  assert.equal(r.e, '');
});

test('hằng tra theo tệp chứa chuỗi', () => {
  const r = ev({
    main: 'const c = "M"\ninclude "o"\nm = "${@c}"',
    o: 'const c = "O"\nx = "${@c}"',
  });
  assert.deepEqual(r, { x: 'O', m: 'M' });
});

test('chuỗi vô hướng giữ kiểu qua chuỗi thuần tham chiếu; khóa __proto__ an toàn', () => {
  const r = ev({ main: 'n = 5\nm = "${n}"\nk = "${m}"\n__proto__ = 1' });
  assert.equal(r.k, 5);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
});

test('mergeProgram: vị trí khối khởi tạo, bảng const, nút nguyên vẹn', () => {
  const p = parseProject({ main: 'const c = 1\na { x = 1 }\na { y = 2 }\nb = 1\nb { z = 1 }\nb = 2' }, 'main').program;
  const m = mergeProgram(p);
  const a = m.root.entries.get('a').value;
  assert.equal(a.kind, 'object');
  assert.equal(a.block.line, 2);
  assert.deepEqual([...a.entries.keys()], ['x', 'y']);
  assert.equal(m.root.entries.get('b').stmt, p.files.main.body[5]);
  assert.equal(m.consts.get('main').get('c'), p.files.main.body[0]);
  assert.equal(m.root.entries.get('b').value.node, p.files.main.body[5].value);
});

test('mergeProgram: khối sau khi khóa bị thay thì Block mới là khối khởi tạo', () => {
  const p = parseProject({ main: 'b { x = 1 }\nb = 1\nb { z = 1 }\nb { w = 1 }' }, 'main').program;
  const b = mergeProgram(p).root.entries.get('b').value;
  assert.equal(b.block.line, 3);
  assert.deepEqual([...b.entries.keys()], ['z', 'w']);
});

test('resolveRef: quy tắc đường dẫn', () => {
  const p = parseProject({ main: 'o { a = [10, 20] }\ns = "str"\nn = null\nconst k = [1]\nt = "${o.a.0}"' }, 'main').program;
  const m = mergeProgram(p);
  const r = (path, c = false) => resolveRef(m, { path, const: c }, 'main');
  assert.equal(r(['o', 'a', '1']).node.value, 20);
  assert.equal(r(['o', 'a', '2']), undefined);
  assert.equal(r(['o', 'a', '01']), undefined);
  assert.equal(r(['o', 'a', '-1']), undefined);
  assert.equal(r(['s', '0']), undefined);          // không đi xuyên qua chuỗi
  assert.equal(r(['t', '0']), undefined);          // kể cả chuỗi thuần tham chiếu
  assert.equal(r(['n']).node.type, 'Null');        // null tồn tại
  assert.equal(r(['n', 'x']), undefined);
  assert.equal(r(['toString']), undefined);        // chỉ khóa riêng
  assert.equal(r(['o', 'constructor']), undefined);
  assert.equal(r(['k', '0'], true).node.value, 1);
  assert.equal(r(['nope'], true), undefined);
  assert.equal(r(['o']).kind, 'object');
});
