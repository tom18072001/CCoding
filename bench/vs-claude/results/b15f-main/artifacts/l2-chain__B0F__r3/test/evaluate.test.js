import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { mergeProgram, resolveRef, collectStrings, targetKind } from '../src/merge.js';

const prog = (files, entry = 'main') => {
  if (typeof files === 'string') files = { main: files };
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.program;
};
const ev = (files, entry) => evaluate(prog(typeof files === 'string' ? { main: files } : files, entry));

test('ví dụ mục 9: const, mảng, giữ kiểu', () => {
  const out = ev(`const env = "prod"
name = "svc-\${@env}"
ports = [80, 443]
http { port = "\${ports.0}" }
https { port = "\${ports.1}" }`);
  assert.deepEqual(out, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const out = ev({
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
  });
  assert.deepEqual(out, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(out), ['server', 'mode']);
});

test('khóa khai báo sau include ghi đè; include sau ghi đè include trước', () => {
  const files = { a: 'x = 1\ny = 1', b: 'x = 2', main: 'include "a"\nx = 9\ninclude "b"' };
  assert.deepEqual(ev(files), { x: 2, y: 1 });
  assert.deepEqual(ev({ ...files, main: 'include "b"\ninclude "a"' }), { x: 1, y: 1 });
  assert.deepEqual(ev({ ...files, main: 'include "a"\nx = 9' }), { x: 9, y: 1 });
});

test('Block thay giá trị không phải đối tượng; Assign thay đối tượng; mảng không trộn', () => {
  assert.deepEqual(ev('a = 1\na { b = 2 }'), { a: { b: 2 } });
  assert.deepEqual(ev('a { b = 2 }\na = 5\na { c = 3 }'), { a: { c: 3 } });
  assert.deepEqual(ev('l = [1,2,3]\nl = [9]'), { l: [9] });
});

test('vị trí Block khởi tạo đối tượng (6.2)', () => {
  const root = mergeProgram(prog('a { x = 1 }\na { y = 2 }\na = 1\na { z = 1 }'));
  assert.equal(root.children.get('a').block.line, 4);
  const r2 = mergeProgram(prog('a { x = 1 }\na { y = 2 }'));
  assert.deepEqual([r2.children.get('a').block.line, r2.children.get('a').block.column], [1, 1]);
});

test('tham chiếu khóa khai báo muộn hoặc bị ghi đè', () => {
  assert.deepEqual(ev('a = "${b}"\nb = 1'), { a: 1, b: 1 });
  assert.deepEqual(ev({ base: 'v = 1', main: 'include "base"\nu = "${v}"\nv = 2' }), { v: 2, u: 2 });
  assert.deepEqual(ev('u = "x${v}"\nv = 1\nv = "z"'), { u: 'xz', v: 'z' });
});

test('thứ tự khóa khi ghi đè giữ chỗ cũ', () => {
  const out = ev('a = 1\nb = 2\nc = 3\na = "x"\nb { q = 1 }');
  assert.deepEqual(Object.keys(out), ['a', 'b', 'c']);
  assert.deepEqual(out, { a: 'x', b: { q: 1 }, c: 3 });
});

test('${@lst.1}, chỉ số mảng, đi qua đối tượng', () => {
  assert.deepEqual(ev('const lst = [10, 20]\nv = "${@lst.1}"\nw = "i${@lst.0}"'), { v: 20, w: 'i10' });
  assert.deepEqual(ev('l = [[1,2],[3]]\nv = "${l.0.1}"\nw = "${l.1}"'), { l: [[1, 2], [3]], v: 2, w: [3] });
  assert.deepEqual(ev('a { b = [true, null] }\nv = "${a.b.1}"\ns = "${a.b.1}-${a.b.0}"'),
    { a: { b: [true, null] }, v: null, s: 'null-true' });
});

test('resolveRef: chỉ số, xuyên chuỗi, null, hằng khác tệp', () => {
  const p = prog({ main: 'include "o"\nl = [1]\ns = "t"\nn = null\nref = "${s}"\nconst c = [5]', o: 'const k = 1' });
  const root = mergeProgram(p);
  const R = (path, c = false, f = 'main') => resolveRef(root, p, { type: 'Ref', path, const: c }, f);
  assert.ok(R(['l', '0']));
  assert.equal(R(['l', '1']), null);
  assert.equal(R(['l', '00']), null);
  assert.equal(R(['l', '-1']), null);
  assert.equal(R(['l', '0', 'x']), null);
  assert.equal(R(['s', 'x']), null);
  assert.equal(R(['ref', 'x']), null);
  assert.ok(R(['n']));
  assert.equal(R(['n', 'x']), null);
  assert.equal(R(['k'], true, 'main'), null);
  assert.ok(R(['k'], true, 'o'));
  assert.ok(R(['c', '0'], true));
  assert.equal(R(['c', '1'], true), null);
});

test('collectStrings chỉ tính định nghĩa thắng; targetKind', () => {
  const p = prog('o { a = "old" }\no { a = "new" b = ["x", ["y"]] }\nr = "${o}"\nq = "${r}"\nn = 1\nm = "k${n}"');
  const root = mergeProgram(p);
  const o = root.children.get('o');
  const vals = collectStrings(o).map((s) => s.node.parts[0].value);
  assert.deepEqual(vals, ['new', 'x', 'y']);
  const ref = (path) => resolveRef(root, p, { type: 'Ref', path, const: false }, 'main');
  assert.equal(targetKind(root, p, ref(['q'])), 'object');
  assert.equal(targetKind(root, p, ref(['o', 'b'])), 'array');
  assert.equal(targetKind(root, p, ref(['m'])), 'string');
  assert.equal(targetKind(root, p, ref(['n'])), 'number');
});

test('không treo trên đồ thị có vòng', () => {
  const p = prog('a = "${b}"\nb = "${a}"\nc { d = "${c}" }');
  const root = mergeProgram(p);
  const t = resolveRef(root, p, { type: 'Ref', path: ['a'], const: false }, 'main');
  assert.equal(targetKind(root, p, t), null);
  assert.ok(collectStrings(root).length >= 3);
  assert.throws(() => evaluate(p));
  const self = prog({ main: 'include "main"\nx = 1' });
  assert.deepEqual(evaluate(self), { x: 1 });
});

test('nội suy lồng và số', () => {
  assert.deepEqual(ev('a = "1"\nb = "<${a}>"\nc = "[${b}]"\nd = "${c}"'),
    { a: '1', b: '<1>', c: '[<1>]', d: '[<1>]' });
  assert.deepEqual(ev('n = 1.50\ns = "v=${n}"\nt = "${n}"'), { n: 1.5, s: 'v=1.5', t: 1.5 });
  assert.equal(ev('n = 1e21\ns = "${n}!"').s, '1e+21!');
  assert.deepEqual(ev('p = "x${a}y${b}z"\na = true\nb = null'), { p: 'xtrueynullz', a: true, b: null });
  assert.deepEqual(ev('e = ""\nf = "${e}"\ng = "a\\${e}"'), { e: '', f: '', g: 'a${e}' });
});

test('hằng tham chiếu hằng; const khai báo muộn', () => {
  assert.deepEqual(ev('x = "${@a}"\nconst a = "${@b}!"\nconst b = "B"'), { x: 'B!' });
});

test('kết quả không chia sẻ tham chiếu', () => {
  const out = ev('l = [1, [2]]\nx = "${l}"\ny = "${l}"\no { k = [1] }\nz = "${o}"');
  assert.deepEqual(out.x, out.y);
  assert.notEqual(out.x, out.y);
  assert.notEqual(out.x, out.l);
  assert.notEqual(out.x[1], out.y[1]);
  assert.notEqual(out.z, out.o);
  assert.notEqual(out.z.k, out.o.k);
});

test('tệp include trong khối, vào đối tượng hiện hành', () => {
  const out = ev({ main: 'srv { include "p"\nport = 2 }', p: 'host = "h"\nport = 1' });
  assert.deepEqual(out, { srv: { host: 'h', port: 2 } });
});
