import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function ck(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program).map((e) => [e.code, e.file, e.line, e.column]);
}

test('hợp lệ → mảng rỗng', () => {
  assert.deepEqual(ck({ main: 'a = 1\nb = "${a}"' }), []);
});

test('A: SEM_DUPLICATE_KEY từ lần hai, Assign/Block trùng, khối khác không trùng', () => {
  const src = 'a = 1\na = 2\na { }\nb { a = 1 }\nc { x = 1\n  x = 2 }';
  assert.deepEqual(ck({ main: src }), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 6, 3],
  ]);
});

test('A: khóa giống nhau ở tệp khác (include vào cùng khối) không trùng', () => {
  assert.deepEqual(ck({ main: 'a = 1\ninclude "o"', o: 'a = 2' }), []);
});

test('A: SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(ck({ main: 'const k = 1\nconst k = 2\nconst k = 3' }), [
    ['SEM_DUPLICATE_CONST', 'main', 2, 1],
    ['SEM_DUPLICATE_CONST', 'main', 3, 1],
  ]);
});

test('A: SEM_INCLUDE_NOT_FOUND', () => {
  assert.deepEqual(ck({ main: 'x {\n  include "nope"\n}' }), [['SEM_INCLUDE_NOT_FOUND', 'main', 2, 3]]);
});

test('A: SEM_INCLUDE_CYCLE (cả tự include)', () => {
  assert.deepEqual(ck({ main: 'include "a"', a: 'x = 1\ninclude "b"', b: 'include "a"\ninclude "main"' }), [
    ['SEM_INCLUDE_CYCLE', 'b', 1, 1],
    ['SEM_INCLUDE_CYCLE', 'b', 2, 1],
  ]);
  assert.deepEqual(ck({ main: 'include "main"' }), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
});

test('A: hình thoi không phải vòng và tệp chung chỉ thăm một lần', () => {
  const files = { main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1\nk = 2' };
  assert.deepEqual(ck(files), [['SEM_DUPLICATE_KEY', 'd', 2, 1]]);
});

test('A: thứ tự lỗi theo tệp thăm tiền thứ tự, trong tệp theo (line, column)', () => {
  const files = {
    main: 'a = 1\ninclude "x"\ninclude "y"\na = 2\nz { include "none" }',
    x: 'k = 1\nk = 2',
    y: 'const c = 1\nconst c = 2',
  };
  assert.deepEqual(ck(files), [
    ['SEM_DUPLICATE_KEY', 'main', 4, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'main', 5, 5],
    ['SEM_DUPLICATE_KEY', 'x', 2, 1],
    ['SEM_DUPLICATE_CONST', 'y', 2, 1],
  ]);
});

test('A có lỗi thì không chạy pha B', () => {
  assert.deepEqual(ck({ main: 'a = 1\na = 2\nb = "${zzz}"' }), [['SEM_DUPLICATE_KEY', 'main', 2, 1]]);
});

test('B: SEM_UNDEFINED_REF (cả mảng, chỉ số sai, đi xuyên chuỗi/vô hướng, hằng tệp khác)', () => {
  const files = {
    main: 'include "o"\nl = [1]\ns = "t"\nu = "${nope}"\nv = ["${l.1}", "${l.9}", "${s.x}", "${@kk}", "${l.0}"]',
    o: 'const kk = 1',
  };
  assert.deepEqual(ck(files), [
    ['SEM_UNDEFINED_REF', 'main', 4, 6],
    ['SEM_UNDEFINED_REF', 'main', 5, 7],
    ['SEM_UNDEFINED_REF', 'main', 5, 17],
    ['SEM_UNDEFINED_REF', 'main', 5, 27],
    ['SEM_UNDEFINED_REF', 'main', 5, 37],
  ]);
});

test('B: hằng khai báo muộn và null đều tồn tại', () => {
  assert.deepEqual(ck({ main: 'a = "${@c}"\nn = null\nb = "${n}"\nconst c = 1' }), []);
});

test('B: SEM_CONST_CONFIG_REF', () => {
  assert.deepEqual(ck({ main: 'a = 1\nconst c = "x${a}"\nconst d = "${@c}"' }), [['SEM_CONST_CONFIG_REF', 'main', 2, 13]]);
});

test('B: SEM_REF_CYCLE — tự tham chiếu, hai chiều, tổ tiên', () => {
  assert.deepEqual(ck({ main: 'a = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(ck({ main: 'a = "${b}"\nb = "${a}"' }), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
  assert.deepEqual(ck({ main: 'x {\n  y = "${x}"\n}' }), [['SEM_REF_CYCLE', 'main', 2, 8]]);
});

test('B: vòng qua mảng và qua hằng', () => {
  assert.deepEqual(ck({ main: 'a = ["${b}"]\nb = "${a}"' }), [
    ['SEM_REF_CYCLE', 'main', 1, 7],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
  assert.deepEqual(ck({ main: 'const p = "${@q}"\nconst q = "${@p}"' }), [
    ['SEM_REF_CYCLE', 'main', 1, 12],
    ['SEM_REF_CYCLE', 'main', 2, 12],
  ]);
});

test('B: chỉ định nghĩa thắng mới tạo vòng; chuỗi bị ghi đè vẫn được kiểm', () => {
  assert.deepEqual(ck({ main: 'include "o"\nb = "${a}"\na = 1', o: 'a = "${b}"' }), []);
  assert.deepEqual(ck({ main: 'include "o"\na = 1', o: 'a = "${zz}"' }), [['SEM_UNDEFINED_REF', 'o', 1, 6]]);
});

test('B: hình thoi tham chiếu không báo vòng', () => {
  assert.deepEqual(ck({ main: 'd = 1\nb = "${d}"\nc = "${d}"\na = "${b}${c}"' }), []);
});

test('B: SEM_BAD_INTERPOLATION', () => {
  const src = 'l = [1]\no { k = 1 }\nu = "x${l}"\nv = "${o}${o}"\nw = "${l}"\nt = "y${w}"\nok = "x${o.k}"';
  assert.deepEqual(ck({ main: src }), [
    ['SEM_BAD_INTERPOLATION', 'main', 3, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 4, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 4, 10],
    ['SEM_BAD_INTERPOLATION', 'main', 6, 7],
  ]);
});

test('B: ưu tiên mã — CONST_CONFIG_REF > UNDEFINED > REF_CYCLE > BAD_INTERPOLATION', () => {
  const src = 'a = [1]\nb = "x${b}"\nc = "x${a}${nope}"\nconst k = "${a}${nope}"';
  assert.deepEqual(ck({ main: src }), [
    ['SEM_REF_CYCLE', 'main', 2, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 3, 7],
    ['SEM_UNDEFINED_REF', 'main', 3, 11],
    ['SEM_CONST_CONFIG_REF', 'main', 4, 12],
    ['SEM_CONST_CONFIG_REF', 'main', 4, 16],
  ]);
  // x = ["${x}"]: Ref trong x là vòng; y chỉ bị nội suy sai (y không nằm trong vòng)
  assert.deepEqual(ck({ main: 'x = ["${x}"]\ny = "p${x}"' }), [
    ['SEM_REF_CYCLE', 'main', 1, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 2, 7],
  ]);
});

test('B: thứ tự lỗi theo tệp rồi (line, column)', () => {
  const files = { main: 'include "o"\nb = "${n2}"', o: 'a = "${n1}"' };
  assert.deepEqual(ck(files), [
    ['SEM_UNDEFINED_REF', 'main', 2, 6],
    ['SEM_UNDEFINED_REF', 'o', 1, 6],
  ]);
});

test('không ném khi thiếu entry; không schema thì không có pha C', () => {
  assert.deepEqual(check({ entry: 'x', files: {} }), []);
});
