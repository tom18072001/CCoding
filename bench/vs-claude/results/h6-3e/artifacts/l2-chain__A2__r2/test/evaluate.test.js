import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';

const ev = (files, entry = 'main') => {
  const r = compile(typeof files === 'string' ? { main: files } : files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return r.config;
};

test('ví dụ đầy đủ', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }';
  assert.deepEqual(ev(src), { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('include và ghi đè, thứ tự khóa', () => {
  const c = ev({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' });
  assert.deepEqual(c, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(c), ['server', 'mode']);
});

test('ghi đè: sau include, mảng thay hẳn, khối thay giá trị', () => {
  const base = 'a = [1,2]\nb = 1\nd { e = 1 }\nk = 1\nm = 5';
  const c = ev({ main: 'include "base"\na = [3]\nb { c = 1 }\nd = 2\nk = 9', base });
  assert.deepEqual(c, { a: [3], b: { c: 1 }, d: 2, k: 9, m: 5 });
  assert.deepEqual(Object.keys(c), ['a', 'b', 'd', 'k', 'm']);
});

test('tham chiếu thấy giá trị cuối; giữ kiểu; chuỗi hóa', () => {
  assert.deepEqual(ev({ main: 'include "b"\nx = "${y}"\ny = 2', b: 'y = 1' }), { x: 2, y: 2 });
  assert.deepEqual(ev('n = null\na = "${n}"\nb = "v=${n}"\nc = 1.50\nd = "${c}x"\ne = 1e21\nf = "${e}"\ng = "${e}!"\nt = true\nh = "${t}!"'), {
    n: null, a: null, b: 'v=null', c: 1.5, d: '1.5x', e: 1e21, f: 1e21, g: '1e+21!', t: true, h: 'true!' });
  assert.deepEqual(ev('o { a = 1 }\np = "${o}"\nl = [1, [2]]\nm = "${l}"\nq = "${l.1.0}"').q, 2);
});

test('không chia sẻ tham chiếu; lồng nhau; const', () => {
  const c = ev('l = [1]\na = "${l}"\nb = "${l}"');
  assert.notEqual(c.a, c.b);
  assert.notEqual(c.a, c.l);
  assert.deepEqual(ev('const k = [1, "z"]\na = "${@k.1}"\nb = "${@k}"\nconst m = "${@n}"\nconst n = 5\nc = "${@m}"'), { a: 'z', b: [1, 'z'], c: 5 });
  assert.deepEqual(ev('a = "${b}"\nb = "p-${c}"\nc = "q"'), { a: 'p-q', b: 'p-q', c: 'q' });
  assert.deepEqual(ev('a = ""'), { a: '' });
  assert.deepEqual(ev('__proto__ = 1'), JSON.parse('{"__proto__":1}'));
});

test('compile: lỗi theo tầng', () => {
  const p = compile({ main: 'a = ' }, 'main');
  assert.equal(p.stage, 'parse');
  assert.equal(p.errors[0].file, 'main');
  const c = compile({ main: 'a = "${b}"' }, 'main');
  assert.deepEqual([c.ok, c.stage, c.errors[0].code], [false, 'check', 'SEM_UNDEFINED_REF']);
  const s = compile({ main: 'a = 1' }, 'main', { type: 'object', fields: { a: { type: 'string' } } });
  assert.equal(s.errors[0].code, 'SEM_TYPE_MISMATCH');
});
