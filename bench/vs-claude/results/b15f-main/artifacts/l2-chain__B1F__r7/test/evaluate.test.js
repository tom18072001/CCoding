import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate, mergeProgram, resolveRef, evaluateMerged } from '../src/evaluate.js';

const ev = (files, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return evaluate(r.program);
};
const keys = (o) => Object.keys(o);

test('ví dụ mục 9: ports/const/nội suy', () => {
  const out = ev({
    main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }',
  });
  assert.deepEqual(out, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('ví dụ mục 9: include ghi đè, trộn sâu, thứ tự khóa', () => {
  const out = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(out, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(keys(out), ['server', 'mode']);
});

test('khóa khai báo trước include bị include ghi đè; ghi đè giữ vị trí khóa', () => {
  const out = ev({
    main: 'a = 1\nb = 2\ninclude "x"\nc = 3',
    x: 'a = 10\nz = 0\nb = 20',
  });
  assert.deepEqual(out, { a: 10, b: 20, z: 0, c: 3 });
  assert.deepEqual(keys(out), ['a', 'b', 'z', 'c']);
});

test('Block thay Assign và Assign thay Block; mảng không trộn', () => {
  assert.deepEqual(ev({ main: 'a = 1\na { x = 1 }' }), { a: { x: 1 } });
  assert.deepEqual(ev({ main: 'a { x = 1 }\ninclude "i"', i: 'a = [1]' }), { a: [1] });
  assert.deepEqual(ev({ main: 'l = [1,2,3]\ninclude "i"', i: 'l = [9]' }), { l: [9] });
  assert.deepEqual(ev({ main: 'a { x { p = 1 q = 2 } }\ninclude "i"', i: 'a { x { q = 3 } y = 1 }' }), {
    a: { x: { p: 1, q: 3 }, y: 1 },
  });
});

test('ref tới khóa khai báo muộn / bị include ghi đè thấy giá trị cuối', () => {
  assert.deepEqual(ev({ main: 'r = "${late}"\nlate = 7' }), { r: 7, late: 7 });
  assert.deepEqual(ev({ main: 'v = 1\nr = "${v}"\ninclude "i"', i: 'v = "over"' }), { v: 'over', r: 'over' });
});

test('${a} với a = null giữ null; nối ra "null"', () => {
  assert.deepEqual(ev({ main: 'a = null\nb = "${a}"\nc = "x${a}"' }), { a: null, b: null, c: 'xnull' });
});

test('hai ${x} trỏ mảng cho hai mảng khác nhau', () => {
  const out = ev({ main: 'x = [1, [2]]\np = "${x}"\nq = "${x}"' });
  assert.deepEqual(out.p, [1, [2]]);
  assert.notEqual(out.p, out.q);
  assert.notEqual(out.p, out.x);
  assert.notEqual(out.p[1], out.q[1]);
  out.p[1].push(9);
  assert.deepEqual(out.q, [1, [2]]);
});

test('nối số bằng JSON.stringify; bool; nội suy lồng', () => {
  const out = ev({ main: 'a = 1e21\nb = "${a}!"\nc = 1.50\nd = "${c}"\ne = "${c}x"\nf = true\ng = "${f}/${e}"\nh = "<${g}>"' });
  assert.equal(out.b, '1e+21!');
  assert.equal(out.d, 1.5);
  assert.equal(out.e, '1.5x');
  assert.equal(out.g, 'true/1.5x');
  assert.equal(out.h, '<true/1.5x>');
});

test('chuỗi thuần ref chuỗi thuần ref; chuỗi rỗng; -0', () => {
  assert.deepEqual(ev({ main: 'a = "${b}"\nb = "${c}"\nc = 3\nd = ""\ne = -0' }), { a: 3, b: 3, c: 3, d: '', e: 0 });
  assert.ok(Object.is(ev({ main: 'e = -0' }).e, 0));
});

test('ref tới đối tượng giữ kiểu; const và chỉ mục const', () => {
  assert.deepEqual(ev({ main: 'const l = ["a", [5]]\ns { k = 1 }\no = "${s}"\nx = "${@l.1.0}"\ny = "p-${@l.0}"' }), {
    s: { k: 1 }, o: { k: 1 }, x: 5, y: 'p-a',
  });
});

test('const theo từng tệp', () => {
  const out = ev({
    main: 'const c = "M"\ninclude "i"\na = "${@c}"',
    i: 'const c = "I"\nb = "${@c}"',
  });
  assert.deepEqual(out, { b: 'I', a: 'M' });
});

test('resolveRef: quy tắc mảng, không đi xuyên chuỗi, khóa riêng', () => {
  const r = parseProject({ main: 'arr = [1, 2]\ns = "${arr}"\nt = "z"\no { k = 1 }' }, 'main');
  const m = mergeProgram(r.program);
  const R = (path, c = false) => resolveRef(m, { path, const: c }, 'main');
  assert.equal(R(['arr', '1']).node.value, 2);
  assert.equal(R(['arr', '2']), null);
  assert.equal(R(['arr', '01']), null);
  assert.equal(R(['arr', 'x']), null);
  assert.equal(R(['s', '0']), null);
  assert.equal(R(['t', '0']), null);
  assert.equal(R(['o', 'constructor']), null);
  assert.equal(R(['o']).kind, 'obj');
  assert.equal(R(['nope', 'x']), null);
  assert.equal(R(['k'], true), null);
});

test('evaluateMerged: vị trí đối tượng, khóa và chuỗi thuần ref', () => {
  const r = parseProject({ main: 'o { a = 1 }\np = "${o}"\nq = 1\ninclude "i"', i: 'o { b = 2 }\nq { z = 1 }' }, 'main');
  const root = evaluateMerged(mergeProgram(r.program));
  assert.deepEqual([root.file, root.line, root.column], ['main', 1, 1]);
  const [o, p, q] = root.entries;
  assert.deepEqual([o.value.file, o.value.line, o.value.column], ['main', 1, 1]); // Block khởi tạo
  assert.deepEqual([o.value.entries[1].file, o.value.entries[1].line, o.value.entries[1].column], ['i', 1, 5]);
  assert.deepEqual([p.value.file, p.value.line, p.value.column], ['main', 2, 5]); // chuỗi thuần ref
  assert.deepEqual([p.value.entries[0].value.line, p.value.entries[0].value.column], [2, 5]);
  assert.deepEqual([q.value.file, q.value.line, q.value.column], ['i', 2, 1]); // Block thay Assign
});

test('kết quả không có undefined; khóa __proto__ là khóa thường', () => {
  const out = ev({ main: '__proto__ = 1\nb = "${__proto__}"' });
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.equal(out.b, 1);
  assert.equal(JSON.stringify(out), '{"__proto__":1,"b":1}');
});
