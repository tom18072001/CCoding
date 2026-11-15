import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
};
const one = (src, schema) => run({ main: src }, schema);

test('pha A: trùng khóa/hằng, include', () => {
  assert.deepEqual(one('a = 1\na { }\na = 2\nconst c = 1\nconst c = 2'), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1], ['SEM_DUPLICATE_KEY', 'main', 3, 1], ['SEM_DUPLICATE_CONST', 'main', 5, 1],
  ]);
  assert.deepEqual(one('a = 1\nb { a = 1 }'), []);
  assert.deepEqual(run({ main: 'include "x"\ninclude "nope"', x: 'include "main"\na = 1\na = 2' }), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 2, 1], ['SEM_INCLUDE_CYCLE', 'x', 1, 1], ['SEM_DUPLICATE_KEY', 'x', 3, 1],
  ]);
  assert.deepEqual(run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1' }), []);
  assert.deepEqual(run({ main: 'include "main"' }), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  // pha A chặn pha B
  assert.deepEqual(one('a = 1\na = "${zz}"'), [['SEM_DUPLICATE_KEY', 'main', 2, 1]]);
});

test('pha B: tham chiếu', () => {
  assert.deepEqual(one('const c = "${a}"\na = 1'), [['SEM_CONST_CONFIG_REF', 'main', 1, 12]]);
  assert.deepEqual(one('a = "${b}" b = "${@c}" const d = 1\nc = "${@d.x}"'), [
    ['SEM_UNDEFINED_REF', 'main', 1, 17], ['SEM_UNDEFINED_REF', 'main', 2, 6],
  ]);
  assert.deepEqual(one('a = [1]\nb = "${a.0}" c = "${a.1}" d = "${b.x}" e = "${a.0.x}"').map((e) => e[3]), [19, 32, 45]);
  assert.deepEqual(one('a = "${a}"'), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(one('a = "${b}"\nb = "${a}"').map((e) => e.slice(2)), [[1, 6], [2, 6]]);
  assert.deepEqual(one('x { y = "${x}" }'), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(one('arr = [1]\ns = "v${arr}"\nt = "${arr}"\no { k = 1 }\nu = "${o}-${o.k}"'), [
    ['SEM_BAD_INTERPOLATION', 'main', 2, 7], ['SEM_BAD_INTERPOLATION', 'main', 5, 6],
  ]);
  assert.deepEqual(one('a = [1]\nb = "${a}"\nc = "x${b}"'), [['SEM_BAD_INTERPOLATION', 'main', 3, 7]]);
  assert.deepEqual(one('n = null\ns = "${n}${n}"'), []);
  // hằng của tệp khác không thấy được
  assert.deepEqual(run({ main: 'include "o"\na = "${@k}"', o: 'const k = 1' }), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  // chuỗi bị ghi đè vẫn được kiểm
  assert.deepEqual(one('a = "${zz}"\na2 = 1'), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
});

test('pha C: lược đồ', () => {
  const schema = {
    type: 'object', closed: true,
    fields: {
      name: { type: 'string', required: true },
      port: { type: 'integer', enum: [80, 8080] },
      tags: { type: 'array', items: { type: 'string' } },
      srv: { type: 'object', fields: { host: { required: true } } },
    },
  };
  assert.deepEqual(one('name = "a"\nport = 80\ntags = ["x"]', schema), []);
  assert.deepEqual(one('port = 1.5\ntags = [1, "a", 2]\nsrv {}\nextra = 1\nname = 3', schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 8], ['SEM_TYPE_MISMATCH', 'main', 2, 9], ['SEM_TYPE_MISMATCH', 'main', 2, 17],
    ['SEM_MISSING_REQUIRED', 'main', 3, 1], ['SEM_UNKNOWN_KEY', 'main', 4, 1], ['SEM_TYPE_MISMATCH', 'main', 5, 8],
  ]);
  assert.deepEqual(one('port = 81', schema).map((e) => e[0]), ['SEM_MISSING_REQUIRED', 'SEM_NOT_IN_ENUM']);
  assert.deepEqual(one('', schema), [['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
  // chuỗi thuần tham chiếu: vị trí là chuỗi
  assert.deepEqual(
    one('o { host = 1 q = 2 }\nsrv = "${o}"', { fields: { srv: { closed: true, fields: { host: {} } } } }),
    [['SEM_UNKNOWN_KEY', 'main', 2, 7]],
  );
  assert.deepEqual(one('n = 1\nname = "${n}"', { fields: { name: { type: 'string' } } }), [['SEM_TYPE_MISMATCH', 'main', 2, 8]]);
});
