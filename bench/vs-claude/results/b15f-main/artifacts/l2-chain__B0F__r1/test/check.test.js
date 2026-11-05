import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function run(files, entry = 'main') {
  const p = parseProject(files, entry);
  assert.ok(p.ok, JSON.stringify(p.error));
  return check(p.program).map(({ code, file, line, column }) => ({ code, file, line, column }));
}

test('hợp lệ → mảng rỗng', () => {
  assert.deepEqual(run({ main: 'a = 1\nb { a = 2 }\nconst x = 1' }), []);
});

test('SEM_DUPLICATE_KEY: mỗi lần xuất hiện sau đều báo', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\n  a { }' }), [
    { code: 'SEM_DUPLICATE_KEY', file: 'main', line: 2, column: 1 },
    { code: 'SEM_DUPLICATE_KEY', file: 'main', line: 3, column: 3 },
  ]);
});

test('SEM_DUPLICATE_KEY: Block + Assign cùng khóa; khối/tệp khác không trùng', () => {
  assert.deepEqual(run({ main: 'a { x = 1 }\na = 1\nb { x = 1 }\ninclude "o"', o: 'a = 1' }), [
    { code: 'SEM_DUPLICATE_KEY', file: 'main', line: 2, column: 1 },
  ]);
  assert.deepEqual(run({ main: 'x = 1\nb { include "o" x = 2 }', o: 'x = 1' }), []);
});

test('SEM_DUPLICATE_KEY: trong khối lồng', () => {
  assert.deepEqual(run({ main: 'b {\n  x = 1\n  x = 2\n}' }), [
    { code: 'SEM_DUPLICATE_KEY', file: 'main', line: 3, column: 3 },
  ]);
});

test('SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(run({ main: 'const a = 1\nconst b = 1\nconst a = 2' }), [
    { code: 'SEM_DUPLICATE_CONST', file: 'main', line: 3, column: 1 },
  ]);
});

test('SEM_INCLUDE_NOT_FOUND', () => {
  assert.deepEqual(run({ main: 'a = 1\ninclude "nope"' }), [
    { code: 'SEM_INCLUDE_NOT_FOUND', file: 'main', line: 2, column: 1 },
  ]);
});

test('SEM_INCLUDE_CYCLE: gián tiếp và tự include', () => {
  assert.deepEqual(run({ main: 'include "b"', b: 'x = 1\ninclude "main"' }), [
    { code: 'SEM_INCLUDE_CYCLE', file: 'b', line: 2, column: 1 },
  ]);
  assert.deepEqual(run({ main: 'include "main"' }), [
    { code: 'SEM_INCLUDE_CYCLE', file: 'main', line: 1, column: 1 },
  ]);
});

test('hình thoi không phải vòng', () => {
  assert.deepEqual(
    run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1' }),
    [],
  );
});

test('thứ tự lỗi: theo tệp tiền thứ tự, trong tệp theo (line, column)', () => {
  const files = {
    main: 'include "b"\ninclude "c"\nz = 1\nz = 2',
    b: 'q = 1\nq = 2\ninclude "nope"',
    c: 'const k = 1\nconst k = 2',
  };
  assert.deepEqual(run(files), [
    { code: 'SEM_DUPLICATE_KEY', file: 'main', line: 4, column: 1 },
    { code: 'SEM_DUPLICATE_KEY', file: 'b', line: 2, column: 1 },
    { code: 'SEM_INCLUDE_NOT_FOUND', file: 'b', line: 3, column: 1 },
    { code: 'SEM_DUPLICATE_CONST', file: 'c', line: 2, column: 1 },
  ]);
});

test('sắp (line, column) trong tệp xen kẽ các loại lỗi', () => {
  assert.deepEqual(run({ main: 'include "x"\na = 1\na = 2\ninclude "y"' }).map((e) => e.line), [1, 3, 4]);
});

test('không ném với đầu vào lạ', () => {
  assert.ok(Array.isArray(check({ entry: 'x', files: {} })));
});

// ---- Pha B và C ----
function runS(files, schema, entry = 'main') {
  const p = parseProject(files, entry);
  assert.ok(p.ok, JSON.stringify(p.error));
  return check(p.program, schema).map(({ code, file, line, column }) => ({ code, file, line, column }));
}
const E = (code, file, line, column) => ({ code, file, line, column });

test('B: SEM_CONST_CONFIG_REF ưu tiên hơn UNDEFINED; Ref hằng trong const hợp lệ', () => {
  assert.deepEqual(run({ main: 'const a = "${zz}"\nconst b = "${@c}"\nconst c = 1' }), [
    E('SEM_CONST_CONFIG_REF', 'main', 1, 12),
  ]);
});

test('B: SEM_UNDEFINED_REF (cấu hình, hằng của tệp khác, xuyên chuỗi, chỉ số)', () => {
  assert.deepEqual(run({ main: 'a = "${zz}"' }), [E('SEM_UNDEFINED_REF', 'main', 1, 6)]);
  assert.deepEqual(run({ main: 'include "o"\nx = "${@c}"', o: 'const c = 1' }), [
    E('SEM_UNDEFINED_REF', 'main', 2, 6),
  ]);
  assert.deepEqual(run({ main: 's = "x"\nt = "${s.h}"' }), [E('SEM_UNDEFINED_REF', 'main', 2, 6)]);
  assert.deepEqual(run({ main: 'x = "${@c}"\nconst c = 1\nl = [1]\ny = "${l.0}${l.1}"' }), [
    E('SEM_UNDEFINED_REF', 'main', 4, 12),
  ]);
});

test('B: SEM_REF_CYCLE (tự thân, hai chiều, tổ tiên)', () => {
  assert.deepEqual(run({ main: 'a = "${a}"' }), [E('SEM_REF_CYCLE', 'main', 1, 6)]);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"' }), [
    E('SEM_REF_CYCLE', 'main', 1, 6),
    E('SEM_REF_CYCLE', 'main', 2, 6),
  ]);
  assert.deepEqual(run({ main: 'x {\n  y = "${x}"\n}' }), [E('SEM_REF_CYCLE', 'main', 2, 8)]);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = 1\nc = "${a}"' }), []);
});

test('B: SEM_BAD_INTERPOLATION', () => {
  assert.deepEqual(run({ main: 'l = [1]\ns = "v${l}"' }), [E('SEM_BAD_INTERPOLATION', 'main', 2, 7)]);
  assert.deepEqual(run({ main: 'o { a = 1 }\ns = "${o}${o}"' }), [
    E('SEM_BAD_INTERPOLATION', 'main', 2, 6),
    E('SEM_BAD_INTERPOLATION', 'main', 2, 10),
  ]);
  assert.deepEqual(run({ main: 'l = [1]\nm = "${l}"\ns = "v${m}"' }), [E('SEM_BAD_INTERPOLATION', 'main', 3, 7)]);
  assert.deepEqual(run({ main: 'l = [1]\nn = null\nm = "${l}"\ns = "v${n}${l.0}"' }), []);
});

test('B: chuỗi bị ghi đè, chuỗi trong mảng, const; thứ tự qua nhiều tệp', () => {
  assert.deepEqual(
    run({ main: 'a = "${n1}"\ninclude "o"\nx = ["${n3}"]\nx2 = 1', o: 'x = "${n2}"\nconst c = "${n4}"' }),
    [
      E('SEM_UNDEFINED_REF', 'main', 1, 6),
      E('SEM_UNDEFINED_REF', 'main', 3, 7),
      E('SEM_UNDEFINED_REF', 'o', 1, 6),
      E('SEM_CONST_CONFIG_REF', 'o', 2, 12),
    ]
  );
});

test('Dừng giữa các pha: A→B, B→C', () => {
  assert.deepEqual(run({ main: 'a = "${zz}"\na = 2' }), [E('SEM_DUPLICATE_KEY', 'main', 2, 1)]);
  const schema = { fields: { a: { type: 'number' } } };
  assert.deepEqual(runS({ main: 'a = "x"\nb = "${zz}"' }, schema), [E('SEM_UNDEFINED_REF', 'main', 2, 6)]);
  assert.deepEqual(runS({ main: 'a = "x"' }, schema), [E('SEM_TYPE_MISMATCH', 'main', 1, 5)]);
});

test('C: SEM_TYPE_MISMATCH (vị trí nút giá trị, integer, không kiểm sâu hơn)', () => {
  assert.deepEqual(runS({ main: 'port = "x"' }, { fields: { port: { type: 'number' } } }), [
    E('SEM_TYPE_MISMATCH', 'main', 1, 8),
  ]);
  assert.deepEqual(runS({ main: 'port = 1.5' }, { fields: { port: { type: 'integer' } } }), [
    E('SEM_TYPE_MISMATCH', 'main', 1, 8),
  ]);
  assert.deepEqual(runS({ main: 'port = 2.0' }, { fields: { port: { type: 'integer' } } }), []);
  assert.deepEqual(runS({ main: 'a = null' }, { fields: { a: { type: 'object' } } }), [
    E('SEM_TYPE_MISMATCH', 'main', 1, 5),
  ]);
  assert.deepEqual(
    runS({ main: 'a = 1' }, { fields: { a: { type: 'object', fields: { x: { required: true } } } } }),
    [E('SEM_TYPE_MISMATCH', 'main', 1, 5)]
  );
  assert.deepEqual(runS({ main: 'a = 1' }, { type: 'array' }), [E('SEM_TYPE_MISMATCH', 'main', 1, 1)]);
});

test('C: SEM_NOT_IN_ENUM', () => {
  const sc = { fields: { env: { enum: ['prod', 'dev'] } } };
  assert.deepEqual(runS({ main: 'env = "qa"' }, sc), [E('SEM_NOT_IN_ENUM', 'main', 1, 7)]);
  assert.deepEqual(runS({ main: 'env = "dev"' }, sc), []);
  assert.deepEqual(runS({ main: 'env = "${n}"\nn = "qa"' }, sc), [E('SEM_NOT_IN_ENUM', 'main', 1, 7)]);
});

test('C: SEM_MISSING_REQUIRED theo thứ tự fields, tại Block khởi tạo / gốc', () => {
  const srv = { type: 'object', fields: { p: { required: true }, h: { required: true }, o: {} } };
  assert.deepEqual(runS({ main: 'srv {\n a = 1\n}' }, { fields: { srv } }), [
    E('SEM_MISSING_REQUIRED', 'main', 1, 1),
    E('SEM_MISSING_REQUIRED', 'main', 1, 1),
  ]);
  assert.deepEqual(runS({ main: 'x = 1' }, { fields: { q: { required: true } } }), [
    E('SEM_MISSING_REQUIRED', 'main', 1, 1),
  ]);
  assert.deepEqual(
    runS({ main: 'include "o"\ns { y = 2 }', o: '\n s { x = 1 }' }, { fields: { s: { fields: { z: { required: true } } } } }),
    [E('SEM_MISSING_REQUIRED', 'o', 2, 2)]
  );
});

test('C: SEM_UNKNOWN_KEY tại câu lệnh thắng; required trước, rồi khóa', () => {
  const sc = { closed: true, fields: { a: {}, r: { required: true } } };
  assert.deepEqual(runS({ main: 'a = 1\nb = 2\nc {}' }, sc), [
    E('SEM_MISSING_REQUIRED', 'main', 1, 1),
    E('SEM_UNKNOWN_KEY', 'main', 2, 1),
    E('SEM_UNKNOWN_KEY', 'main', 3, 1),
  ]);
  assert.deepEqual(runS({ main: 'include "o"\n  b = 2', o: 'b = 1' }, { closed: true, fields: {} }), [
    E('SEM_UNKNOWN_KEY', 'main', 2, 3),
  ]);
  assert.deepEqual(runS({ main: 'b = 2' }, { closed: false }), []);
});

test('C: items theo chỉ số, vị trí phần tử', () => {
  assert.deepEqual(runS({ main: 'l = [1, "x", 3, "y"]' }, { fields: { l: { items: { type: 'number' } } } }), [
    E('SEM_TYPE_MISMATCH', 'main', 1, 9),
    E('SEM_TYPE_MISMATCH', 'main', 1, 17),
  ]);
  assert.deepEqual(runS({ main: 'l = [[1], ["a"]]' }, { fields: { l: { items: { items: { type: 'number' } } } } }), [
    E('SEM_TYPE_MISMATCH', 'main', 1, 12),
  ]);
});

test('C: giá trị đến từ chuỗi thuần tham chiếu → vị trí chuỗi, cho mọi thứ bên trong', () => {
  assert.deepEqual(runS({ main: 'a = 5\nb = "${a}"' }, { fields: { b: { type: 'string' } } }), [
    E('SEM_TYPE_MISMATCH', 'main', 2, 5),
  ]);
  assert.deepEqual(runS({ main: 'l = [1,2]\nm = "${l}"' }, { fields: { m: { items: { type: 'string' } } } }), [
    E('SEM_TYPE_MISMATCH', 'main', 2, 5),
    E('SEM_TYPE_MISMATCH', 'main', 2, 5),
  ]);
  assert.deepEqual(
    runS({ main: 'o {\n x = 1\n}\np = "${o}"' }, { fields: { p: { fields: { w: { required: true } } } } }),
    [E('SEM_MISSING_REQUIRED', 'main', 4, 5)]
  );
  assert.deepEqual(runS({ main: 'a = 5\nb = "n${a}"' }, { fields: { b: { type: 'number' } } }), [
    E('SEM_TYPE_MISMATCH', 'main', 2, 5),
  ]);
});

test('C: không ném với schema lạ', () => {
  assert.doesNotThrow(() => runS({ main: 'a = 1' }, { fields: { a: null }, items: 5, enum: 'x' }));
});
