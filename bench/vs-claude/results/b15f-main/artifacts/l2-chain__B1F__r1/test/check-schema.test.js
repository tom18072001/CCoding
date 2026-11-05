import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function ck(files, schema) {
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program, schema).map(({ code, file, line, column }) => ({ code, file, line, column }));
}
const E = (code, file, line, column) => ({ code, file, line, column });

test('type: sai kiểu báo tại nút giá trị, không kiểm sâu hơn', () => {
  assert.deepEqual(ck({ main: 'a = "x"\n' }, { type: 'object', fields: { a: { type: 'number', enum: [1] } } }),
    [E('SEM_TYPE_MISMATCH', 'main', 1, 5)]);
});

test('type: integer/number/null/array/object/any', () => {
  const s = { fields: { i: { type: 'integer' }, n: { type: 'number' }, z: { type: 'null' }, l: { type: 'array' }, o: { type: 'object' }, x: { type: 'any' } } };
  assert.deepEqual(ck({ main: 'i = 1\nn = 1.5\nz = null\nl = []\no { }\nx = true\n' }, s), []);
  assert.deepEqual(ck({ main: 'i = 1.5\nn = null\nz = 0\nl { }\no = []\n' }, s).map((e) => e.line), [1, 2, 3, 4, 5]);
});

test('enum: giá trị ngoài danh sách', () => {
  assert.deepEqual(ck({ main: 'm = "x"\n' }, { fields: { m: { enum: ['a', 'b'] } } }), [E('SEM_NOT_IN_ENUM', 'main', 1, 5)]);
  assert.deepEqual(ck({ main: 'm = "a"\n' }, { fields: { m: { enum: ['a', 'b'] } } }), []);
});

test('required: theo thứ tự fields, tại vị trí đối tượng', () => {
  const s = { fields: { b: { required: true }, a: { required: true }, c: {} } };
  assert.deepEqual(ck({ main: 'c = 1\n' }, s), [E('SEM_MISSING_REQUIRED', 'main', 1, 1), E('SEM_MISSING_REQUIRED', 'main', 1, 1)]);
  assert.deepEqual(ck({ main: 'k = 1\nsub { }\n' }, { fields: { sub: { fields: { q: { required: true } } } } }),
    [E('SEM_MISSING_REQUIRED', 'main', 2, 1)]);
});

test('closed: SEM_UNKNOWN_KEY tại token khóa thắng', () => {
  assert.deepEqual(ck({ main: 'a = 1\nz = 2\nq { }\n' }, { closed: true, fields: { a: {} } }),
    [E('SEM_UNKNOWN_KEY', 'main', 2, 1), E('SEM_UNKNOWN_KEY', 'main', 3, 1)]);
  assert.deepEqual(ck({ main: 'z = 2\n' }, { fields: { a: {} } }), []);
});

test('items: từng phần tử tại vị trí phần tử', () => {
  assert.deepEqual(ck({ main: 'l = [1, "a", 2, "b"]\n' }, { fields: { l: { type: 'array', items: { type: 'number' } } } }),
    [E('SEM_TYPE_MISMATCH', 'main', 1, 9), E('SEM_TYPE_MISMATCH', 'main', 1, 17)]);
});

test('vị trí: đối tượng hợp nhất lấy Block khởi tạo; tệp include', () => {
  const files = { inc: 'srv { }\n', main: 'include "inc"\nsrv { a = 1 }\n' };
  assert.deepEqual(ck(files, { fields: { srv: { fields: { h: { required: true } } } } }), [E('SEM_MISSING_REQUIRED', 'inc', 1, 1)]);
});

test('vị trí: chuỗi thuần tham chiếu dùng vị trí chuỗi cho cả phần bên trong', () => {
  const files = { main: 'src { n = "x" }\ncp = "${src}"\nl = [1, "a"]\nc2 = "${l}"\n' };
  const s = { fields: { cp: { fields: { n: { type: 'number' } } }, c2: { items: { type: 'number' } } } };
  assert.deepEqual(ck(files, s), [E('SEM_TYPE_MISMATCH', 'main', 2, 6), E('SEM_TYPE_MISMATCH', 'main', 4, 6)]);
});

test('pha C không chạy khi pha B lỗi; không schema → []', () => {
  assert.deepEqual(ck({ main: 'a = "${b}"\n' }, { fields: { a: { type: 'number' } } }).map((e) => e.code), ['SEM_UNDEFINED_REF']);
  assert.deepEqual(ck({ main: 'a = 1\n' }), []);
});

test('thứ tự: thứ tự khóa cấu hình hợp nhất', () => {
  const r = ck({ main: 'b = "x"\na = "y"\n' }, { fields: { a: { type: 'number' }, b: { type: 'number' } } });
  assert.deepEqual(r.map((e) => e.line), [1, 2]);
});
