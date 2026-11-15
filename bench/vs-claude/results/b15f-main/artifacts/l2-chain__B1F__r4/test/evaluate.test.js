import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { evaluate } from '../src/evaluate.js';
import { mergeProgram, resolveRef } from '../src/merge.js';

const ev = (files, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return evaluate(p.program);
};

test('ví dụ mục 9: cấu hình có const, mảng, tham chiếu', () => {
  const r = ev({ main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }' });
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const r = ev({
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
  });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('include ghi đè trước/sau', () => {
  const files = { 'b.cfg': 'x = 1\ny = 1', main: 'x = 0\ninclude "b.cfg"\ny = 2' };
  assert.deepEqual(ev(files), { x: 1, y: 2 });
  const two = { 'a.cfg': 'k = "a"', 'b.cfg': 'k = "b"', main: 'include "a.cfg"\ninclude "b.cfg"' };
  assert.deepEqual(ev(two), { k: 'b' });
});

test('trộn sâu; mảng không trộn', () => {
  const r = ev({ main: 'a { b { c = 1 } l = [1,2] }\na { b { d = 2 } l = [3] }' });
  assert.deepEqual(r, { a: { b: { c: 1, d: 2 }, l: [3] } });
});

test('Block thay giá trị vô hướng, Assign thay Block; vị trí Block khởi tạo', () => {
  const r = ev({ main: 'a = 1\na { x = 1 }\nb { x = 1 }\nb = 2' });
  assert.deepEqual(r, { a: { x: 1 }, b: 2 });
  assert.deepEqual(Object.keys(r), ['a', 'b']);
  const p = parseProject({ main: 'a { x = 1 }\na = 1\na { y = 2 }\na { z = 3 }' }, 'main').program;
  const t = mergeProgram(p);
  assert.equal(t.root.entries.get('a').value.origin.line, 3);
  assert.equal(t.root.origin.line, 1);
});

test('tham chiếu tới khóa khai báo muộn và bị include ghi đè', () => {
  const r = ev({ 'b.cfg': 'v = "old"', main: 'include "b.cfg"\ns = "${v}-${w}"\nv = "new"\nw = 1' });
  assert.deepEqual(r, { v: 'new', s: 'new-1', w: 1 });
});

test('hằng dạng ${@lst.1}, hằng theo tệp', () => {
  const r = ev({
    'o.cfg': 'const c = "other"\nz = "${@c}"',
    main: 'const lst = [10, "x"]\nconst c = "main"\na = "${@lst.1}"\nb = "${@lst.0}!"\nc = "${@c}"\ninclude "o.cfg"',
  });
  assert.deepEqual(r, { a: 'x', b: '10!', c: 'main', z: 'other' });
});

test('giữ kiểu, null, nối chuỗi và số', () => {
  const r = ev({ main: 'n = null\nf = 1.50\nbig = 1e21\nt = true\na = "${n}"\nb = "${f}|${big}|${t}|${n}"\nc = "${a}"\nd = ""' });
  assert.deepEqual(r, { n: null, f: 1.5, big: 1e21, t: true, a: null, b: '1.5|1e+21|true|null', c: null, d: '' });
});

test('nội suy lồng', () => {
  const r = ev({ main: 'a = "x${b}"\nb = "y${c}"\nc = 3' });
  assert.equal(r.a, 'xy3');
});

test('hai ${x} trỏ cùng một mảng/đối tượng cho hai bản khác nhau', () => {
  const r = ev({ main: 'x = [1, [2]]\no { k = 1 }\na = "${x}"\nb = "${x}"\nc = "${o}"\nd = "${o}"' });
  assert.deepEqual(r.a, [1, [2]]);
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.x);
  assert.notEqual(r.a[1], r.b[1]);
  assert.notEqual(r.c, r.d);
  r.a[1].push(9);
  assert.deepEqual(r.b, [1, [2]]);
});

test('resolveRef: không đi xuyên chuỗi, chỉ số hợp lệ, đích null', () => {
  const p = parseProject({ main: 'a = "${b}"\nb = 1\nl = [1, null]\nn = null' }, 'main').program;
  const t = mergeProgram(p);
  const R = (path, c = false) => resolveRef(t, { path, const: c }, 'main');
  assert.equal(R(['a', 'x']), null);
  assert.equal(R(['b', 'x']), null);
  assert.equal(R(['l', '01']), null);
  assert.equal(R(['l', '2']), null);
  assert.equal(R(['l', '-1']), null);
  assert.notEqual(R(['l', '1']), null);
  assert.notEqual(R(['n']), null);
  assert.equal(R(['zz']), null);
  assert.equal(R(['zz'], true), null);
});
