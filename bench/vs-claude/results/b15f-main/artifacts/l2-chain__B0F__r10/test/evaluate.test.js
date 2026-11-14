import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate, mergeProgram, resolvePath } from '../src/evaluate.js';

function prog(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.program;
}
const ev = (files, entry) => evaluate(prog(files, entry));

test('ví dụ mục 9: giá trị cuối', () => {
  const main = `const env = "prod"
name = "svc-\${@env}"
ports = [80, 443]
http { port = "\${ports.0}" }
https { port = "\${ports.1}" }`;
  const r = ev({ main });
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  assert.deepEqual(Object.keys(r), ['name', 'ports', 'http', 'https']);
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  };
  const r = ev(files);
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
  assert.deepEqual(Object.keys(r.server), ['host', 'port']);
});

test('ví dụ mục 1', () => {
  const main = `const region = "hn"
name = "app-\${@region}"
port = 8080
debug = false
owner = null
ratio = -1.5e2
tags = ["a", "b", [1, 2],]
server {
  host = "0.0.0.0"
  url  = "http://\${server.host}:\${port}"
  limits { max = "\${port}" }
}`;
  assert.deepEqual(ev({ main }), {
    name: 'app-hn', port: 8080, debug: false, owner: null, ratio: -150, tags: ['a', 'b', [1, 2]],
    server: { host: '0.0.0.0', url: 'http://0.0.0.0:8080', limits: { max: 8080 } },
  });
});

test('khóa khai báo sau include ghi đè khóa từ include', () => {
  const r = ev({ main: 'include "b"\nx = 2', b: 'x = 1\ny = 1' });
  assert.deepEqual(r, { x: 2, y: 1 });
});

test('include sau ghi đè include trước; mảng không trộn', () => {
  const r = ev({ main: 'include "a"\ninclude "b"', a: 'x = 1\nl = [1,2,3]', b: 'x = 2\nl = [9]' });
  assert.deepEqual(r, { x: 2, l: [9] });
});

test('include trong khối trộn vào khối đó', () => {
  const r = ev({ main: 's { a = 1\n include "b"\n c = 3 }', b: 'a = 0\nb = 2' });
  assert.deepEqual(r, { s: { a: 0, b: 2, c: 3 } });
  assert.deepEqual(Object.keys(r.s), ['a', 'b', 'c']);
});

test('block thay giá trị không phải đối tượng; assign thay khối', () => {
  assert.deepEqual(ev({ main: 'a = 1\na { b = 2 }' }), { a: { b: 2 } });
  assert.deepEqual(ev({ main: 'a { b = 2 }\na = 1' }), { a: 1 });
  assert.deepEqual(ev({ main: 'a = [1]\na { b = 2 }' }), { a: { b: 2 } });
});

test('tham chiếu tới khóa khai báo muộn hoặc bị ghi đè', () => {
  assert.deepEqual(ev({ main: 'a = "${b}"\nb = 1' }), { a: 1, b: 1 });
  assert.deepEqual(ev({ main: 'a = "x${b}"\nb = 1' }), { a: 'x1', b: 1 });
  const r = ev({ main: 'include "base"\nv = "${m}"\nm = "prod"', base: 'm = "dev"' });
  assert.deepEqual(r, { m: 'prod', v: 'prod' });
});

test('${@lst.1} chỉ mục vào hằng mảng; hằng lấy từ tệp chứa chuỗi', () => {
  const files = {
    main: 'const lst = [10, 20]\na = "${@lst.1}"\ninclude "o"',
    o: 'const lst = [7, 8]\nb = "${@lst.0}"',
  };
  assert.deepEqual(ev(files), { a: 20, b: 7 });
});

test('${a} với a = null giữ null; nối thành "null"', () => {
  assert.deepEqual(ev({ main: 'a = null\nb = "${a}"\nc = "x${a}"' }), { a: null, b: null, c: 'xnull' });
});

test('nối số và bool theo JSON.stringify', () => {
  const r = ev({ main: 'n = 1.50\nbig = 1e21\nt = true\ns = "${n}|${big}|${t}"' });
  assert.equal(r.s, '1.5|1e+21|true');
});

test('hai ${x} trỏ mảng cho hai mảng khác tham chiếu', () => {
  const r = ev({ main: 'x = [1, [2]]\na = "${x}"\nb = "${x}"' });
  assert.deepEqual(r.a, [1, [2]]);
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.x);
  assert.notEqual(r.a[1], r.b[1]);
  const o = ev({ main: 'o { k = 1 }\na = "${o}"\nb = "${o}"' });
  assert.deepEqual(o.a, { k: 1 });
  assert.notEqual(o.a, o.b);
  assert.notEqual(o.a, o.o);
});

test('nội suy lồng và chuỗi rỗng, chỉ mục mảng đi qua mảng lồng', () => {
  const r = ev({ main: 'a = "${b}-x"\nb = "<${c}>"\nc = 3\ne = ""\nl = [[1, "${c}"]]\nm = "${l.0.1}"' });
  assert.equal(r.a, '<3>-x');
  assert.equal(r.e, '');
  assert.equal(r.m, 3);
});

test('đối tượng thuần: không chứa undefined, khóa __proto__ an toàn', () => {
  const r = ev({ main: '__proto__ { a = 1 }' });
  assert.deepEqual(Object.keys(r), ['__proto__']);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
});

test('metadata: vị trí đối tượng là Block khởi tạo kể từ lần gần nhất bị đặt bằng giá trị khác khối', () => {
  const files = { main: 'a { x = 1 }\na { y = 2 }\nb = 1\nb { z = 1 }\nb { w = 1 }\nc { q = 1 }\nc = 5\nc { r = 1 }' };
  const m = mergeProgram(prog(files));
  const a = m.root.entries.get('a');
  assert.equal(a.value.block.line, 1); // khối đầu tạo ra; khối sau chỉ trộn
  assert.equal(a.stmt.line, 2); // nút thắng là Block sau
  assert.equal(a.file, 'main');
  const b = m.root.entries.get('b');
  assert.equal(b.value.block.line, 4);
  assert.equal(b.stmt.line, 5);
  const c = m.root.entries.get('c');
  assert.equal(c.value.block.line, 8);
  assert.equal(m.root.block, null);
  assert.equal(m.root.file, 'main');
  assert.deepEqual([...m.root.entries.keys()], ['a', 'b', 'c']);
});

test('metadata: nút thắng Assign mang vị trí khóa, file đúng', () => {
  const m = mergeProgram(prog({ main: 'include "b"\nx = 2', b: 'x = 1' }));
  const e = m.root.entries.get('x');
  assert.equal(e.stmt.type, 'Assign');
  assert.equal(e.file, 'main');
  assert.equal(e.stmt.line, 2);
  assert.equal(e.stmt.column, 1);
  assert.equal(e.value.node.value, 2);
  const m2 = mergeProgram(prog({ main: 'x = 2\ninclude "b"', b: '\n  x = 1' }));
  const e2 = m2.root.entries.get('x');
  assert.equal(e2.file, 'b');
  assert.equal(e2.stmt.line, 2);
  assert.equal(e2.stmt.column, 3);
});

test('resolvePath: không xuyên chuỗi, chỉ mục sai, không ném', () => {
  const m = mergeProgram(prog({ main: 'l = [1, 2]\ns = "${l}"\nn = 3\no { k = 1 }\nconst c = [5]' }));
  const f = (path, c = false) => resolvePath(m, path, c, 'main').found;
  assert.equal(f(['l', '1']), true);
  assert.equal(f(['l', '2']), false);
  assert.equal(f(['l', '01']), false);
  assert.equal(f(['l', '-1']), false);
  assert.equal(f(['l', 'x']), false);
  assert.equal(f(['s', 'x']), false);
  assert.equal(f(['n', 'x']), false);
  assert.equal(f(['o', 'k']), true);
  assert.equal(f(['o']), true);
  assert.equal(f(['toString']), false);
  assert.equal(f(['c', '0'], true), true);
  assert.equal(f(['c', '1'], true), false);
  assert.equal(f(['l'], true), false);
  assert.equal(resolvePath(m, ['x'], true, 'khong-co').found, false);
});

test('chương trình có include thiếu hoặc vòng không làm helper ném', () => {
  const p = prog({ main: 'include "main"\ninclude "none"\na = 1' });
  assert.deepEqual(evaluate(p), { a: 1 });
});
