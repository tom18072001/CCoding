import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema).map((e) => `${e.code}@${e.file}:${e.line}:${e.column}`);
};

test('không có schema → không chạy pha C', () => {
  assert.deepEqual(run({ main: 'a = 1' }), []);
});

test('TYPE_MISMATCH: vị trí nút giá trị; integer vs number; null/array/object', () => {
  const s = (type) => ({ type: 'object', fields: { a: { type } } });
  assert.deepEqual(run({ main: 'a = "x"' }, s('number')), ['SEM_TYPE_MISMATCH@main:1:5']);
  assert.deepEqual(run({ main: 'a = 1.5' }, s('integer')), ['SEM_TYPE_MISMATCH@main:1:5']);
  assert.deepEqual(run({ main: 'a = 2' }, s('integer')), []);
  assert.deepEqual(run({ main: 'a = 2' }, s('number')), []);
  assert.deepEqual(run({ main: 'a = null' }, s('object')), ['SEM_TYPE_MISMATCH@main:1:5']);
  assert.deepEqual(run({ main: 'a = null' }, s('null')), []);
  assert.deepEqual(run({ main: 'a = []' }, s('object')), ['SEM_TYPE_MISMATCH@main:1:5']);
  assert.deepEqual(run({ main: 'a { }' }, s('array')), ['SEM_TYPE_MISMATCH@main:1:1']);
  assert.deepEqual(run({ main: 'a = null' }, s('any')), []);
  assert.deepEqual(run({ main: 'a = true' }, s('boolean')), []);
});

test('TYPE_MISMATCH ở gốc → 1:1 của entry, không kiểm sâu hơn', () => {
  assert.deepEqual(run({ main: 'a = 1' }, { type: 'array', fields: { b: { required: true } } }),
    ['SEM_TYPE_MISMATCH@main:1:1']);
});

test('NOT_IN_ENUM và không kiểm sâu hơn', () => {
  assert.deepEqual(run({ main: 'a = "z"' }, { fields: { a: { enum: ['x', 'y'] } } }), ['SEM_NOT_IN_ENUM@main:1:5']);
  assert.deepEqual(run({ main: 'a = "x"' }, { fields: { a: { enum: ['x', 'y'] } } }), []);
  // type sai thì không báo enum
  assert.deepEqual(run({ main: 'a = 1' }, { fields: { a: { type: 'string', enum: ['x'] } } }), ['SEM_TYPE_MISMATCH@main:1:5']);
});

test('MISSING_REQUIRED: theo thứ tự fields, tại vị trí đối tượng; rồi UNKNOWN_KEY theo khóa', () => {
  const schema = {
    closed: true,
    fields: {
      z: { required: true }, y: { required: true }, srv: { fields: { host: { required: true } }, closed: true },
    },
  };
  const src = 'q = 1\n\nsrv {\n  port = 1\n}\n';
  assert.deepEqual(run({ main: src }, schema), [
    'SEM_MISSING_REQUIRED@main:1:1', 'SEM_MISSING_REQUIRED@main:1:1',
    'SEM_UNKNOWN_KEY@main:1:1',
    'SEM_MISSING_REQUIRED@main:3:1', 'SEM_UNKNOWN_KEY@main:4:3',
  ]);
});

test('UNKNOWN_KEY dùng token khóa thắng (ghi đè từ include)', () => {
  const schema = { fields: { x: { closed: true, fields: {} } } };
  assert.deepEqual(run({ main: 'include "o"\nx { bad = 2 }', o: 'x { bad = 1 }' }, schema), ['SEM_UNKNOWN_KEY@main:2:5']);
});

test('đối tượng: vị trí của Block đã khởi tạo sau khi bị thay bằng giá trị khác', () => {
  const schema = { fields: { s: { fields: { n: { required: true } } } } };
  assert.deepEqual(run({ main: 'include "o"\ns {\n  m = 1\n}', o: 's = 1' }, schema), ['SEM_MISSING_REQUIRED@main:2:1']);
});

test('đối tượng trộn: vị trí là Block đầu tiên', () => {
  const schema = { fields: { s: { fields: { n: { required: true } } } } };
  assert.deepEqual(run({ main: 'include "o"\ns { k = 1 }', o: '\n s { m = 1 }' }, schema), ['SEM_MISSING_REQUIRED@o:2:2']);
});

test('items: từng phần tử theo chỉ số; mảng lồng', () => {
  const schema = { fields: { l: { type: 'array', items: { type: 'integer' } } } };
  assert.deepEqual(run({ main: 'l = [1, "a", 2, 2.5]' }, schema), ['SEM_TYPE_MISMATCH@main:1:9', 'SEM_TYPE_MISMATCH@main:1:17']);
  const nested = { fields: { l: { items: { items: { type: 'string' } } } } };
  assert.deepEqual(run({ main: 'l = [["a"], [1]]' }, nested), ['SEM_TYPE_MISMATCH@main:1:14']);
});

test('chuỗi thuần tham chiếu: vị trí chuỗi, cho cả thứ bên trong', () => {
  const schema = { fields: { b: { type: 'string' }, c: { items: { type: 'string' } }, d: { closed: true, fields: {} } } };
  assert.deepEqual(run({ main: 'a = 1\nb = "${a}"' }, schema), ['SEM_TYPE_MISMATCH@main:2:5']);
  assert.deepEqual(run({ main: 'a = [1]\nc = "${a}"' }, schema), ['SEM_TYPE_MISMATCH@main:2:5']);
  assert.deepEqual(run({ main: 'a { x = 1 }\nd = "${a}"' }, schema), ['SEM_UNKNOWN_KEY@main:2:5']);
});

test('chuỗi nối: kiểu string; hằng được đánh giá', () => {
  const schema = { fields: { n: { type: 'string' }, m: { type: 'number' } } };
  assert.deepEqual(run({ main: 'const c = 5\na = 1\nn = "v${a}"\nm = "${@c}"' }, schema), []);
  assert.deepEqual(run({ main: 'const c = 5\nm = "x${@c}"' }, schema), ['SEM_TYPE_MISMATCH@main:2:5']);
});

test('include: file của lỗi là tệp chứa giá trị', () => {
  const schema = { fields: { a: { type: 'string' } } };
  assert.deepEqual(run({ main: 'include "o"', o: '\n a = 1' }, schema), ['SEM_TYPE_MISMATCH@o:2:6']);
});

test('pha B lỗi thì không chạy pha C', () => {
  assert.deepEqual(run({ main: 'a = "${zz}"' }, { fields: { a: { type: 'number' } } }), ['SEM_UNDEFINED_REF@main:1:6']);
});

test('khóa lạ như __proto__ không làm hỏng', () => {
  assert.deepEqual(run({ main: '__proto__ = 1' }, { closed: true, fields: {} }), ['SEM_UNKNOWN_KEY@main:1:1']);
});
