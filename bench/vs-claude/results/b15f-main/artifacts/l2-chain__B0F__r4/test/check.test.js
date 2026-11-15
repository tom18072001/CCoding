import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

// Trả mảng "mã file line:column" để so sánh gọn.
function run(files, schema, entry = 'main') {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema).map((e) => `${e.code} ${e.file} ${e.line}:${e.column}`);
}

test('pha A: SEM_DUPLICATE_KEY từ lần thứ hai, Assign và Block cùng khóa', () => {
  assert.deepEqual(run({ main: 'a = 1\nb = 2\na = 3\na {}\na = 4' }), [
    'SEM_DUPLICATE_KEY main 3:1',
    'SEM_DUPLICATE_KEY main 4:1',
    'SEM_DUPLICATE_KEY main 5:1',
  ]);
});

test('pha A: khóa giống nhau ở khối khác hoặc tệp khác không phải trùng', () => {
  const files = { main: 'a = 1\nx { a = 1 }\ninclude "b"', b: 'a = 2\nx { a = 3 }' };
  assert.deepEqual(run(files), []);
});

test('pha A: trùng khóa trong khối lồng', () => {
  assert.deepEqual(run({ main: 'x {\n  k = 1\n  k = 2\n}' }), ['SEM_DUPLICATE_KEY main 3:3']);
});

test('pha A: SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(run({ main: 'const x = 1\nconst y = 1\nconst x = 2' }), [
    'SEM_DUPLICATE_CONST main 3:1',
  ]);
});

test('pha A: SEM_INCLUDE_NOT_FOUND, kể cả include trong khối', () => {
  assert.deepEqual(run({ main: 'a = 1\ninclude "nope"\nx {\n  include "nope2"\n}' }), [
    'SEM_INCLUDE_NOT_FOUND main 2:1',
    'SEM_INCLUDE_NOT_FOUND main 4:3',
  ]);
});

test('pha A: SEM_INCLUDE_CYCLE (gián tiếp và chính nó)', () => {
  assert.deepEqual(run({ main: 'include "b"', b: 'include "main"' }), [
    'SEM_INCLUDE_CYCLE b 1:1',
  ]);
  assert.deepEqual(run({ main: 'x = 1\ninclude "main"' }), ['SEM_INCLUDE_CYCLE main 2:1']);
});

test('pha A: hình thoi không phải vòng', () => {
  const files = {
    main: 'include "a"\ninclude "c"',
    a: 'include "d"',
    c: 'include "d"',
    d: 'x = 1',
  };
  assert.deepEqual(run(files), []);
});

test('pha A: lỗi gom theo tệp theo thứ tự thăm tiền thứ tự', () => {
  const files = {
    main: 'include "a"\nk = 1\nk = 2\ninclude "b"',
    a: 'z = 1\nz = 2',
    b: 'q = 1\nq = 2',
  };
  assert.deepEqual(run(files), [
    'SEM_DUPLICATE_KEY main 3:1',
    'SEM_DUPLICATE_KEY a 2:1',
    'SEM_DUPLICATE_KEY b 2:1',
  ]);
});

test('pha A: trong một tệp sắp theo (line, column)', () => {
  assert.deepEqual(run({ main: 'k = 1\ninclude "zz"\nk = 2\nx { j = 1 j = 2 }' }), [
    'SEM_INCLUDE_NOT_FOUND main 2:1',
    'SEM_DUPLICATE_KEY main 3:1',
    'SEM_DUPLICATE_KEY main 4:11',
  ]);
});

test('pha A có lỗi thì không chạy pha B', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\nb = "${zz}"' }), ['SEM_DUPLICATE_KEY main 2:1']);
});

test('pha B: SEM_UNDEFINED_REF, vị trí tại $', () => {
  assert.deepEqual(run({ main: 'a = "x${b}"' }), ['SEM_UNDEFINED_REF main 1:7']);
  assert.deepEqual(run({ main: 'lst = [1, 2]\nx = "${lst.1}"\ny = "${lst.2}"' }), [
    'SEM_UNDEFINED_REF main 3:6',
  ]);
});

test('pha B: đường dẫn không đi xuyên qua chuỗi', () => {
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "s"\nc = "${a.x}"' }), [
    'SEM_UNDEFINED_REF main 3:6',
  ]);
});

test('pha B: tham chiếu tới null là tồn tại', () => {
  assert.deepEqual(run({ main: 'a = null\nb = "${a}"\nc = "x${a}"' }), []);
});

test('pha B: hằng khai báo sau chỗ dùng vẫn thấy', () => {
  assert.deepEqual(run({ main: 'x = "${@c}"\nconst c = 5' }), []);
});

test('pha B: hằng của tệp khác không thấy', () => {
  const files = { main: 'include "b"\nx = "${@k}"', b: 'const k = 1\ny = "${@k}"' };
  assert.deepEqual(run(files), ['SEM_UNDEFINED_REF main 2:6']);
});

test('pha B: const tham chiếu hằng được, tham chiếu cấu hình là lỗi', () => {
  assert.deepEqual(run({ main: 'const c = 1\nconst d = "${@c}"\nx = "${@d}"' }), []);
  assert.deepEqual(run({ main: 'a = 1\nconst c = "${a}"' }), ['SEM_CONST_CONFIG_REF main 2:12']);
  // thứ tự ưu tiên: CONST_CONFIG_REF trước UNDEFINED_REF
  assert.deepEqual(run({ main: 'const c = "${nope}"' }), ['SEM_CONST_CONFIG_REF main 1:12']);
});

test('pha B: chuỗi trong mảng của const cũng được xét', () => {
  assert.deepEqual(run({ main: 'const c = ["${@zz}"]' }), ['SEM_UNDEFINED_REF main 1:13']);
});

test('pha B: a = "${a}" là vòng', () => {
  assert.deepEqual(run({ main: 'a = "${a}"' }), ['SEM_REF_CYCLE main 1:6']);
});

test('pha B: cặp a/b cùng lỗi', () => {
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"' }), [
    'SEM_REF_CYCLE main 1:6',
    'SEM_REF_CYCLE main 2:6',
  ]);
});

test('pha B: x { y = "${x}" } là vòng', () => {
  assert.deepEqual(run({ main: 'x {\n  y = "${x}"\n}' }), ['SEM_REF_CYCLE main 2:8']);
});

test('pha B: vòng qua mảng', () => {
  assert.deepEqual(run({ main: 'a = ["${b}"]\nb = "${a}"' }), [
    'SEM_REF_CYCLE main 1:7',
    'SEM_REF_CYCLE main 2:6',
  ]);
});

test('pha B: chuỗi dùng chung không phải vòng', () => {
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "x"\nc = "${b}"\nd = "${a}${c}"' }), []);
});

test('pha B: chuỗi bị ghi đè không tính vào đồ thị nhưng vẫn bị xét', () => {
  const ok = { main: 'include "base"\na = 1', base: 'a = "${a}"' };
  assert.deepEqual(run(ok), []);
  const bad = { main: 'include "base"\na = 1', base: 'a = "x${arr}"\narr = [1]' };
  assert.deepEqual(run(bad), ['SEM_BAD_INTERPOLATION base 1:7']);
});

test('pha B: SEM_BAD_INTERPOLATION', () => {
  assert.deepEqual(run({ main: 'arr = [1]\ns = "v=${arr}"' }), ['SEM_BAD_INTERPOLATION main 2:8']);
  assert.deepEqual(run({ main: 'o { x = 1 }\ns = "${o}!"' }), ['SEM_BAD_INTERPOLATION main 2:6']);
  assert.deepEqual(run({ main: 'arr = [1]\nn = 1\ns = "${n}${arr}"' }), [
    'SEM_BAD_INTERPOLATION main 3:10',
  ]);
  // đích là chuỗi thuần tham chiếu tới mảng
  assert.deepEqual(run({ main: 'arr = [1]\nb = "${arr}"\ns="x${b}"' }), [
    'SEM_BAD_INTERPOLATION main 3:5',
  ]);
  // thuần tham chiếu thì được
  assert.deepEqual(run({ main: 'arr = [1]\ns = "${arr}"' }), []);
});

test('pha B: lỗi theo tệp rồi theo vị trí', () => {
  const files = { main: 'include "b"\nx = "${m}"', b: 'y = "${n}"\nz = "${o}"' };
  assert.deepEqual(run(files), [
    'SEM_UNDEFINED_REF main 2:6',
    'SEM_UNDEFINED_REF b 1:6',
    'SEM_UNDEFINED_REF b 2:6',
  ]);
});

const obj = (fields, extra = {}) => ({ type: 'object', fields, ...extra });

test('pha C: không có schema thì bỏ qua; pha B lỗi thì không chạy C', () => {
  assert.deepEqual(run({ main: 'a = 1' }), []);
  assert.deepEqual(run({ main: 'a = "${zz}"' }, obj({ a: { type: 'number' } })), [
    'SEM_UNDEFINED_REF main 1:6',
  ]);
});

test('pha C: SEM_TYPE_MISMATCH tại nút giá trị, number nhận số nguyên', () => {
  const s = obj({ port: { type: 'number' } });
  assert.deepEqual(run({ main: 'port = "80"' }, s), ['SEM_TYPE_MISMATCH main 1:8']);
  assert.deepEqual(run({ main: 'port = 80' }, s), []);
  assert.deepEqual(run({ main: 'n = 1.5' }, obj({ n: { type: 'integer' } })), [
    'SEM_TYPE_MISMATCH main 1:5',
  ]);
  assert.deepEqual(run({ main: 'n = 2' }, obj({ n: { type: 'integer' } })), []);
});

test('pha C: null, array, object không nhận nhau', () => {
  assert.deepEqual(run({ main: 'n = null' }, obj({ n: { type: 'null' } })), []);
  assert.deepEqual(run({ main: 'n = null' }, obj({ n: { type: 'object' } })), [
    'SEM_TYPE_MISMATCH main 1:5',
  ]);
  assert.deepEqual(run({ main: 'n = [1]' }, obj({ n: { type: 'object' } })), [
    'SEM_TYPE_MISMATCH main 1:5',
  ]);
  assert.deepEqual(run({ main: 'n {}' }, obj({ n: { type: 'array' } })), [
    'SEM_TYPE_MISMATCH main 1:1',
  ]);
  assert.deepEqual(run({ main: 'n = [1]' }, obj({ n: { type: 'any' } })), []);
});

test('pha C: kiểu sai thì không kiểm sâu hơn', () => {
  const s = obj({ a: { type: 'array', fields: { x: { required: true } } } });
  assert.deepEqual(run({ main: '\na { y = 1 }' }, s), ['SEM_TYPE_MISMATCH main 2:1']);
});

test('pha C: gốc sai kiểu báo tại entry 1:1', () => {
  assert.deepEqual(run({ main: 'a = 1' }, { type: 'array' }), ['SEM_TYPE_MISMATCH main 1:1']);
});

test('pha C: SEM_NOT_IN_ENUM', () => {
  const s = obj({ mode: { type: 'string', enum: ['dev', 'prod'] } });
  assert.deepEqual(run({ main: 'mode = "x"' }, s), ['SEM_NOT_IN_ENUM main 1:8']);
  assert.deepEqual(run({ main: 'mode = "dev"' }, s), []);
  assert.deepEqual(run({ main: 'mode = null' }, obj({ mode: { enum: ['a'] } })), [
    'SEM_NOT_IN_ENUM main 1:8',
  ]);
});

test('pha C: SEM_MISSING_REQUIRED theo thứ tự fields, tại vị trí đối tượng', () => {
  const s = obj({ b: { required: true }, a: { required: true }, c: {} });
  assert.deepEqual(run({ main: 'c = 1' }, s), [
    'SEM_MISSING_REQUIRED main 1:1',
    'SEM_MISSING_REQUIRED main 1:1',
  ]);
  const nested = obj({ srv: obj({ port: { required: true } }) });
  assert.deepEqual(run({ main: '\nsrv {\n  x = 1\n}' }, nested), ['SEM_MISSING_REQUIRED main 2:1']);
});

test('pha C: vị trí đối tượng là Block khởi tạo (từ tệp include)', () => {
  const files = { main: 'include "base"\nsrv { y = 2 }', base: 'srv { x = 1 }' };
  const s = obj({ srv: obj({ port: { required: true } }) });
  assert.deepEqual(run(files, s), ['SEM_MISSING_REQUIRED base 1:1']);
});

test('pha C: SEM_UNKNOWN_KEY tại token khóa, chỉ khi closed', () => {
  const closed = obj({ a: {} }, { closed: true });
  assert.deepEqual(run({ main: 'a = 1\nb = 2\n  c {}' }, closed), [
    'SEM_UNKNOWN_KEY main 2:1',
    'SEM_UNKNOWN_KEY main 3:3',
  ]);
  assert.deepEqual(run({ main: 'a = 1\nb = 2' }, obj({ a: {} })), []);
});

test('pha C: items áp cho từng phần tử', () => {
  const s = obj({ tags: { type: 'array', items: { type: 'string' } } });
  assert.deepEqual(run({ main: 'tags = ["a", 1, 2]' }, s), [
    'SEM_TYPE_MISMATCH main 1:14',
    'SEM_TYPE_MISMATCH main 1:17',
  ]);
});

test('pha C: giá trị đến từ chuỗi thuần tham chiếu báo tại chuỗi đó', () => {
  const s = obj({
    o: obj({ k: { type: 'string' } }),
    p: { type: 'number' },
    s: obj({}),
  });
  const files = { main: 'o = "${s}"\np = "${q}"\nq = "x"\ns { k = 1 }' };
  assert.deepEqual(run(files, s), ['SEM_TYPE_MISMATCH main 1:5', 'SEM_TYPE_MISMATCH main 2:5']);
});

test('pha C: thứ tự kiểm theo thứ tự khóa hợp nhất', () => {
  const s = obj({ a: { type: 'string' }, b: { type: 'string' } }, { closed: true });
  // khóa b được đặt lần đầu trong base nên đứng trước a
  const files = { main: 'include "base"\na = 1\nz = 1', base: 'b = 1' };
  assert.deepEqual(run(files, s), [
    'SEM_TYPE_MISMATCH base 1:5',
    'SEM_TYPE_MISMATCH main 2:5',
    'SEM_UNKNOWN_KEY main 3:1',
  ]);
});
