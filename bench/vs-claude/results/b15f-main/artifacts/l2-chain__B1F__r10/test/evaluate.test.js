import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate, buildMerged, resolveRef, collectStrings } from '../src/evaluate.js';

const ev = (files, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p));
  return evaluate(p.program);
};

test('ví dụ mục 9: nội suy, hằng, chỉ số', () => {
  const r = ev({
    main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }',
  });
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const r = ev({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('khóa bị ghi đè giữ vị trí cũ', () => {
  const r = ev({ main: 'a = 1\nb = 2\na = 3' });
  assert.deepEqual(Object.keys(r), ['a', 'b']);
  assert.equal(r.a, 3);
});

test('block thay thế giá trị không phải đối tượng; assign thay block', () => {
  assert.deepEqual(ev({ main: 'a = 1\na { x = 1 }' }), { a: { x: 1 } });
  assert.deepEqual(ev({ main: 'a { x = 1 }\na = [1]' }), { a: [1] });
});

test('mảng không trộn', () => {
  const r = ev({ main: 'include "b"\na = [3]', b: 'a = [1,2]' });
  assert.deepEqual(r, { a: [3] });
});

test('tham chiếu tới khóa khai báo muộn và bị include ghi đè', () => {
  const r = ev({ main: 'x = "${y}"\ninclude "b"\ny = "late"', b: 'y = "early"' });
  assert.equal(r.x, 'late');
});

test('giữ kiểu khi chuỗi thuần Ref; nối thì stringify', () => {
  const r = ev({ main: 'n = null\nb = true\na = "${n}"\nc = "${b}"\nd = "x${n}${b}"\ne = [1]\nf = "${e}"' });
  assert.deepEqual(r, { n: null, b: true, a: null, c: true, d: 'xnulltrue', e: [1], f: [1] });
});

test('số khi nối: 1.50 -> 1.5, 1e21 -> 1e+21', () => {
  const r = ev({ main: 'a = 1.50\nb = 1e21\ns = "${a}|${b}"' });
  assert.equal(r.s, '1.5|1e+21');
});

test('hằng có chỉ mục, nội suy lồng', () => {
  const r = ev({ main: 'const l = ["a", "b${@k}"]\nconst k = 7\nx = "${@l.1}"\ny = "[${x}]"' });
  assert.equal(r.x, 'b7');
  assert.equal(r.y, '[b7]');
});

test('hằng lấy trong tệp chứa chuỗi', () => {
  const r = ev({ main: 'const c = "m"\ninclude "b"', b: 'const c = "b"\nv = "${@c}"' });
  assert.equal(r.v, 'b');
});

test('không chia sẻ mảng / đối tượng', () => {
  const r = ev({ main: 'a = [1, [2]]\nb = "${a}"\nc = "${a}"\no { k = 1 }\np = "${o}"' });
  assert.notEqual(r.b, r.c);
  assert.notEqual(r.b, r.a);
  assert.notEqual(r.b[1], r.a[1]);
  assert.notEqual(r.p, r.o);
  r.b[1].push(9);
  assert.deepEqual(r.a, [1, [2]]);
});

test('chuỗi rỗng và khóa __proto__', () => {
  const r = ev({ main: 's = ""\n__proto__ = 1' });
  assert.equal(r.s, '');
  assert.equal(Object.keys(r).length, 2);
});

test('helper: buildMerged, resolveRef, collectStrings', () => {
  const p = parseProject({ main: 'a { x = "s" }\na { y = [ "t" ] }\nb = 1\nb = "u"' }, 'main').program;
  const m = buildMerged(p);
  assert.equal(m.root.entries.get('a').value.block.line, 1);
  assert.equal(m.root.entries.get('a').node.line, 2);
  const t = resolveRef(m, { path: ['a', 'y', '0'], const: false }, 'main');
  assert.equal(t.node.type, 'String');
  assert.equal(resolveRef(m, { path: ['a', 'y', '00'], const: false }, 'main'), undefined);
  assert.equal(resolveRef(m, { path: ['b', 'z'], const: false }, 'main'), undefined);
  assert.equal(collectStrings(m.root).length, 3);
});
