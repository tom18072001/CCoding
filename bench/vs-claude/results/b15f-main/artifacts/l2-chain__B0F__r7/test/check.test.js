import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.ok(p.ok, JSON.stringify(p.error));
  return check(p.program, schema).map(({ code, file, line, column }) => ({ code, file, line, column }));
};
const e = (code, file, line, column) => ({ code, file, line, column });

test('A: DUPLICATE_KEY (Assign/Block, lần 2 và 3, khối khác không tính)', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\na {}\ns { a = 1 }\nb = 1\nb = 2' }), [
    e('SEM_DUPLICATE_KEY', 'main', 2, 1), e('SEM_DUPLICATE_KEY', 'main', 3, 1), e('SEM_DUPLICATE_KEY', 'main', 6, 1),
  ]);
  assert.deepEqual(run({ main: 's { x = 1\n  x = 2 }' }), [e('SEM_DUPLICATE_KEY', 'main', 2, 3)]);
});

test('A: khóa giống nhau giữa tệp include không trùng', () => {
  assert.deepEqual(run({ main: 'a = 1\ninclude "o"', o: 'a = 2' }), []);
});

test('A: DUPLICATE_CONST', () => {
  assert.deepEqual(run({ main: 'const c = 1\nconst c = 2' }), [e('SEM_DUPLICATE_CONST', 'main', 2, 1)]);
});

test('A: INCLUDE_NOT_FOUND', () => {
  assert.deepEqual(run({ main: 'x {\n  include "zz"\n}' }), [e('SEM_INCLUDE_NOT_FOUND', 'main', 2, 3)]);
});

test('A: INCLUDE_CYCLE (kể cả tự include) và hình thoi không phải vòng', () => {
  assert.deepEqual(run({ main: 'include "a"', a: 'include "main"\ninclude "a"' }), [
    e('SEM_INCLUDE_CYCLE', 'a', 1, 1), e('SEM_INCLUDE_CYCLE', 'a', 2, 1),
  ]);
  assert.deepEqual(run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' }), []);
});

test('A: thứ tự lỗi nhiều tệp theo tiền thứ tự, trong tệp theo (line, column)', () => {
  const files = {
    main: 'include "b"\ninclude "c"\nk = 1\nk = 2',
    b: 'include "d"\nz = 1\nz = 2',
    c: 'q = 1\nq = 2',
    d: 'include "nope"',
  };
  assert.deepEqual(run(files), [
    e('SEM_DUPLICATE_KEY', 'main', 4, 1),
    e('SEM_DUPLICATE_KEY', 'b', 3, 1),
    e('SEM_INCLUDE_NOT_FOUND', 'd', 1, 1),
    e('SEM_DUPLICATE_KEY', 'c', 2, 1),
  ]);
  assert.deepEqual(run({ main: 'const a = 1\nconst a = 2\nx = 1\nx = 2\ninclude "zz"' }).map((x) => x.line), [2, 4, 5]);
});

test('A lỗi thì không có lỗi B', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\nb = "${zz}"' }), [e('SEM_DUPLICATE_KEY', 'main', 2, 1)]);
});

test('B: UNDEFINED_REF (cấu hình, chỉ mục, xuyên chuỗi, hằng tệp khác)', () => {
  const main = 'a = "${b}"\nl = [1]\nm = "${l.1}"\nn = "${l.5}"\ns = "x"\nt = "${s.y}"\nu = "${@c}"\ninclude "o"';
  assert.deepEqual(run({ main, o: 'const c = 1' }), [
    e('SEM_UNDEFINED_REF', 'main', 1, 6), e('SEM_UNDEFINED_REF', 'main', 3, 6), e('SEM_UNDEFINED_REF', 'main', 4, 6),
    e('SEM_UNDEFINED_REF', 'main', 6, 6), e('SEM_UNDEFINED_REF', 'main', 7, 6),
  ]);
});

test('B: ref hằng khai báo muộn, ref tới null', () => {
  assert.deepEqual(run({ main: 'a = "${@c}"\nconst c = "x"\nn = null\nm = "${n}"' }), []);
});

test('B: CONST_CONFIG_REF', () => {
  assert.deepEqual(run({ main: 'a = 1\nconst c = "${a}"\nconst d = "${@c}"' }), [e('SEM_CONST_CONFIG_REF', 'main', 2, 12)]);
});

test('B: REF_CYCLE (tự tham chiếu, hai chiều, tổ tiên)', () => {
  assert.deepEqual(run({ main: 'a = "${a}"' }), [e('SEM_REF_CYCLE', 'main', 1, 6)]);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"' }), [e('SEM_REF_CYCLE', 'main', 1, 6), e('SEM_REF_CYCLE', 'main', 2, 6)]);
  assert.deepEqual(run({ main: 'x {\n  y = "${x}"\n}' }), [e('SEM_REF_CYCLE', 'main', 2, 8)]);
});

test('B: vòng chỉ tính định nghĩa thắng; chuỗi bị ghi đè vẫn bị xét', () => {
  assert.deepEqual(run({ main: 'a = "${b}"\ninclude "o"\nb = "${a}"', o: 'a = 1' }), []);
  assert.deepEqual(run({ main: 'a = "${zz}"\ninclude "o"', o: 'a = 1' }), [e('SEM_UNDEFINED_REF', 'main', 1, 6)]);
});

test('B: BAD_INTERPOLATION', () => {
  const main = 'l = [1]\no { k = 1 }\na = "x${l}"\nb = "${l}"\nc = "${o}${o}"\nd = "n${l.0}"';
  assert.deepEqual(run({ main }), [
    e('SEM_BAD_INTERPOLATION', 'main', 3, 7), e('SEM_BAD_INTERPOLATION', 'main', 5, 6), e('SEM_BAD_INTERPOLATION', 'main', 5, 10),
  ]);
});

test('B: ưu tiên lỗi trên cùng một Ref', () => {
  assert.deepEqual(run({ main: 'const c = "${zz}"' }), [e('SEM_CONST_CONFIG_REF', 'main', 1, 12)]);
  assert.deepEqual(run({ main: 'a = "x${a.q}"' }), [e('SEM_UNDEFINED_REF', 'main', 1, 7)]);
  // vòng thắng BAD_INTERPOLATION: "${a}" trong a là mảng chứa chính chuỗi
  assert.deepEqual(run({ main: 'a = ["x${a}"]' }), [e('SEM_REF_CYCLE', 'main', 1, 8)]);
});

test('B lỗi thì không có lỗi C', () => {
  assert.deepEqual(run({ main: 'a = "${zz}"' }, { fields: { a: { type: 'number' } } }), [e('SEM_UNDEFINED_REF', 'main', 1, 6)]);
});

test('B: lỗi nhiều tệp theo thứ tự thăm', () => {
  assert.deepEqual(run({ main: 'include "b"\nx = "${m1}"', b: 'y = "${m2}"' }), [
    e('SEM_UNDEFINED_REF', 'main', 2, 6), e('SEM_UNDEFINED_REF', 'b', 1, 6),
  ]);
});

test('C: TYPE_MISMATCH tại nút giá trị, không kiểm sâu', () => {
  assert.deepEqual(run({ main: 'a = "x"\nb = [1, "s"]' }, { fields: { a: { type: 'number' }, b: { type: 'array', items: { type: 'integer' } } } }), [
    e('SEM_TYPE_MISMATCH', 'main', 1, 5), e('SEM_TYPE_MISMATCH', 'main', 2, 9),
  ]);
  assert.deepEqual(run({ main: 'o { z = 1 }' }, { fields: { o: { type: 'array', fields: {}, closed: true } } }), [
    e('SEM_TYPE_MISMATCH', 'main', 1, 1),
  ]);
  assert.deepEqual(run({ main: 'a = 1.5\nb = 2\nc = null' }, { fields: { a: { type: 'integer' }, b: { type: 'number' }, c: { type: 'object' } } }), [
    e('SEM_TYPE_MISMATCH', 'main', 1, 5), e('SEM_TYPE_MISMATCH', 'main', 3, 5),
  ]);
});

test('C: NOT_IN_ENUM', () => {
  assert.deepEqual(run({ main: 'a = "z"\nb = "${a}-1"' }, { fields: { a: { enum: ['x', 'y'] }, b: { enum: ['z-1'] } } }), [
    e('SEM_NOT_IN_ENUM', 'main', 1, 5),
  ]);
});

test('C: MISSING_REQUIRED tại đối tượng (gốc 1:1), required trước unknown', () => {
  const s = { closed: true, fields: { r: { required: true }, s: { fields: { q: { required: true }, w: { required: true } }, closed: true } } };
  assert.deepEqual(run({ main: 'ok = 1\ns {\n  zz = 1\n}' }, s), [
    e('SEM_MISSING_REQUIRED', 'main', 1, 1),
    e('SEM_UNKNOWN_KEY', 'main', 1, 1),
    e('SEM_MISSING_REQUIRED', 'main', 2, 1),
    e('SEM_MISSING_REQUIRED', 'main', 2, 1),
    e('SEM_UNKNOWN_KEY', 'main', 3, 3),
  ]);
});

test('C: vị trí đối tượng là Block khởi tạo; UNKNOWN_KEY tại khóa thắng', () => {
  const s = { fields: { s: { fields: { q: { required: true } }, closed: true } } };
  assert.deepEqual(run({ main: 's {\n  a = 1\n}\ns2 = 1' }, s), [
    e('SEM_MISSING_REQUIRED', 'main', 1, 1), e('SEM_UNKNOWN_KEY', 'main', 2, 3),
  ]);
});

test('C: giá trị từ chuỗi thuần tham chiếu báo tại chuỗi đó', () => {
  const main = 'n = "s"\nm = "${n}"\nl = [1, "k"]\nm2 = "${l}"';
  assert.deepEqual(run({ main }, { fields: { m: { type: 'number' }, m2: { items: { type: 'number' } } } }), [
    e('SEM_TYPE_MISMATCH', 'main', 2, 5), e('SEM_TYPE_MISMATCH', 'main', 4, 6),
  ]);
});

test('C: không có schema thì không chạy pha C; items hợp lệ', () => {
  assert.deepEqual(run({ main: 'a = "x"' }), []);
  assert.deepEqual(run({ main: 'a = [1, 2]' }, { fields: { a: { type: 'array', items: { type: 'number' } } } }), []);
});

test('C: lỗi mang file của tệp chứa giá trị', () => {
  assert.deepEqual(run({ main: 'include "o"', o: '\n  a = "x"' }, { fields: { a: { type: 'number' } } }), [
    e('SEM_TYPE_MISMATCH', 'o', 2, 7),
  ]);
});
