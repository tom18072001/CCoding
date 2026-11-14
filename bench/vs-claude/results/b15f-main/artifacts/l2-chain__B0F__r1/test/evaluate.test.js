import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { merge, resolveRef, collectStrings } from '../src/merge.js';

function ev(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.ok(r.ok, JSON.stringify(r.error));
  return evaluate(r.program);
}

test('ví dụ mục 9: main', () => {
  const out = ev({ main: `const env = "prod"
name = "svc-\${@env}"
ports = [80, 443]
http { port = "\${ports.0}" }
https { port = "\${ports.1}" }
` });
  assert.deepEqual(out, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const out = ev({
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"\n',
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"\n',
  });
  assert.deepEqual(out, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(out), ['server', 'mode']);
});

test('ghi đè giữ vị trí khóa cũ; khóa sau include ghi đè include', () => {
  const out = ev({
    a: 'x = 1\ny = 2\n',
    b: 'x = 10\nz = 3\n',
    main: 'include "a"\ninclude "b"\ny = "new"\n',
  });
  assert.deepEqual(Object.keys(out), ['x', 'y', 'z']);
  assert.deepEqual(out, { x: 10, y: 'new', z: 3 });
});

test('Block thay Assign và Assign thay Block; mảng không trộn', () => {
  assert.deepEqual(ev({ main: 'a = 1\na { b = 2 }\n' }), { a: { b: 2 } });
  assert.deepEqual(ev({ main: 'a { b = 2 }\na = 5\n' }), { a: 5 });
  assert.deepEqual(ev({ main: 'a = [1,2,3]\na = [9]\n' }), { a: [9] });
  assert.deepEqual(ev({ main: 'a { b = 1 }\na { c = 2 }\n' }), { a: { b: 1, c: 2 } });
});

test('tham chiếu tới khóa khai báo muộn và bị ghi đè', () => {
  const out = ev({
    base: 'port = 1\n',
    main: 'url = "p:${port}"\ninclude "base"\nport = 7\n',
  });
  assert.deepEqual(out, { url: 'p:7', port: 7 });
});

test('${a} khi a = null', () => {
  assert.deepEqual(ev({ main: 'a = null\nb = "${a}"\nc = "x${a}"\n' }), { a: null, b: null, c: 'xnull' });
});

test('chuỗi thuần Ref giữ kiểu, ghép số bằng JSON.stringify', () => {
  const out = ev({ main: 'n = 1.50\nbig = 1e21\nt = true\nb = "${t}"\ns = "${n}|${big}|${t}"\ne = ""\n' });
  assert.equal(out.s, '1.5|1e+21|true');
  assert.equal(out.b, true);
  assert.equal(out.e, '');
});

test('hai ${x} trỏ tới cùng mảng cho hai mảng khác nhau', () => {
  const out = ev({ main: 'x = [1, [2]]\na = "${x}"\nb = "${x}"\n' });
  assert.deepEqual(out.a, [1, [2]]);
  assert.notEqual(out.a, out.b);
  assert.notEqual(out.a, out.x);
  assert.notEqual(out.a[1], out.b[1]);
});

test('đối tượng qua tham chiếu và nội suy lồng', () => {
  const out = ev({ main: 's { h = "${r}" }\nr = "x-${q}"\nq = "q"\no = "${s}"\nu = "${s.h}!"\n' });
  assert.deepEqual(out.o, { h: 'x-q' });
  assert.equal(out.u, 'x-q!');
});

test('Ref hằng: khai báo muộn, chỉ mục mảng, theo tệp chứa chuỗi', () => {
  const out = ev({
    inc: 'const c = "inc"\nv = "${@c}"\n',
    main: 'a = "${@c}-${@l.1}"\nconst c = "main"\nconst l = ["x","y"]\ninclude "inc"\n',
  });
  assert.deepEqual(out, { a: 'main-y', v: 'inc' });
});

test('chuỗi trong mảng phân giải theo chỉ số', () => {
  const out = ev({ main: 'l = ["${a.1}", "k"]\na = ["p","q"]\nz = "${l.0}"\n' });
  assert.deepEqual(out, { l: ['q', 'k'], a: ['p', 'q'], z: 'q' });
});

test('resolveRef: không đi xuyên chuỗi, chỉ số 01 không hợp lệ, khóa __proto__ an toàn', () => {
  const r = parseProject({ main: 'a = "s"\nb = "${a}"\nl = [1]\n__proto__ = 3\n' }, 'main');
  const m = merge(r.program);
  const ref = (path) => ({ type: 'Ref', path, const: false });
  assert.equal(resolveRef(m, ref(['b', 'x']), 'main').found, false);
  assert.equal(resolveRef(m, ref(['a', 'x']), 'main').found, false);
  assert.equal(resolveRef(m, ref(['l', '01']), 'main').found, false);
  assert.equal(resolveRef(m, ref(['l', '1']), 'main').found, false);
  assert.equal(resolveRef(m, ref(['l', '0']), 'main').found, true);
  assert.equal(resolveRef(m, ref(['toString']), 'main').found, false);
  assert.equal(resolveRef(m, ref(['__proto__']), 'main').found, true);
  assert.equal(collectStrings(m.root).length, 2);
  const out = evaluate(r.program);
  assert.ok(Object.hasOwn(out, '__proto__'));
});

test('siêu dữ liệu: vị trí Block khởi tạo và nút thắng', () => {
  const r = parseProject({ main: 'a = 1\na { x = 1 }\na { y = 2 }\n' }, 'main');
  const m = merge(r.program);
  const e = m.root.entries.get('a');
  assert.deepEqual(m.root.block, { file: 'main', line: 1, column: 1 });
  assert.equal(e.value.block.line, 2);
  assert.equal(e.node.line, 3);
  assert.equal(e.file, 'main');
});
