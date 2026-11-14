import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';
import { evaluate } from '../src/evaluate.js';

const ev = (files, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true);
  assert.deepEqual(check(r.program), []);
  return evaluate(r.program);
};

test('ví dụ trong đặc tả', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }';
  assert.deepEqual(ev({ main: src }), { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('include, ghi đè, thứ tự khóa', () => {
  const r = ev({ main: 'include "b"\nserver { port = 2 }\nmode = "prod"', b: 'server { host = "a" port = 1 }\nmode = "dev"' });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
  const o = ev({ main: 'include "b"\nc = [2]', b: 'a = 1\nb = 2\nc = [1, 1]' });
  assert.deepEqual(Object.keys(o), ['a', 'b', 'c']);
  assert.deepEqual(o, { a: 1, b: 2, c: [2] });
});

test('tham chiếu thấy giá trị cuối, giữ kiểu, nối chuỗi', () => {
  const r = ev({
    main: 'include "b"\nx = "${n}" y = "n=${n}/${f}/${z}/${t}" arr2 = "${arr}" o2 = "${o}" n = 7 f = 1.50 z = null t = true\narr = [1, "a${n}"] o { k = "${n}" }\nbig = "${@b}"\nconst b = 1e21',
    b: 'n = 1',
  });
  assert.deepEqual(r, {
    n: 7, x: 7, y: 'n=7/1.5/null/true', arr2: [1, 'a7'], o2: { k: 7 }, f: 1.5, z: null, t: true,
    arr: [1, 'a7'], o: { k: 7 }, big: 1e21,
  });
  assert.notEqual(r.arr2, r.arr);
  assert.deepEqual(ev({ main: 'const l = [5, "q"]\na = "${@l.1}" b = "${@l}" e = ""' }), { a: 'q', b: [5, 'q'], e: '' });
  assert.deepEqual(ev({ main: 'a = "${b}" b = "${c}" c = "x"' }), { a: 'x', b: 'x', c: 'x' });
});
