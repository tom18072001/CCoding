import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { buildMerged, resolve, listStrings } from '../src/merge.js';

const prog = (files, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.program;
};
const ev = (files) => evaluate(prog(files));

test('mục 9: ví dụ đầy đủ', () => {
  const main =
    'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }';
  assert.deepEqual(ev({ main }), {
    name: 'svc-prod',
    ports: [80, 443],
    http: { port: 80 },
    https: { port: 443 },
  });
});

test('mục 9: include và ghi đè, thứ tự khóa', () => {
  const r = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('tham chiếu tới khóa khai báo muộn', () => {
  assert.deepEqual(ev({ main: 'a = "${b}"\nb = 7' }), { a: 7, b: 7 });
});

test('tham chiếu thấy giá trị bị include ghi đè', () => {
  assert.equal(ev({ main: 'x = "${m}"\ninclude "o"', o: 'm = "cuoi"' }).x, 'cuoi');
  assert.equal(ev({ main: 'm = "cu"\ninclude "o"\ny = "${m}"', o: 'm = "moi"' }).y, 'moi');
  assert.equal(ev({ main: 'y = "${m}"\ninclude "o"\nm = "main"', o: 'm = "moi"' }).y, 'main');
});

test('${@lst.1} và hằng', () => {
  const r = ev({ main: 'const lst = [10, 20]\nconst n = "x${@lst.0}"\na = "${@lst.1}"\nb = "${@n}!"' });
  assert.deepEqual(r, { a: 20, b: 'x10!' });
});

test('Block thay Assign rồi Assign thay Block: giữ thứ tự khóa', () => {
  const r = ev({ main: 'a = 1\nb = 2\na { x = 1 }\nc = 3\nb { y = 1 }\nb = 9' });
  assert.deepEqual(r, { a: { x: 1 }, b: 9, c: 3 });
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
});

test('Block sau Block trộn sâu; mảng không trộn', () => {
  const r = ev({ main: 'a { x = [1,2] y = 1 }\na { x = [3] z = 2 }' });
  assert.deepEqual(r, { a: { x: [3], y: 1, z: 2 } });
});

test('không chia sẻ tham chiếu', () => {
  const r = ev({ main: 'l = [1, [2]]\na = "${l}"\nb = "${l}"\no { k = 1 }\nc = "${o}"' });
  assert.notStrictEqual(r.a, r.b);
  assert.notStrictEqual(r.a, r.l);
  assert.notStrictEqual(r.a[1], r.b[1]);
  assert.notStrictEqual(r.c, r.o);
  assert.deepEqual(r.a, [1, [2]]);
});

test('giữ kiểu: null, bool, số; nối chuỗi; 1e21', () => {
  const r = ev({
    main: 'n = null\nb = true\nk = "${n}"\nm = "${b}"\ns = "a=${n},${b},${f}"\nf = 1.50\ne = "${big}"\nbig = 1e21\nt = "v${big}"',
  });
  assert.equal(r.k, null);
  assert.equal(r.m, true);
  assert.equal(r.s, 'a=null,true,1.5');
  assert.equal(r.e, 1e21);
  assert.equal(r.t, 'v1e+21');
});

test('nội suy lồng, chuỗi rỗng', () => {
  const r = ev({ main: 'a = "${b}-x"\nb = "${c}-y"\nc = "z"\ne = ""' });
  assert.deepEqual(r, { a: 'z-y-x', b: 'z-y', c: 'z', e: '' });
});

test('chuỗi trong mảng được đánh giá', () => {
  assert.deepEqual(ev({ main: 'a = 1\nl = ["${a}", "p${a}", ["${a}"]]' }), { a: 1, l: [1, 'p1', [1]] });
});

test('resolve: mảng, số 0 đứng đầu, không xuyên chuỗi, null tồn tại', () => {
  const m = buildMerged(prog({ main: 'l = [1,[2,3]]\ns = "t"\nn = null\no { k = 1 }\nconst c = [5]' }));
  const R = (path, c = false) => m.resolve({ path, const: c }, 'main');
  assert.equal(R(['l', '1', '0']).ast.value, 2);
  assert.equal(R(['l', '01']), null);
  assert.equal(R(['l', '2']), null);
  assert.equal(R(['l', 'x']), null);
  assert.equal(R(['s', '0']), null);
  assert.equal(R(['n']).ast.type, 'Null');
  assert.equal(R(['n', 'x']), null);
  assert.equal(R(['o']).kind, 'object');
  assert.equal(R(['o', 'k']).ast.value, 1);
  assert.equal(R(['c', '0'], true).ast.value, 5);
  assert.equal(R(['zz'], true), null);
  assert.equal(resolve(m, { path: ['o', 'k'], const: false }, 'main').ast.value, 1);
  assert.equal(R(['c']), null); // const không vào cây
});

test('const của tệp khác không thấy được; nguồn gốc nút', () => {
  const m = buildMerged(
    prog({
      main: 'a = 1\nb { x = 1 }\ninclude "o"\nb { y = 2 }',
      o: 'const k = 1\na = 2\nb = 5\nb { z = 3 }',
    }),
  );
  assert.equal(m.resolve({ path: ['k'], const: true }, 'main'), null);
  assert.notEqual(m.resolve({ path: ['k'], const: true }, 'o'), null);
  const a = m.root.entries.get('a');
  assert.deepEqual([a.file, a.line, a.column], ['o', 2, 1]);
  const b = m.root.entries.get('b');
  // Block z thay Assign b=5 → đối tượng khởi tạo tại o 4:1; Block y trộn vào
  assert.deepEqual([b.node.file, b.node.line, b.node.column], ['o', 4, 1]);
  assert.deepEqual([...b.node.entries.keys()], ['z', 'y']);
  assert.deepEqual([b.file, b.line, b.column], ['main', 4, 1]);
  assert.deepEqual([m.root.file, m.root.line, m.root.column], ['main', 1, 1]);
  assert.deepEqual([...m.root.entries.keys()], ['a', 'b']);
});

test('listStrings: gồm mảng, const, chuỗi bị ghi đè', () => {
  const p = prog({
    main: 'const c = "${@d}"\nconst d = ["x"]\na = "1"\na = "2"\nl = ["p", ["q"]]\nb { s = "${a}" }',
  });
  const l = listStrings(p);
  assert.equal(l.length, 7);
  assert.deepEqual(l.map((x) => x.inConst), [true, true, false, false, false, false, false]);
  assert.ok(l.every((x) => x.file === 'main' && x.node.type === 'String'));
});

test('listStrings: nhiều tệp theo tiền thứ tự', () => {
  const l = listStrings(prog({ main: 'include "z"\na = "m"', z: 'b = "z"' }));
  assert.deepEqual(l.map((x) => x.file), ['main', 'z']);
});
