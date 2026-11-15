import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema);
};
const S = (src, schema) => run({ main: src }, schema);
const pos = (e) => [e.code, e.file, e.line, e.column];

test('pha C: hợp lệ và không có schema', () => {
  assert.deepEqual(S('a = 1', { type: 'object', fields: { a: { type: 'integer' } } }), []);
  assert.deepEqual(S('a = "x"', undefined), []);
});

test('SEM_TYPE_MISMATCH: vị trí nút giá trị của Assign, integer khác number', () => {
  const e = S('a = 1.5\nb = 2', { type: 'object', fields: { a: { type: 'integer' }, b: { type: 'integer' } } });
  assert.deepEqual(e.map(pos), [['SEM_TYPE_MISMATCH', 'main', 1, 5]]);
  assert.deepEqual(S('a = 1.5', { fields: { a: { type: 'number' } } }), []);
  assert.deepEqual(S('a = null', { fields: { a: { type: 'object' } } }).map((x) => x.code), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(S('a = []', { fields: { a: { type: 'object' } } }).map((x) => x.code), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(S('a = null', { fields: { a: { type: 'null' } } }), []);
});

test('SEM_NOT_IN_ENUM: vị trí giá trị, không kiểm sâu hơn', () => {
  const e = S('m = "x"\nn = 3', { fields: { m: { enum: ['a', 'b'] }, n: { type: 'string', enum: ['q'] } } });
  assert.deepEqual(e.map(pos), [['SEM_NOT_IN_ENUM', 'main', 1, 5], ['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
});

test('thứ tự type → enum: type sai thì không báo enum', () => {
  const e = S('n = 3', { fields: { n: { type: 'string', enum: ['q'] } } });
  assert.deepEqual(e.map((x) => x.code), ['SEM_TYPE_MISMATCH']);
});

test('SEM_MISSING_REQUIRED tại Block khởi tạo, rồi UNKNOWN_KEY tại khóa', () => {
  const src = 'x = 1\ns {\n  z = 1\n}\n';
  const schema = { fields: { s: { type: 'object', closed: true, fields: { p: { required: true }, q: { required: true }, r: {} } } } };
  const e = S(src, schema);
  assert.deepEqual(e.map(pos), [
    ['SEM_MISSING_REQUIRED', 'main', 2, 1],
    ['SEM_MISSING_REQUIRED', 'main', 2, 1],
    ['SEM_UNKNOWN_KEY', 'main', 3, 3],
  ]);
  assert.match(e[0].message, /p/);
  assert.match(e[1].message, /q/);
});

test('gốc: required/unknown ở entry 1:1; UNKNOWN_KEY tại khóa thắng', () => {
  const e = S('a = 1\nb = 2', { closed: true, fields: { a: {}, c: { required: true } } });
  assert.deepEqual(e.map(pos), [['SEM_MISSING_REQUIRED', 'main', 1, 1], ['SEM_UNKNOWN_KEY', 'main', 2, 1]]);
});

test('closed không có fields: không báo; closed false: không báo unknown', () => {
  assert.deepEqual(S('a = 1', { closed: true }), []);
  assert.deepEqual(S('a = 1', { fields: { b: {} } }), []);
});

test('items: phần tử mảng theo chỉ số, vị trí phần tử', () => {
  const e = S('l = [1, "a", 2, "b"]', { fields: { l: { type: 'array', items: { type: 'number' } } } });
  assert.deepEqual(e.map(pos), [['SEM_TYPE_MISMATCH', 'main', 1, 9], ['SEM_TYPE_MISMATCH', 'main', 1, 17]]);
});

test('chuỗi thuần tham chiếu: lỗi tại vị trí chuỗi, kể cả nội dung bên trong', () => {
  const src = 'src { n = "a" }\nl = [1, 2]\nb = "${src}"\nc = "${l}"\nd = "${src.n}"';
  const e = S(src, { fields: { b: { type: 'object', closed: true, fields: {} }, c: { items: { type: 'string' } }, d: { type: 'number' } } });
  assert.deepEqual(e.map(pos), [
    ['SEM_UNKNOWN_KEY', 'main', 1, 7],
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
    ['SEM_TYPE_MISMATCH', 'main', 5, 5],
  ]);
});

test('chuỗi nội suy: kiểm enum trên giá trị đã đánh giá', () => {
  assert.deepEqual(S('n = 5\ns = "v${n}"', { fields: { s: { enum: ['v5'] } } }), []);
  const e2 = S('n = 5\ns = "v${n}"', { fields: { s: { enum: ['v6'] } } });
  assert.deepEqual(e2.map(pos), [['SEM_NOT_IN_ENUM', 'main', 2, 5]]);
});

test('thứ tự khóa hợp nhất, ghi đè không đổi chỗ; file là tệp của nút', () => {
  const files = { main: 'include "b"\nx = "s"\ny = "t"', b: 'y = 1\nx = 2' };
  const e = run(files, { fields: { x: { type: 'number' }, y: { type: 'number' } } });
  assert.deepEqual(e.map(pos), [['SEM_TYPE_MISMATCH', 'main', 3, 5], ['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
});

test('Block đã khởi tạo đối tượng nằm ở tệp include', () => {
  const files = { main: 'include "b"\ns { z = 1 }', b: 's {\n  q = 1\n}' };
  const e = run(files, { fields: { s: { fields: { w: { required: true } } } } });
  assert.deepEqual(e.map(pos), [['SEM_MISSING_REQUIRED', 'b', 1, 1]]);
});

test('pha B lỗi thì không chạy pha C', () => {
  const e = S('a = "${zz}"', { fields: { a: { type: 'number' } } });
  assert.deepEqual(e.map((x) => x.code), ['SEM_UNDEFINED_REF']);
});

test('không kiểm sâu vào giá trị sai kiểu', () => {
  const e = S('a = [1]', { fields: { a: { type: 'object', fields: { k: { required: true } } } } });
  assert.deepEqual(e.map((x) => x.code), ['SEM_TYPE_MISMATCH']);
});
