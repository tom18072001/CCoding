import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
};

test('pha A: trùng khóa/hằng, include', () => {
  assert.deepEqual(run({ main: 'a = 1\na { }\nb { x = 1 x = 2 }\nconst c = 1\nconst c = 2\nc = 1' }), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 11],
    ['SEM_DUPLICATE_CONST', 'main', 5, 1],
  ]);
  assert.deepEqual(run({ main: 'include "x"\ninclude "main"\nk { include "y" }', y: 'include "main"' }), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1],
    ['SEM_INCLUDE_CYCLE', 'main', 2, 1],
    ['SEM_INCLUDE_CYCLE', 'y', 1, 1],
  ]);
});

test('pha A: hình thoi không phải vòng; khóa khác tệp không trùng', () => {
  const files = { main: 'a = 1\ninclude "b"\ninclude "c"', b: 'a = 2\ninclude "d"', c: 'include "d"', d: 'z = 1' };
  assert.deepEqual(run(files), []);
});

test('pha A dừng trước pha B', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\nb = "${zz}"' }).map((e) => e[0]), ['SEM_DUPLICATE_KEY']);
});

test('pha B: undefined, hằng', () => {
  const r = run({ main: 'const k = "${x}"\nconst m = "${@k}"\na = "${@zz} ${b.c} ${@m}"\nb = [1]\nc = "${b.0.1}"' });
  assert.deepEqual(r, [
    ['SEM_CONST_CONFIG_REF', 'main', 1, 12],
    ['SEM_UNDEFINED_REF', 'main', 3, 6],
    ['SEM_UNDEFINED_REF', 'main', 3, 13],
    ['SEM_UNDEFINED_REF', 'main', 5, 6],
  ]);
  assert.deepEqual(run({ main: 'include "o"\nn = "${@c}"', o: 'const c = 1' }), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  assert.deepEqual(run({ main: 'n = "${@c}"\nconst c = [1]\nm = "${@c.0}"' }), []);
});

test('pha B: vòng tham chiếu', () => {
  assert.deepEqual(run({ main: 'a = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6], ['SEM_REF_CYCLE', 'main', 2, 6]]);
  assert.deepEqual(run({ main: 'x { y = "${x}" }' }), [['SEM_REF_CYCLE', 'main', 1, 10]]);
});

test('pha B: nội suy mảng/đối tượng', () => {
  assert.deepEqual(run({ main: 'l = [1]\no { a = 1 }\np = "${l}"\nq = "x${l}"\nr = "${o}${o}"\ns = "x${p}"\nt = "x${o.a}"' }), [
    ['SEM_BAD_INTERPOLATION', 'main', 4, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 10],
    ['SEM_BAD_INTERPOLATION', 'main', 6, 7],
  ]);
});

const schema = {
  type: 'object', closed: true,
  fields: {
    name: { type: 'string', required: true },
    port: { type: 'integer', enum: [80, 8080] },
    tags: { type: 'array', items: { type: 'string' } },
    srv: { type: 'object', required: true, fields: { host: { required: true } }, closed: true },
    any: { type: 'any' },
  },
};

test('pha C: lược đồ', () => {
  assert.deepEqual(run({ main: 'port = 1.5\ntags = ["a", 2]\nextra = 1\nsrv { zz = 1 }' }, schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_TYPE_MISMATCH', 'main', 2, 14],
    ['SEM_UNKNOWN_KEY', 'main', 3, 1],
    ['SEM_MISSING_REQUIRED', 'main', 4, 1],
    ['SEM_UNKNOWN_KEY', 'main', 4, 7],
  ]);
  assert.deepEqual(run({ main: 'name = "a"\nport = 81\nsrv { host = 1 }' }, schema), [['SEM_NOT_IN_ENUM', 'main', 2, 8]]);
  assert.deepEqual(run({ main: 'name = "a"\nsrv { host = 1 }\nany = null' }, schema), []);
});

test('pha C: vị trí qua tham chiếu thuần và khối khởi tạo', () => {
  const s = { type: 'object', fields: { b: { type: 'object', fields: { x: { type: 'string' } } } } };
  assert.deepEqual(run({ main: 'a { x = 1 }\nb = "${a}"' }, s), [['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
  const m = { type: 'object', fields: { b: { type: 'object', fields: { z: { required: true } } } } };
  assert.deepEqual(run({ main: 'include "o"\nb { x = 2 }', o: 'b { y = 1 }' }, m), [['SEM_MISSING_REQUIRED', 'o', 1, 1]]);
  assert.deepEqual(run({ main: 'include "o"\nb { y = 1 }', o: 'b = 1' }, m), [['SEM_MISSING_REQUIRED', 'main', 2, 1]]);
});

test('pha C: SEM_UNKNOWN_KEY luôn ở token khóa, kể cả khi đối tượng đến từ chuỗi thuần tham chiếu', () => {
  const s = { type: 'object', fields: { b: { type: 'object', closed: true, fields: { x: {} } } } };
  assert.deepEqual(run({ main: 'a { x = 1\n  y = 2 }\nb = "${a}"' }, s), [['SEM_UNKNOWN_KEY', 'main', 2, 3]]);
});

test('pha C: MISSING_REQUIRED/TYPE_MISMATCH qua tham chiếu thuần dùng vị trí chuỗi', () => {
  const s = { type: 'object', fields: { b: { type: 'object', fields: { z: { required: true } } }, c: { type: 'array', items: { type: 'string' } } } };
  assert.deepEqual(run({ main: 'a { x = 1 }\nb = "${a}"\nl = [1]\nc = "${l}"' }, s), [
    ['SEM_MISSING_REQUIRED', 'main', 2, 5],
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
  ]);
});

test('pha B: thứ tự theo tệp rồi theo vị trí; chuỗi bị ghi đè vẫn bị xét', () => {
  const r = run({ main: 'z = "${q1}"\ninclude "o"\na = "${q2}"', o: 'a = "${q3}"\nb = "${q4}"' });
  assert.deepEqual(r, [
    ['SEM_UNDEFINED_REF', 'main', 1, 6],
    ['SEM_UNDEFINED_REF', 'main', 3, 6],
    ['SEM_UNDEFINED_REF', 'o', 1, 6],
    ['SEM_UNDEFINED_REF', 'o', 2, 6],
  ]);
});

test('pha B: S(đích) chỉ tính định nghĩa thắng; mảng chứa chuỗi cùng vòng', () => {
  // chuỗi cũ "${x}" của y (bị ghi đè) không nằm trong S(y): không có vòng
  assert.deepEqual(run({ main: 'include "o"\nx = "${y}"\ny = 1', o: 'y = "${x}"' }), []);
  assert.deepEqual(run({ main: 'inc = 1\nl = ["${l}"]' }), [['SEM_REF_CYCLE', 'main', 2, 7]]);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = ["${a}"]' }), [['SEM_REF_CYCLE', 'main', 1, 6], ['SEM_REF_CYCLE', 'main', 2, 7]]);
});

test('pha B: Ref cấu hình trong const báo CONST_CONFIG_REF; cạnh vẫn tính cho vòng', () => {
  assert.deepEqual(run({ main: 'const c = "${c2}"\nc2 = "${@c}"' }), [['SEM_CONST_CONFIG_REF', 'main', 1, 12], ['SEM_REF_CYCLE', 'main', 2, 7]]);
});

test('pha C: type/enum không kiểm sâu; null, number, integer', () => {
  const s = { type: 'object', fields: { n: { type: 'null' }, f: { type: 'number' }, o: { type: 'object', fields: { k: { required: true } } }, e: { enum: ['a'] } } };
  assert.deepEqual(run({ main: 'n = null\nf = 2\no = []\ne = "b"' }, s), [['SEM_TYPE_MISMATCH', 'main', 3, 5], ['SEM_NOT_IN_ENUM', 'main', 4, 5]]);
  assert.deepEqual(run({ main: 'n = 0\nf = "1"' }, s), [['SEM_TYPE_MISMATCH', 'main', 1, 5], ['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
});
