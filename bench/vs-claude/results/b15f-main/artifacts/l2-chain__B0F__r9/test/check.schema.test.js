import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function ck(files, schema, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
}

test('không có schema → không chạy pha C', () => {
  assert.deepEqual(ck({ main: 'a = 1' }, undefined), []);
});

test('SEM_TYPE_MISMATCH tại nút giá trị; integer vs number', () => {
  const schema = { fields: { a: { type: 'integer' }, b: { type: 'number' }, c: { type: 'integer' } } };
  assert.deepEqual(ck({ main: 'a = 1\nb = 1\nc = 1' }, schema), []);
  assert.deepEqual(ck({ main: 'a = 1.5\nb = 1.5\nc =   2' }, schema), [['SEM_TYPE_MISMATCH', 'main', 1, 5]]);
});

test('string, boolean, any', () => {
  const schema = { fields: { s: { type: 'string' }, t: { type: 'boolean' }, u: { type: 'any' } } };
  assert.deepEqual(ck({ main: 's = 1\nt = "x"\nu = 1' }, schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 5],
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
  ]);
});

test('phân biệt array, object, null', () => {
  const schema = { fields: { a: { type: 'array' }, o: { type: 'object' }, n: { type: 'null' } } };
  assert.deepEqual(ck({ main: 'a = [1]\no { }\nn = null' }, schema), []);
  assert.deepEqual(ck({ main: 'a = null\no = [1]\nn { }' }, schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 5],
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
    ['SEM_TYPE_MISMATCH', 'main', 3, 1],
  ]);
  assert.deepEqual(ck({ main: 'a { }\no = null\nn = 0' }, schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 1],
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
    ['SEM_TYPE_MISMATCH', 'main', 3, 5],
  ]);
});

test('type gốc sai', () => {
  assert.deepEqual(ck({ main: 'a = 1' }, { type: 'array' }), [['SEM_TYPE_MISMATCH', 'main', 1, 1]]);
});

test('SEM_NOT_IN_ENUM', () => {
  const schema = { fields: { m: { enum: ['a', 'b'] }, n: { type: 'integer', enum: [1, 2] } } };
  assert.deepEqual(ck({ main: 'm = "a"\nn = 2' }, schema), []);
  assert.deepEqual(ck({ main: 'm = "c"\nn = 3' }, schema), [
    ['SEM_NOT_IN_ENUM', 'main', 1, 5],
    ['SEM_NOT_IN_ENUM', 'main', 2, 5],
  ]);
});

test('type sai thì không có lỗi con', () => {
  const schema = { fields: { o: { type: 'array', fields: { x: { required: true } }, closed: true, items: { type: 'string' } } } };
  assert.deepEqual(ck({ main: 'o { y = 1 }' }, schema), [['SEM_TYPE_MISMATCH', 'main', 1, 1]]);
  const s2 = { fields: { l: { type: 'object', items: { type: 'string' } } } };
  assert.deepEqual(ck({ main: 'l = [1]' }, s2), [['SEM_TYPE_MISMATCH', 'main', 1, 5]]);
});

test('SEM_MISSING_REQUIRED tại vị trí đối tượng, theo thứ tự fields; gốc 1:1', () => {
  const schema = { fields: { top: { required: true }, o: { fields: { z: { required: true }, y: { required: true }, w: {} } } } };
  assert.deepEqual(ck({ main: '\n  o {\n x = 1 }' }, schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 2, 3],
    ['SEM_MISSING_REQUIRED', 'main', 2, 3],
  ]);
});

test('SEM_UNKNOWN_KEY tại token khóa, closed, theo thứ tự khóa', () => {
  const schema = { closed: true, fields: { a: {}, o: { closed: true, fields: { k: {} } } } };
  assert.deepEqual(ck({ main: 'b = 1\na = 1\no {\n  k = 1\n  q = 2\n}\nc {}' }, schema), [
    ['SEM_UNKNOWN_KEY', 'main', 1, 1],
    ['SEM_UNKNOWN_KEY', 'main', 5, 3],
    ['SEM_UNKNOWN_KEY', 'main', 7, 1],
  ]);
  assert.deepEqual(ck({ main: 'b = 1' }, { fields: { a: {} } }), []);
});

test('items: từng phần tử theo chỉ số, vị trí phần tử', () => {
  const schema = { fields: { l: { type: 'array', items: { type: 'integer' } } } };
  assert.deepEqual(ck({ main: 'l = [1, "x", 2, 3.5]' }, schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 9],
    ['SEM_TYPE_MISMATCH', 'main', 1, 17],
  ]);
});

test('chuỗi thuần tham chiếu: vị trí chuỗi, cho cả giá trị và phần bên trong', () => {
  const schema = {
    fields: {
      x: {}, src: {}, obj: {},
      r: { type: 'integer' },
      l: { type: 'array', items: { type: 'string' } },
      o: { type: 'object', closed: true, fields: { k: { type: 'string' } } },
    },
  };
  const src = 'x = "t"\nsrc = [1, 2]\nobj { k = 1 }\nr = "${x}"\nl = "${src}"\no = "${obj}"';
  assert.deepEqual(ck({ main: src }, schema), [
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
    ['SEM_TYPE_MISMATCH', 'main', 5, 5],
    ['SEM_TYPE_MISMATCH', 'main', 5, 5],
    ['SEM_TYPE_MISMATCH', 'main', 6, 5],
  ]);
});

test('chuỗi nội suy là string', () => {
  const schema = { fields: { s: { type: 'string' }, t: { enum: ['a1'] } } };
  assert.deepEqual(ck({ main: 'n = 1\ns = "v${n}"\nt = "a${n}"' }, schema), []);
});

test('đối tượng ghép từ nhiều tệp qua include: vị trí Block khởi tạo, khóa thắng', () => {
  const files = {
    main: 'o {\n  include "p"\n  b = 1\n}\nz = 1',
    p: 'a = 1\nc = 2\nsub { x = 1 }',
  };
  const schema = { fields: { o: { fields: { sub: { fields: { y: { required: true } } } } } } };
  assert.deepEqual(ck(files, schema), [['SEM_MISSING_REQUIRED', 'p', 3, 1]]);
  const s2 = { closed: true, fields: { o: { closed: true, fields: { a: {} } } } };
  assert.deepEqual(ck(files, s2), [
    ['SEM_UNKNOWN_KEY', 'p', 2, 1],
    ['SEM_UNKNOWN_KEY', 'p', 3, 1],
    ['SEM_UNKNOWN_KEY', 'main', 3, 3],
    ['SEM_UNKNOWN_KEY', 'main', 5, 1],
  ]);
  // đối tượng o tạo bởi Block ở main:1:1 → thiếu khóa báo tại đó
  const s3 = { fields: { o: { fields: { need: { required: true } } } } };
  assert.deepEqual(ck(files, s3), [['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
});

test('pha B có lỗi thì không chạy pha C', () => {
  const r = ck({ main: 'a = "${nope}"' }, { fields: { a: { type: 'integer' } } });
  assert.deepEqual(r, [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
});
