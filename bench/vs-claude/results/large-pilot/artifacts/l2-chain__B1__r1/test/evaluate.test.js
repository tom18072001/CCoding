import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';
import { evaluate } from '../src/evaluate.js';

const ev = (files, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true);
  assert.deepEqual(check(p.program), []);
  return evaluate(p.program);
};

test('evaluate: ví dụ SPEC', () => {
  const r = ev({ main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }' });
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('evaluate: include và ghi đè, thứ tự khóa', () => {
  const r = ev({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('evaluate: ghi đè khác loại, mảng thay hẳn, khóa giữ chỗ', () => {
  const r = ev({ main: 'include "f1"\ninclude "f2"\ninclude "f3"', f1: 'a = 1\nb = 2', f2: 'a { x = 1 }\nb = [1,2]', f3: 'a = "s"\nb = [3]' });
  assert.deepEqual(r, { a: 's', b: [3] });
  assert.deepEqual(Object.keys(r), ['a', 'b']);
});

test('evaluate: tham chiếu thấy giá trị cuối, giữ kiểu, không chia sẻ', () => {
  const r = ev({ main: 'x = "${y}"\nl = [1, [2]]\nm = "${l}"\nn = "${l}"\ny = 1.50\ns = "v=${y} ${z} ${w}"\nz = null\nw = true\ne = 1e21\nu = "a${e}"' });
  assert.equal(r.x, 1.5);
  assert.equal(r.s, 'v=1.5 null true');
  assert.equal(r.u, 'a1e+21');
  assert.deepEqual(r.m, [1, [2]]);
  assert.notEqual(r.m, r.n);
  assert.notEqual(r.m[1], r.l[1]);
});

test('evaluate: lồng và đối tượng', () => {
  const r = ev({ main: 'a { b { c = "${d}" } }\nd = "${@k.1}"\nconst k = ["p", "q"]\ne = "${a}"\nf = "[${a.b.c}]"\ng = ""\nh = "\\${a}"' });
  assert.deepEqual(r, { a: { b: { c: 'q' } }, d: 'q', e: { b: { c: 'q' } }, f: '[q]', g: '', h: '${a}' });
});
