import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.ok(p.ok, JSON.stringify(p.error));
  return check(p.program).map(({ code, file, line, column }) => ({ code, file, line, column }));
};
const E = (code, file, line, column) => ({ code, file, line, column });

test('hợp lệ → []', () => {
  assert.deepEqual(run({ main: 'const r = "x"\na = "${@r}"\ns { b = 1 }\nc = "${s.b}"' }), []);
});

test('SEM_DUPLICATE_KEY: lần 2, 3; Assign và Block cùng khóa; khối khác không trùng', () => {
  const src = 'a = 1\na = 2\na { }\ns { x = 1 }\nt { x = 1 }\ns { y = 1 }';
  assert.deepEqual(run({ main: src }), [
    E('SEM_DUPLICATE_KEY', 'main', 2, 1),
    E('SEM_DUPLICATE_KEY', 'main', 3, 1),
    E('SEM_DUPLICATE_KEY', 'main', 6, 1),
  ]);
});

test('Block cùng khóa qua include không bị coi là trùng', () => {
  assert.deepEqual(run({
    main: 'server { a = 1 }\ninclude "o"',
    o: 'server { b = 2 }\nx = 1',
  }), []);
  assert.deepEqual(run({ main: 'x = 1\ninclude "o"', o: 'x = 2' }), []);
});

test('SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(run({ main: 'const a = 1\nconst b = 2\nconst a = 3' }), [E('SEM_DUPLICATE_CONST', 'main', 3, 1)]);
});

test('SEM_INCLUDE_NOT_FOUND (cả trong khối)', () => {
  assert.deepEqual(run({ main: 'include "zz"\ns { include "yy" }' }), [
    E('SEM_INCLUDE_NOT_FOUND', 'main', 1, 1),
    E('SEM_INCLUDE_NOT_FOUND', 'main', 2, 5),
  ]);
});

test('SEM_INCLUDE_CYCLE: tự include và vòng main→b→main', () => {
  assert.deepEqual(run({ main: 'include "main"' }), [E('SEM_INCLUDE_CYCLE', 'main', 1, 1)]);
  assert.deepEqual(run({ main: 'include "b"', b: 'x = 1\ninclude "main"' }), [E('SEM_INCLUDE_CYCLE', 'b', 2, 1)]);
});

test('hình thoi không phải vòng, không thăm hai lần', () => {
  const files = { main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1\nk = 2' };
  assert.deepEqual(run(files), [E('SEM_DUPLICATE_KEY', 'd', 2, 1)]);
});

test('thứ tự lỗi pha A: theo tệp tiền thứ tự, trong tệp theo (line, column)', () => {
  const files = {
    main: 'include "b"\nq = 1\nq = 2\ninclude "c"\ninclude "nope"',
    b: 'z = 1\nz = 2\ninclude "d"',
    c: 'const k = 1\nconst k = 2',
    d: 'm = 1\nm = 2',
  };
  assert.deepEqual(run(files), [
    E('SEM_DUPLICATE_KEY', 'main', 3, 1),
    E('SEM_INCLUDE_NOT_FOUND', 'main', 5, 1),
    E('SEM_DUPLICATE_KEY', 'b', 2, 1),
    E('SEM_DUPLICATE_KEY', 'd', 2, 1),
    E('SEM_DUPLICATE_CONST', 'c', 2, 1),
  ]);
});

test('lỗi cùng tệp thuộc nhiều loại được sắp theo (line, column)', () => {
  assert.deepEqual(run({ main: 'const a = 1\ninclude "zz"\nconst a = 2\nk=1\nk=2' }), [
    E('SEM_INCLUDE_NOT_FOUND', 'main', 2, 1),
    E('SEM_DUPLICATE_CONST', 'main', 3, 1),
    E('SEM_DUPLICATE_KEY', 'main', 5, 1),
  ]);
});

test('dừng giữa các pha: pha A có lỗi thì không báo pha B', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\nb = "${zz}"' }), [E('SEM_DUPLICATE_KEY', 'main', 2, 1)]);
});

test('SEM_CONST_CONFIG_REF (một lỗi cho mỗi Ref)', () => {
  assert.deepEqual(run({ main: 'const c = "${zz}"\nconst d = "${@c}"' }), [E('SEM_CONST_CONFIG_REF', 'main', 1, 12)]);
});

test('SEM_UNDEFINED_REF: cấu hình, mảng, đi xuyên chuỗi, hằng khai báo muộn / tệp khác', () => {
  const files = {
    main: 'a = "${nope}"\nl = [1]\nb = "${l.1}"\nc = "${l.5}"\ns = "t"\nd = "${s.x}"\ne = "${@late}"\nconst late = 1\nf = "${@other}"\ninclude "o"',
    o: 'const other = 1',
  };
  assert.deepEqual(run(files), [
    E('SEM_UNDEFINED_REF', 'main', 1, 6),
    E('SEM_UNDEFINED_REF', 'main', 3, 6),
    E('SEM_UNDEFINED_REF', 'main', 4, 6),
    E('SEM_UNDEFINED_REF', 'main', 6, 6),
    E('SEM_UNDEFINED_REF', 'main', 9, 6),
  ]);
});

test('Ref tới null và tới khóa khai báo muộn là hợp lệ', () => {
  assert.deepEqual(run({ main: 'a = "${n}"\nb = "x${n}"\nn = null' }), []);
});

test('vòng 1: a = "${a}"', () => {
  assert.deepEqual(run({ main: 'a = "${a}"' }), [E('SEM_REF_CYCLE', 'main', 1, 6)]);
});

test('vòng 2: a ↔ b (cả hai Ref đều lỗi)', () => {
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"' }), [
    E('SEM_REF_CYCLE', 'main', 1, 6),
    E('SEM_REF_CYCLE', 'main', 2, 6),
  ]);
});

test('vòng 3: x { y = "${x}" } (tổ tiên chứa chính nó)', () => {
  assert.deepEqual(run({ main: 'x { y = "${x}" }' }), [E('SEM_REF_CYCLE', 'main', 1, 10)]);
});

test('vòng qua mảng và qua hằng; chuỗi không liên quan không phải vòng', () => {
  assert.deepEqual(run({ main: 'a = ["${b}"]\nb = "${a}"' }), [
    E('SEM_REF_CYCLE', 'main', 1, 7),
    E('SEM_REF_CYCLE', 'main', 2, 6),
  ]);
  assert.deepEqual(run({ main: 'const a = "${@b}"\nconst b = "${@a}"' }), [
    E('SEM_REF_CYCLE', 'main', 1, 12),
    E('SEM_REF_CYCLE', 'main', 2, 12),
  ]);
  assert.deepEqual(run({ main: 'a = 1\nb = "${a}"\nc = "${b}-${a}"' }), []);
});

test('SEM_BAD_INTERPOLATION: mảng/đối tượng trong chuỗi không thuần; chuỗi thuần thì được', () => {
  const files = { main: 'l = [1]\no { k = 1 }\na = "${l}"\nb = "x${l}"\nc = "${o}${o}"\nd = "${o.k}-"\ne = "${l.0}x"' };
  assert.deepEqual(run(files), [
    E('SEM_BAD_INTERPOLATION', 'main', 4, 7),
    E('SEM_BAD_INTERPOLATION', 'main', 5, 6),
    E('SEM_BAD_INTERPOLATION', 'main', 5, 10),
  ]);
});

test('SEM_BAD_INTERPOLATION: xác định kiểu đích qua chuỗi thuần tham chiếu', () => {
  assert.deepEqual(run({ main: 'l = [1]\np = "${l}"\nq = "${p}"\nr = "<${q}>"\ns = "t"\nu = "${s}"\nv = "<${u}>"' }), [
    E('SEM_BAD_INTERPOLATION', 'main', 4, 7),
  ]);
});

test('thứ tự kiểm: REF_CYCLE trước BAD_INTERPOLATION', () => {
  assert.deepEqual(run({ main: 'x = "a${x}"' }), [E('SEM_REF_CYCLE', 'main', 1, 7)]);
  assert.deepEqual(run({ main: 'x { y = "a${x}" }' }), [E('SEM_REF_CYCLE', 'main', 1, 11)]);
});

test('lỗi pha B xếp theo tệp (tiền thứ tự), trong tệp theo vị trí Ref', () => {
  const files = {
    main: 'include "b"\nm = "${no1}${no2}"',
    b: 'b = "${no3}"\ninclude "c"\nbb = "${no4}"',
    c: 'c = "${no5}"',
  };
  assert.deepEqual(run(files), [
    E('SEM_UNDEFINED_REF', 'main', 2, 6),
    E('SEM_UNDEFINED_REF', 'main', 2, 12),
    E('SEM_UNDEFINED_REF', 'b', 1, 6),
    E('SEM_UNDEFINED_REF', 'b', 3, 7),
    E('SEM_UNDEFINED_REF', 'c', 1, 6),
  ]);
});

test('lỗi trong chuỗi bị ghi đè vẫn được báo (file chứa chuỗi)', () => {
  assert.deepEqual(run({ main: 'include "o"\nv = 1', o: 'v = "${zz}"' }), [E('SEM_UNDEFINED_REF', 'o', 1, 6)]);
});

test('chuỗi trong mảng, trong const đều được xét', () => {
  assert.deepEqual(run({ main: 'const c = ["${@zz}"]\nl = [["${q}"]]' }), [
    E('SEM_UNDEFINED_REF', 'main', 1, 13),
    E('SEM_UNDEFINED_REF', 'main', 2, 8),
  ]);
});

test('vòng chỉ tính định nghĩa thắng: định nghĩa bị ghi đè không tạo vòng', () => {
  const main = 'include "o"\nx = 1\nz = "${x}"';
  assert.deepEqual(run({ main, o: 'x { y = "${z}" }' }), []);
});

test('không ném với chương trình thiếu entry', () => {
  assert.deepEqual(check({ entry: 'main', files: {} }), []);
});
