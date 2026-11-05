import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function ck(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program).map(({ code, file, line, column }) => ({ code, file, line, column }));
}
const E = (code, file, line, column) => ({ code, file, line, column });

test('hợp lệ → []', () => {
  assert.deepEqual(ck({ main: 'a = 1\nb { a = "${a}" }\n' }), []);
});

test('SEM_DUPLICATE_KEY: lần 2, 3; Assign+Block; khối khác/tệp khác không trùng', () => {
  assert.deepEqual(ck({ main: 'a = 1\na = 2\na { }\nb { a = 1 }\n' }),
    [E('SEM_DUPLICATE_KEY', 'main', 2, 1), E('SEM_DUPLICATE_KEY', 'main', 3, 1)]);
  assert.deepEqual(ck({ inc: 'a = 1\n', main: 'a = 2\ninclude "inc"\n' }), []);
});

test('SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(ck({ main: 'const c = 1\n  const c = 2\n' }), [E('SEM_DUPLICATE_CONST', 'main', 2, 3)]);
});

test('SEM_INCLUDE_NOT_FOUND', () => {
  assert.deepEqual(ck({ main: 'x {\n  include "nope"\n}\n' }), [E('SEM_INCLUDE_NOT_FOUND', 'main', 2, 3)]);
});

test('SEM_INCLUDE_CYCLE: tự include, vòng a↔b; hình thoi không phải vòng', () => {
  assert.deepEqual(ck({ main: 'include "main"\n' }), [E('SEM_INCLUDE_CYCLE', 'main', 1, 1)]);
  assert.deepEqual(ck({ main: 'include "a"\n', a: 'include "b"\n', b: '\ninclude "a"\n' }),
    [E('SEM_INCLUDE_CYCLE', 'b', 2, 1)]);
  assert.deepEqual(ck({
    main: 'include "b"\ninclude "c"\n', b: 'include "d"\n', c: 'include "d"\n', d: 'x = 1\n',
  }), []);
});

test('thứ tự lỗi: theo tệp (tiền thứ tự), trong tệp theo (line, column)', () => {
  const out = ck({
    main: 'include "b"\ninclude "c"\nz = 1\nz = 2\n',
    b: 'q = 1\nq = 2\ninclude "d"\nq = 3\n',
    c: 'k = 1\nk = 2\n',
    d: 'include "missing"\nm = 1\nm = 2\n',
  });
  assert.deepEqual(out, [
    E('SEM_DUPLICATE_KEY', 'main', 4, 1),
    E('SEM_DUPLICATE_KEY', 'b', 2, 1), E('SEM_DUPLICATE_KEY', 'b', 4, 1),
    E('SEM_INCLUDE_NOT_FOUND', 'd', 1, 1), E('SEM_DUPLICATE_KEY', 'd', 3, 1),
    E('SEM_DUPLICATE_KEY', 'c', 2, 1),
  ]);
});

test('pha A lỗi thì không chạy pha B', () => {
  assert.deepEqual(ck({ main: 'a = 1\na = "${nope}"\n' }), [E('SEM_DUPLICATE_KEY', 'main', 2, 1)]);
});

test('SEM_UNDEFINED_REF: cấu hình, hằng khai báo muộn ok, hằng tệp khác không thấy, qua chuỗi', () => {
  assert.deepEqual(ck({ main: 'a = "x${nope}"\n' }), [E('SEM_UNDEFINED_REF', 'main', 1, 7)]);
  assert.deepEqual(ck({ main: 'a = "${@c}"\nconst c = 1\n' }), []);
  assert.deepEqual(ck({ inc: 'const c = 1\n', main: 'include "inc"\na = "${@c}"\n' }),
    [E('SEM_UNDEFINED_REF', 'main', 2, 6)]);
  assert.deepEqual(ck({ main: 'a = "s"\nb = "${a.x}"\nl = [1]\nc = "${l.1}"\nd = "${l.5}"\n' }),
    [E('SEM_UNDEFINED_REF', 'main', 2, 6), E('SEM_UNDEFINED_REF', 'main', 4, 6), E('SEM_UNDEFINED_REF', 'main', 5, 6)]);
});

test('SEM_CONST_CONFIG_REF (ưu tiên hơn UNDEFINED); const tham chiếu hằng ok', () => {
  assert.deepEqual(ck({ main: 'const c = "${nope}"\nconst d = "${@c}"\n' }),
    [E('SEM_CONST_CONFIG_REF', 'main', 1, 12)]);
});

test('lỗi trong chuỗi bị ghi đè và trong mảng vẫn được báo', () => {
  assert.deepEqual(ck({ main: 'a = "${nope}"\na2 = 1\nl = ["${bad}"]\n' }),
    [E('SEM_UNDEFINED_REF', 'main', 1, 6), E('SEM_UNDEFINED_REF', 'main', 3, 7)]);
  assert.deepEqual(ck({ inc: 'a = "${nope}"\n', main: 'include "inc"\na = 1\n' }),
    [E('SEM_UNDEFINED_REF', 'inc', 1, 6)]);
});

test('SEM_REF_CYCLE: tự tham chiếu, vòng a↔b (cả hai), x { y = "${x}" }', () => {
  assert.deepEqual(ck({ main: 'a = "${a}"\n' }), [E('SEM_REF_CYCLE', 'main', 1, 6)]);
  assert.deepEqual(ck({ main: 'a = "${b}"\nb = "${a}"\n' }),
    [E('SEM_REF_CYCLE', 'main', 1, 6), E('SEM_REF_CYCLE', 'main', 2, 6)]);
  assert.deepEqual(ck({ main: 'x { y = "${x}" }\n' }), [E('SEM_REF_CYCLE', 'main', 1, 10)]);
});

test('tham chiếu xuyên chuỗi: a→b→c→a; chuỗi bị ghi đè không tạo cạnh thắng', () => {
  assert.deepEqual(ck({ main: 'a = "${b}"\nb = "${c}"\nc = "${a}"\n' }),
    [E('SEM_REF_CYCLE', 'main', 1, 6), E('SEM_REF_CYCLE', 'main', 2, 6), E('SEM_REF_CYCLE', 'main', 3, 6)]);
});

test('hai tham chiếu không vòng tới cùng đích (hình thoi) không lỗi', () => {
  assert.deepEqual(ck({ main: 'd = 1\nb = "${d}"\nc = "${d}"\na = "${b}${c}"\n' }), []);
});

test('SEM_BAD_INTERPOLATION: mảng/đối tượng trong chuỗi không thuần; thuần thì ok', () => {
  assert.deepEqual(ck({ main: 'l = [1]\no { k = 1 }\na = "${l}"\nb = "x${l}"\nc = "${o}${o}"\n' }), [
    E('SEM_BAD_INTERPOLATION', 'main', 4, 7), E('SEM_BAD_INTERPOLATION', 'main', 5, 6),
    E('SEM_BAD_INTERPOLATION', 'main', 5, 10),
  ]);
  assert.deepEqual(ck({ main: 'n = null\nb = "x${n}"\ns = "${n}"\n' }), []);
  assert.deepEqual(ck({ main: 'l = [1]\np = "${l}"\nq = "x${p}"\n' }), [E('SEM_BAD_INTERPOLATION', 'main', 3, 7)]);
});

test('không ném với program thiếu entry', () => {
  assert.deepEqual(check({ entry: 'x', files: {} }), []);
});
