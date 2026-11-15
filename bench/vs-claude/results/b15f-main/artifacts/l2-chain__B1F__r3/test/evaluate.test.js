import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { createMerged } from '../src/merge.js';

function ev(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return evaluate(r.program);
}

test('ví dụ mục 9: nội suy hằng và chỉ số mảng', () => {
  const out = ev({
    main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }',
  });
  assert.deepEqual(out, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const out = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(out, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(out), ['server', 'mode']);
});

test('khóa khai báo trước include bị include ghi đè', () => {
  const out = ev({ main: 'x = 1\ninclude "b"', b: 'x = 2' });
  assert.deepEqual(out, { x: 2 });
});

test('thứ tự khóa giữ nguyên khi Block bị thay bằng Assign và ngược lại', () => {
  const out = ev({ main: 'a { k = 1 }\nb = 1\na = 5\nb { z = 1 }\nc = 0' });
  assert.deepEqual(out, { a: 5, b: { z: 1 }, c: 0 });
  assert.deepEqual(Object.keys(out), ['a', 'b', 'c']);
});

test('Block sau Assign thay giá trị cũ bằng đối tượng mới', () => {
  assert.deepEqual(ev({ main: 'a = [1]\na { x = 1 }' }), { a: { x: 1 } });
});

test('mảng không trộn: mảng sau thay hẳn', () => {
  assert.deepEqual(ev({ main: 'include "b"\nl = [3]', b: 'l = [1, 2]' }), { l: [3] });
});

test('tham chiếu thấy giá trị cuối: khai báo muộn và bị ghi đè', () => {
  const out = ev({
    main: 'a = "${b}"\nc = "${d}"\nb = 1\nb = 2\ninclude "x"\nd = "late"',
    x: 'd = "inc"',
  });
  assert.deepEqual(out, { a: 2, c: 'late', b: 2, d: 'late' });
});

test('${@lst.1} chỉ vào mảng hằng', () => {
  const out = ev({ main: 'const lst = ["a", "b"]\nx = "${@lst.1}"\ny = "v=${@lst.0}"\nz = "${@lst}"' });
  assert.deepEqual(out, { x: 'b', y: 'v=a', z: ['a', 'b'] });
});

test('hằng chỉ thấy trong cùng tệp (chuỗi trong tệp include dùng hằng của tệp đó)', () => {
  const out = ev({
    main: 'const c = "m"\ninclude "b"\nv = "${@c}"',
    b: 'const c = "b"\nw = "${@c}"',
  });
  assert.deepEqual(out, { w: 'b', v: 'm' });
});

test('${a} với a = null giữ null; nối thành "null"', () => {
  const out = ev({ main: 'a = null\nb = "${a}"\nc = "x${a}"' });
  assert.deepEqual(out, { a: null, b: null, c: 'xnull' });
});

test('kiểu của đích được giữ, bool và số trong nối chuỗi', () => {
  const out = ev({ main: 'n = 1.50\nt = true\nm = "${n}"\ns = "${n}/${t}"' });
  assert.deepEqual(out, { n: 1.5, t: true, m: 1.5, s: '1.5/true' });
});

test('hai ${x} cùng trỏ một mảng cho hai mảng độc lập', () => {
  const out = ev({ main: 'x = [1, [2]]\na = "${x}"\nb = "${x}"' });
  assert.deepEqual(out.a, [1, [2]]);
  assert.notEqual(out.a, out.b);
  assert.notEqual(out.a, out.x);
  assert.notEqual(out.a[1], out.b[1]);
  out.a[1].push(9);
  assert.deepEqual(out.b, [1, [2]]);
});

test('tham chiếu tới đối tượng giữ đối tượng, bản sao độc lập', () => {
  const out = ev({ main: 's { h = "a" }\nt = "${s}"' });
  assert.deepEqual(out.t, { h: 'a' });
  assert.notEqual(out.t, out.s);
});

test('nội suy lồng nhau đánh giá đệ quy', () => {
  const out = ev({ main: 'a = "${b}-1"\nb = "${c}-2"\nc = "z"\nd = "${a}"' });
  assert.deepEqual(out, { a: 'z-2-1', b: 'z-2', c: 'z', d: 'z-2-1' });
});

test('đường dẫn đi qua mảng và đối tượng lồng nhau', () => {
  const out = ev({ main: 'a { l = [{}, 1] }'.replace('{}, ', '') + '\nv = "${a.l.0}"' });
  assert.equal(out.v, 1);
});

test('đổi số 1e21 và số nguyên khi nối', () => {
  const out = ev({ main: 'big = 1e21\ns = "n=${big}"\nt = "${big}"' });
  assert.equal(out.s, 'n=1e+21');
  assert.equal(out.t, 1e21);
});

test('chuỗi rỗng, thoát \\$ không là tham chiếu', () => {
  assert.deepEqual(ev({ main: 'e = ""\nl = "\\${a}"' }), { e: '', l: '${a}' });
});

test('include lặp lại (hình thoi) áp dụng đủ ở mỗi chỗ; vòng include bị bỏ qua', () => {
  const out = ev({
    main: 'include "b"\nx = 1\ninclude "c"',
    b: 'include "d"\nb = 1',
    c: 'include "d"\nc = 1',
    d: 'd = 1\ninclude "main"',
  });
  assert.deepEqual(out, { d: 1, b: 1, x: 1, c: 1 });
});

test('include trong khối vào đúng đối tượng; khóa __proto__ an toàn', () => {
  const out = ev({ main: 'srv { include "b"\n y = 2 }\n__proto__ = 1', b: 'x = 1' });
  assert.deepEqual(Object.keys(out), ['srv', '__proto__']);
  assert.deepEqual(out.srv, { x: 1, y: 2 });
});

test('merge: vị trí đối tượng và định nghĩa thắng', () => {
  const r = parseProject({ main: 'a { x = 1 }\na { y = 2 }\nb = 1\nb { z = 1 }\nb { w = 1 }' }, 'main');
  const m = createMerged(r.program);
  const a = m.root.entries.get('a');
  assert.deepEqual([a.value.pos.line, a.def.line], [1, 2]);
  assert.deepEqual(m.root.entries.get('b').value.pos, { file: 'main', line: 4, column: 1 });
  assert.deepEqual(m.root.pos, { file: 'main', line: 1, column: 1 });
});

test('merge: resolve không đi xuyên chuỗi, chỉ số không có số 0 đứng đầu', () => {
  const r = parseProject({ main: 'a = "${b}"\nb = "x"\nl = [1, 2]' }, 'main');
  const m = createMerged(r.program);
  const ref = (path, c = false) => ({ type: 'Ref', path, const: c });
  assert.equal(m.resolve(ref(['a', 'x']), 'main'), null);
  assert.equal(m.resolve(ref(['l', '01']), 'main'), null);
  assert.equal(m.resolve(ref(['l', '2']), 'main'), null);
  assert.equal(m.resolve(ref(['l', '1']), 'main').node.value, 2);
  assert.equal(m.resolve(ref(['nope', 'x']), 'main'), null);
  assert.equal(m.resolve(ref(['toString']), 'main'), null);
});
