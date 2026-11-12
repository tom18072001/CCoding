import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program).map((e) => `${e.code}@${e.file}:${e.line}:${e.column}`);
};

test('hợp lệ → []', () => {
  assert.deepEqual(run({ main: 'const c = "x"\na = "${@c}"\nb { d = "${a}" }' }), []);
});

test('SEM_DUPLICATE_KEY: lần thứ hai, thứ ba; Assign và Block cùng khóa', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\na = 3' }), [
    'SEM_DUPLICATE_KEY@main:2:1', 'SEM_DUPLICATE_KEY@main:3:1']);
  assert.deepEqual(run({ main: 'a = 1\na { b = 1 }' }), ['SEM_DUPLICATE_KEY@main:2:1']);
  assert.deepEqual(run({ main: 'a { x = 1 }\nb { x = 1 }' }), []);
});

test('SEM_DUPLICATE_KEY: include vào cùng khối không phải trùng', () => {
  assert.deepEqual(run({ main: 'a = 1\ninclude "o"', o: 'a = 2' }), []);
});

test('SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(run({ main: 'const c = 1\nconst c = 2' }), ['SEM_DUPLICATE_CONST@main:2:1']);
});

test('SEM_INCLUDE_NOT_FOUND', () => {
  assert.deepEqual(run({ main: 'x {\n  include "no"\n}' }), ['SEM_INCLUDE_NOT_FOUND@main:2:3']);
});

test('SEM_INCLUDE_CYCLE: vòng và tự include; hình thoi không phải vòng', () => {
  assert.deepEqual(run({ main: 'include "b"', b: 'include "main"' }), ['SEM_INCLUDE_CYCLE@b:1:1']);
  assert.deepEqual(run({ main: 'include "main"' }), ['SEM_INCLUDE_CYCLE@main:1:1']);
  assert.deepEqual(run({
    main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1',
  }), []);
});

test('thứ tự lỗi pha A qua nhiều tệp: tiền thứ tự, trong tệp theo vị trí', () => {
  const files = {
    main: 'a = 1\ninclude "b"\ninclude "c"\na = 2\nconst k = 1\nconst k = 2',
    b: 'z = 1\nz = 2\ninclude "d"',
    c: 'q = 1\nq = 2',
    d: 'w = 1\nw = 2',
  };
  assert.deepEqual(run(files), [
    'SEM_DUPLICATE_KEY@main:4:1', 'SEM_DUPLICATE_CONST@main:6:1',
    'SEM_DUPLICATE_KEY@b:2:1',
    'SEM_DUPLICATE_KEY@d:2:1',
    'SEM_DUPLICATE_KEY@c:2:1',
  ]);
});

test('pha A lỗi thì không báo pha B', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\nb = "${nope}"' }), ['SEM_DUPLICATE_KEY@main:2:1']);
});

test('SEM_CONST_CONFIG_REF (ưu tiên trước UNDEFINED)', () => {
  assert.deepEqual(run({ main: 'const c = "${zzz}"\nconst d = ["${@c}", "${a}"]\na = 1' }), [
    'SEM_CONST_CONFIG_REF@main:1:12', 'SEM_CONST_CONFIG_REF@main:2:22']);
});

test('SEM_UNDEFINED_REF: cấu hình, hằng khác tệp, qua chuỗi, chỉ số mảng', () => {
  assert.deepEqual(run({
    main: 'include "o"\na = "${b}"\ns = "t"\nc = "${s.x}"\nl = [1]\nd = "${l.1}"\ne = "${l.0}"\nf = "${@k}"',
    o: 'const k = 1',
  }), [
    'SEM_UNDEFINED_REF@main:2:6', 'SEM_UNDEFINED_REF@main:4:6',
    'SEM_UNDEFINED_REF@main:6:6', 'SEM_UNDEFINED_REF@main:8:6']);
});

test('Ref hằng có thể khai báo muộn và đi qua mảng', () => {
  assert.deepEqual(run({ main: 'a = "${@l.1}"\nconst l = [1, 2]' }), []);
});

test('SEM_UNDEFINED_REF xét cả chuỗi bị ghi đè', () => {
  assert.deepEqual(run({ main: 'include "o"\na = 1', o: 'a = "${nope}"' }), ['SEM_UNDEFINED_REF@o:1:6']);
});

test('SEM_REF_CYCLE: tự tham chiếu, a↔b cả hai lỗi, tổ tiên', () => {
  assert.deepEqual(run({ main: 'a = "${a}"' }), ['SEM_REF_CYCLE@main:1:6']);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"' }), [
    'SEM_REF_CYCLE@main:1:6', 'SEM_REF_CYCLE@main:2:6']);
  assert.deepEqual(run({ main: 'x { y = "${x}" }' }), ['SEM_REF_CYCLE@main:1:10']);
});

test('SEM_REF_CYCLE: chỉ định nghĩa thắng; ref tới chuỗi không vòng thì sạch', () => {
  assert.deepEqual(run({ main: 'include "o"\na = 1\nb = "${a}"', o: 'a = "${b}"' }), []);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "x"\nc = "${a}"' }), []);
});

test('SEM_REF_CYCLE qua mảng và hằng', () => {
  assert.deepEqual(run({ main: 'a = ["${b}"]\nb = "${a}"' }), [
    'SEM_REF_CYCLE@main:1:7', 'SEM_REF_CYCLE@main:2:6']);
  assert.deepEqual(run({ main: 'const c = "${@c}"' }), ['SEM_REF_CYCLE@main:1:12']);
});

test('SEM_BAD_INTERPOLATION: mảng/đối tượng trong chuỗi không thuần; thuần thì được', () => {
  assert.deepEqual(run({ main: 'l = [1]\no { k = 1 }\na = "x${l}"\nb = "${o}${l}"\nc = "${l}"\nd = "n${o.k}"' }), [
    'SEM_BAD_INTERPOLATION@main:3:7', 'SEM_BAD_INTERPOLATION@main:4:6',
    'SEM_BAD_INTERPOLATION@main:4:10']);
});

test('SEM_BAD_INTERPOLATION: đích là chuỗi thuần tham chiếu tới mảng', () => {
  assert.deepEqual(run({ main: 'l = [1]\np = "${l}"\na = "x${p}"' }), ['SEM_BAD_INTERPOLATION@main:3:7']);
});

test('mỗi Ref tối đa một lỗi; lỗi pha B xếp theo tệp rồi vị trí', () => {
  assert.deepEqual(run({
    main: 'include "b"\nn = "${u2}"\nm = "${u1}"',
    b: 'k = "${u3}"',
  }), ['SEM_UNDEFINED_REF@main:2:6', 'SEM_UNDEFINED_REF@main:3:6', 'SEM_UNDEFINED_REF@b:1:6']);
});

test('không ném với entry thiếu', () => {
  assert.deepEqual(check({ entry: 'x', files: {} }), []);
});
