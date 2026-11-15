import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { mergeProgram, resolveRef, stringsOf } from '../src/merge.js';

function ev(files, entry = 'main') {
  if (typeof files === 'string') files = { main: files };
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return evaluate(p.program);
}

test('ghi đè: khóa sau include ghi đè, include sau ghi đè include trước', () => {
  const files = {
    main: 'include "a"\nmode = "prod"\ninclude "b"\nx = 1',
    a: 'mode = "dev"\ny = 1',
    b: 'y = 2\nx = 0',
  };
  assert.deepEqual(ev(files), { mode: 'prod', y: 2, x: 1 });
});

test('ghi đè: khóa trước include bị include ghi đè', () => {
  const files = { main: 'mode = "prod"\ninclude "a"', a: 'mode = "dev"' };
  assert.deepEqual(ev(files), { mode: 'dev' });
});

test('trộn sâu và ví dụ mục 9 (include)', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  };
  const r = ev(files);
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('Block ghi đè giá trị không phải đối tượng; Assign ghi đè khối', () => {
  assert.deepEqual(ev('a = 1\na { b = 2 }'), { a: { b: 2 } });
  assert.deepEqual(ev('a { b = 2 }\na = [1]'), { a: [1] });
  assert.deepEqual(ev('a = null\na { b = 2 }'), { a: { b: 2 } });
});

test('mảng thay hẳn, không trộn', () => {
  const files = { main: 'include "a"\nl = [9]', a: 'l = [1, 2, 3]' };
  assert.deepEqual(ev(files), { l: [9] });
});

test('thứ tự khóa theo lần xuất hiện đầu', () => {
  const r = ev('a = 1\nb = 2\nc = 3\na = 9\nb { x = 1 }');
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
  assert.deepEqual(r, { a: 9, b: { x: 1 }, c: 3 });
  const r2 = ev('o { z = 1 y = 2 }\no { y = 3 w = 4 z = 5 }');
  assert.deepEqual(Object.keys(r2.o), ['z', 'y', 'w']);
});

test('khóa __proto__ là khóa thường', () => {
  const r = ev('__proto__ = 1');
  assert.deepEqual(Object.keys(r), ['__proto__']);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
});

test('tham chiếu khóa khai báo muộn và bị ghi đè', () => {
  assert.deepEqual(ev('a = "${b}"\nb = 1'), { a: 1, b: 1 });
  const files = { main: 'x = "${m}"\ninclude "a"\nm = "cuoi"', a: 'm = "dau"' };
  assert.deepEqual(ev(files), { x: 'cuoi', m: 'cuoi' });
});

test('chuỗi thuần tham chiếu giữ kiểu; nối chuỗi dùng JSON.stringify', () => {
  const r = ev('n = 1.50\nb = true\nz = null\nbig = 1e21\ns = "${n}"\nt = "n=${n} b=${b} z=${z} big=${big}"');
  assert.equal(r.s, 1.5);
  assert.equal(r.t, 'n=1.5 b=true z=null big=1e+21');
});

test('nội suy lồng và rỗng', () => {
  assert.deepEqual(ev('a = "x${b}"\nb = "y${c}"\nc = 1\nd = ""'), { a: 'xy1', b: 'y1', c: 1, d: '' });
});

test('đường dẫn vào mảng và đối tượng; null tồn tại', () => {
  const r = ev('l = [10, [20, 30]]\no { k = "v" }\nn = null\na = "${l.1.0}"\nb = "${o.k}"\nc = "${n}"\nd = "${o}"');
  assert.equal(r.a, 20);
  assert.equal(r.b, 'v');
  assert.equal(r.c, null);
  assert.deepEqual(r.d, { k: 'v' });
});

test('const: không vào kết quả; chỉ mục vào const mảng; const tham chiếu const', () => {
  const r = ev('const L = ["a", "b"]\nconst M = "${@L.1}!"\nx = "${@L.0}"\ny = "${@M}"\nz = "${@L}"');
  assert.deepEqual(r, { x: 'a', y: 'b!', z: ['a', 'b'] });
});

test('const theo tệp chứa chuỗi', () => {
  const files = {
    main: 'const c = "main"\ninclude "a"\nv = "${@c}"',
    a: 'const c = "a"\nw = "${@c}"',
  };
  assert.deepEqual(ev(files), { w: 'a', v: 'main' });
});

test('hai ${x} ra hai mảng độc lập', () => {
  const r = ev('l = [1, [2]]\na = "${l}"\nb = "${l}"');
  assert.deepEqual(r.a, [1, [2]]);
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.l);
  assert.notEqual(r.a[1], r.b[1]);
  r.a[1].push(3);
  assert.deepEqual(r.b, [1, [2]]);
  assert.deepEqual(r.l, [1, [2]]);
});

test('ví dụ mục 9 (main)', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }';
  assert.deepEqual(ev(src), {
    name: 'svc-prod',
    ports: [80, 443],
    http: { port: 80 },
    https: { port: 443 },
  });
});

test('ví dụ README: url, limits.max giữ số', () => {
  const src = 'port = 8080\nserver {\n host = "0.0.0.0"\n url = "http://${server.host}:${port}"\n limits { max = "${port}" }\n}';
  assert.deepEqual(ev(src).server, { host: '0.0.0.0', url: 'http://0.0.0.0:8080', limits: { max: 8080 } });
});

test('merge: vị trí đối tượng, Ref không đi xuyên chuỗi, chỉ số không có số 0 đứng đầu', () => {
  const p = parseProject({ main: 'a { x = 1 }\nb = 2\na = 3\na { y = "${b}" }\nl = [1,2]\ns = "t"' }, 'main');
  const m = mergeProgram(p.program);
  assert.deepEqual(m.root.loc, { file: 'main', line: 1, column: 1 });
  assert.deepEqual(m.root.entries.get('a').value.loc, { file: 'main', line: 4, column: 1 });
  const ref = (path, c = false) => ({ type: 'Ref', path, const: c });
  assert.equal(resolveRef(m, ref(['s', 'x']), 'main'), null);
  assert.equal(resolveRef(m, ref(['l', '01']), 'main'), null);
  assert.equal(resolveRef(m, ref(['l', '2']), 'main'), null);
  assert.equal(resolveRef(m, ref(['l', '1']), 'main').node.value, 2);
  assert.equal(stringsOf(m.root.entries.get('a').value).length, 1);
});
