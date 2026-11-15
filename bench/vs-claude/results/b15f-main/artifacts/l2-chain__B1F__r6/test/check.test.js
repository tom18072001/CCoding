import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema).map((e) => `${e.code} ${e.file} ${e.line}:${e.column}`);
};

test('pha A: SEM_DUPLICATE_KEY (Assign + Block cùng khóa, lần 2 và 3)', () => {
  assert.deepEqual(run({ main: 'a = 1\na { }\na = 2' }), [
    'SEM_DUPLICATE_KEY main 2:1', 'SEM_DUPLICATE_KEY main 3:1']);
});
test('pha A: khóa giống ở khối/tệp khác không trùng', () => {
  assert.deepEqual(run({ main: 'a = 1\nb { a = 1 }\ninclude "x"', x: 'a = 2' }), []);
});
test('pha A: SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(run({ main: 'const c = 1\n  const c = 2' }), ['SEM_DUPLICATE_CONST main 2:3']);
});
test('pha A: SEM_INCLUDE_NOT_FOUND', () => {
  assert.deepEqual(run({ main: 'x {\n  include "no"\n}' }), ['SEM_INCLUDE_NOT_FOUND main 2:3']);
});
test('pha A: SEM_INCLUDE_CYCLE (tự include và vòng hai tệp)', () => {
  assert.deepEqual(run({ main: 'include "main"' }), ['SEM_INCLUDE_CYCLE main 1:1']);
  assert.deepEqual(run({ main: 'include "a"', a: '\ninclude "main"' }), ['SEM_INCLUDE_CYCLE a 2:1']);
});
test('pha A: hình thoi không phải vòng', () => {
  assert.deepEqual(run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1' }), []);
});
test('pha A: thứ tự lỗi theo tệp tiền thứ tự, trong tệp theo vị trí', () => {
  const files = {
    main: 'a = 1\ninclude "z"\ninclude "b"\na = 2',
    z: 'q = 1\nq = 2',
    b: 'include "nf"\nw = 1\nw = 2',
  };
  assert.deepEqual(run(files), [
    'SEM_DUPLICATE_KEY main 4:1',
    'SEM_DUPLICATE_KEY z 2:1',
    'SEM_INCLUDE_NOT_FOUND b 1:1',
    'SEM_DUPLICATE_KEY b 3:1',
  ]);
});
test('pha A chặn pha B', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\nb = "${zz}"' }), ['SEM_DUPLICATE_KEY main 2:1']);
});

test('pha B: SEM_CONST_CONFIG_REF ưu tiên trên UNDEFINED', () => {
  assert.deepEqual(run({ main: 'const c = "${nope}"' }), ['SEM_CONST_CONFIG_REF main 1:12']);
});
test('pha B: SEM_UNDEFINED_REF (cấu hình, hằng khác tệp, đi xuyên chuỗi, chỉ số)', () => {
  assert.deepEqual(run({ main: 'a = "${b}"' }), ['SEM_UNDEFINED_REF main 1:6']);
  assert.deepEqual(run({ main: 'include "x"\na = "${@c}"', x: 'const c = 1' }), ['SEM_UNDEFINED_REF main 2:6']);
  assert.deepEqual(run({ main: 'a = "s"\nb = "${a.x}"' }), ['SEM_UNDEFINED_REF main 2:6']);
  assert.deepEqual(run({ main: 'l = [1]\nb = "${l.1}"\nc = "${l.5}"' }), [
    'SEM_UNDEFINED_REF main 2:6', 'SEM_UNDEFINED_REF main 3:6']);
});
test('pha B: hằng khai báo sau chỗ dùng vẫn thấy', () => {
  assert.deepEqual(run({ main: 'a = "${@c}"\nconst c = 1' }), []);
});
test('pha B: SEM_REF_CYCLE a="${a}"', () => {
  assert.deepEqual(run({ main: 'a = "${a}"' }), ['SEM_REF_CYCLE main 1:6']);
});
test('pha B: vòng hai chiều, cả hai Ref đều lỗi', () => {
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"' }), [
    'SEM_REF_CYCLE main 1:6', 'SEM_REF_CYCLE main 2:6']);
});
test('pha B: tổ tiên chứa chính nó là vòng', () => {
  assert.deepEqual(run({ main: 'x {\n  y = "${x}"\n}' }), ['SEM_REF_CYCLE main 2:8']);
});
test('pha B: định nghĩa bị ghi đè không tạo vòng', () => {
  assert.deepEqual(run({ main: 'include "x"\nb = 1', x: 'a = "${b}"\nb = "${a}"' }), []);
});
test('pha B: chuỗi bị ghi đè vẫn được kiểm', () => {
  assert.deepEqual(run({ main: 'include "x"\na = 1', x: 'a = "${zz}"' }), ['SEM_UNDEFINED_REF x 1:6']);
});
test('pha B: SEM_BAD_INTERPOLATION (mảng, đối tượng); chuỗi thuần thì được', () => {
  assert.deepEqual(run({ main: 'l = [1]\no { k = 1 }\na = "${l}"\nb = "x${l}"\nc = "${o}${o}"' }), [
    'SEM_BAD_INTERPOLATION main 4:7', 'SEM_BAD_INTERPOLATION main 5:6', 'SEM_BAD_INTERPOLATION main 5:10']);
});
test('pha B: nội suy qua chuỗi thuần tham chiếu tới mảng; Ref trong mảng', () => {
  assert.deepEqual(run({ main: 'l = [1]\nm = "${l}"\nn = ["x${m}"]' }), ['SEM_BAD_INTERPOLATION main 3:8']);
});

const schema = {
  type: 'object', closed: true,
  fields: {
    name: { type: 'string', required: true },
    port: { type: 'integer' },
    ratio: { type: 'number' },
    mode: { enum: ['a', 'b'] },
    tags: { type: 'array', items: { type: 'string' } },
    srv: { type: 'object', fields: { host: { type: 'string', required: true } } },
  },
};
test('pha C: TYPE_MISMATCH tại vị trí giá trị; integer so với number', () => {
  assert.deepEqual(run({ main: 'name = "n"\nport = 1.5\nratio = 1.5' }, schema), ['SEM_TYPE_MISMATCH main 2:8']);
  assert.deepEqual(run({ main: 'name = "n"\nport = 2\nratio = 2' }, schema), []);
  assert.deepEqual(run({ main: 'name = 1' }, schema), ['SEM_TYPE_MISMATCH main 1:8']);
});
test('pha C: NOT_IN_ENUM', () => {
  assert.deepEqual(run({ main: 'name = "n"\nmode = "c"' }, schema), ['SEM_NOT_IN_ENUM main 2:8']);
});
test('pha C: MISSING_REQUIRED tại đối tượng; gốc là entry 1:1', () => {
  assert.deepEqual(run({ main: 'port = 1' }, schema), ['SEM_MISSING_REQUIRED main 1:1']);
  assert.deepEqual(run({ main: 'name = "n"\n\nsrv {\n}' }, schema), ['SEM_MISSING_REQUIRED main 3:1']);
});
test('pha C: UNKNOWN_KEY khi closed, tại token khóa; không closed thì bỏ qua', () => {
  assert.deepEqual(run({ main: 'name = "n"\n  zzz = 1' }, schema), ['SEM_UNKNOWN_KEY main 2:3']);
  assert.deepEqual(run({ main: 'name = "n"\nsrv { host = "h"  extra = 1 }' }, schema), []);
});
test('pha C: items theo chỉ số, vị trí phần tử', () => {
  assert.deepEqual(run({ main: 'name = "n"\ntags = ["a", 1, "b", null]' }, schema), [
    'SEM_TYPE_MISMATCH main 2:14', 'SEM_TYPE_MISMATCH main 2:22']);
});
test('pha C: TYPE_MISMATCH dừng kiểm sâu', () => {
  assert.deepEqual(run({ main: 'name = "n"\nsrv = [1]' }, schema), ['SEM_TYPE_MISMATCH main 2:7']);
  assert.deepEqual(run({ main: 'name = "n"\nsrv = null' }, schema), ['SEM_TYPE_MISMATCH main 2:7']);
});
test('pha C: chuỗi thuần tham chiếu dùng vị trí chuỗi', () => {
  const s = { type: 'object', fields: { port: { type: 'integer' } } };
  assert.deepEqual(run({ main: 'src = 1.5\nport = "${src}"' }, s), ['SEM_TYPE_MISMATCH main 2:8']);
});
test('pha C: đối tượng từ chuỗi thuần tham chiếu — MISSING_REQUIRED/UNKNOWN_KEY ở vị trí chuỗi', () => {
  const s = { type: 'object', fields: { srv: { type: 'object', closed: true, fields: { h: { required: true } } } } };
  assert.deepEqual(run({ main: 'o { k = 1 }\nsrv = "${o}"' }, s), [
    'SEM_MISSING_REQUIRED main 2:7', 'SEM_UNKNOWN_KEY main 2:7']);
});
test('pha C: MISSING_REQUIRED theo thứ tự fields, trước UNKNOWN_KEY', () => {
  const s = { fields: { b: { required: true }, a: { required: true } }, closed: true };
  assert.deepEqual(run({ main: 'z = 1\n' }, s), [
    'SEM_MISSING_REQUIRED main 1:1', 'SEM_MISSING_REQUIRED main 1:1', 'SEM_UNKNOWN_KEY main 1:1']);
});
test('pha B chặn pha C', () => {
  assert.deepEqual(run({ main: 'a = "${q}"' }, schema), ['SEM_UNDEFINED_REF main 1:6']);
});
