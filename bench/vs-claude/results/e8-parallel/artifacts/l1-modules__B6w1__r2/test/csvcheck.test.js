import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

test('csvcheck: tách bản ghi, CRLF và ô có nháy', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
});

test('csvcheck: BOM được bỏ, delimiter tùy chọn', () => {
  assert.deepEqual(parseCsv('﻿a;b', { delimiter: ';' }), [['a', 'b']]);
});

test('csvcheck: ví dụ trong SPEC', () => {
  const schema = { columns: [
    { name: 'id', type: 'int', required: true, unique: true, min: 1 },
    { name: 'name', maxLength: 5 },
  ] };
  const r = validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema);
  assert.equal(r.ok, false);
  assert.equal(r.rowCount, 4);
  assert.deepEqual(r.errors, [
    { row: 3, column: 'id', code: 'UNIQUE' },
    { row: 3, column: 'name', code: 'MAX_LENGTH' },
    { row: 4, column: 'id', code: 'TYPE' },
    { row: 5, column: 'id', code: 'REQUIRED' },
  ]);
});

test('csvcheck: parse biên', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\r\n\r\n\n  \n""\r'), [['a'], ['  '], ['']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a\rb\r\nc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('"a",'), [['a', '']]);
});

test('csvcheck: lỗi parse', () => {
  assert.throws(() => parseCsv('ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a\n"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv(5), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a', { delimiter: '"' }), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a', { delimiter: ';;' }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck: validate lỗi cấp tệp và lược đồ', () => {
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n"x', s).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('a', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('b\n1', s).errors, [{ row: 1, column: 'a', code: 'MISSING_COLUMN' }]);
  assert.throws(() => validateCsv('a', { columns: [] }), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv('a', { columns: [{ name: 'a', pattern: '(' }] }), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv('a', { columns: [{ name: 'a' }, { name: 'a' }] }), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv(1, { columns: [{ name: 'a' }] }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck: ROW_LENGTH, thứ tự cột theo lược đồ, kiểu, unique', () => {
  const s = { columns: [
    { name: 'y', type: 'date', min: '2024-01-01', unique: true },
    { name: 'x', enum: ['a'], pattern: '^b', minLength: 3 },
    { name: 'n', type: 'number', max: 5 },
    { name: 'b', type: 'bool' },
  ] };
  const r = validateCsv('x,y,n,b\n1,2,3\nq,2023-02-29,5.5,TRUE\nq,2023-12-31,.5,yes\nq,2023-12-31,6,false', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: 'y', code: 'TYPE' },
    { row: 3, column: 'x', code: 'ENUM' },
    { row: 3, column: 'x', code: 'PATTERN' },
    { row: 3, column: 'x', code: 'MIN_LENGTH' },
    { row: 3, column: 'n', code: 'MAX' },
    { row: 4, column: 'y', code: 'MIN' },
    { row: 4, column: 'x', code: 'ENUM' },
    { row: 4, column: 'x', code: 'PATTERN' },
    { row: 4, column: 'x', code: 'MIN_LENGTH' },
    { row: 4, column: 'n', code: 'TYPE' },
    { row: 4, column: 'b', code: 'TYPE' },
    { row: 5, column: 'y', code: 'MIN' },
    { row: 5, column: 'y', code: 'UNIQUE' },
    { row: 5, column: 'x', code: 'ENUM' },
    { row: 5, column: 'x', code: 'PATTERN' },
    { row: 5, column: 'x', code: 'MIN_LENGTH' },
    { row: 5, column: 'n', code: 'MAX' },
  ]);
});

test('csvcheck: int, số hàng theo bản ghi, độ dài theo điểm mã', () => {
  const s = { columns: [{ name: 'i', type: 'int', unique: true }, { name: 's', maxLength: 1 }] };
  const r = validateCsv('i,s\n\n"1\n",😀\n007,😀😀\n01,x\n1.0,\n+5,\n-0,', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: 'i', code: 'TYPE' },
    { row: 3, column: 's', code: 'MAX_LENGTH' },
    { row: 5, column: 'i', code: 'TYPE' },
  ]);
  assert.equal(r.rowCount, 6);
});

test('csvcheck: nháy không đóng báo mã lỗi', () => {
  assert.throws(() => parseCsv('a,"b'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE');
});
