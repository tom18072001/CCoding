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
  assert.deepEqual(parseCsv('a\n\n  \n""\r\rb'), [['a'], ['  '], [''], ['b']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.throws(() => parseCsv('ab"c'), (e) => e.code === 'CSV_BAD_QUOTE');
  assert.throws(() => parseCsv('a\n"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv(5), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a', { delimiter: '"' }), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a', { delimiter: ',,' }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck: lược đồ sai, tệp rỗng, lỗi phân tích', () => {
  assert.throws(() => validateCsv('a', { columns: [] }), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv('a', { columns: [{ name: 'a', pattern: '(' }] }), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv('a', { columns: [{ name: 'a' }, { name: 'a' }] }), (e) => e.code === 'CSV_INVALID_SCHEMA');
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
});

test('csvcheck: cột thiếu, độ dài hàng, thứ tự theo lược đồ', () => {
  const s = { columns: [{ name: 'b', required: true }, { name: 'a', type: 'bool' }, { name: 'z', required: true }] };
  const r = validateCsv('a,b\nx,\n1\n', s);
  assert.deepEqual(r.errors, [
    { row: 1, column: 'z', code: 'MISSING_COLUMN' },
    { row: 2, column: 'b', code: 'REQUIRED' },
    { row: 2, column: 'a', code: 'TYPE' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
  ]);
});

test('csvcheck: kiểu và ràng buộc', () => {
  const s = { columns: [
    { name: 'n', type: 'number', min: 0, max: 10 },
    { name: 'd', type: 'date', min: '2024-01-01' },
    { name: 'e', enum: ['x'], pattern: '^y', minLength: 2 },
  ] };
  const r = validateCsv('n,d,e\n11,2023-12-31,a\n5.,2023-02-29,x\n-1,2024-02-29,xy\n', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: 'n', code: 'MAX' },
    { row: 2, column: 'd', code: 'MIN' },
    { row: 2, column: 'e', code: 'ENUM' },
    { row: 2, column: 'e', code: 'PATTERN' },
    { row: 2, column: 'e', code: 'MIN_LENGTH' },
    { row: 3, column: 'n', code: 'TYPE' },
    { row: 3, column: 'd', code: 'TYPE' },
    { row: 3, column: 'e', code: 'PATTERN' },
    { row: 3, column: 'e', code: 'MIN_LENGTH' },
    { row: 4, column: 'n', code: 'MIN' },
    { row: 4, column: 'e', code: 'ENUM' },
    { row: 4, column: 'e', code: 'PATTERN' },
  ]);
  const u = { columns: [{ name: 'k', unique: true }] };
  assert.deepEqual(validateCsv('k\n1\n01\n1\n\n', u).errors, [{ row: 4, column: 'k', code: 'UNIQUE' }]);
});

test('csvcheck: nháy không đóng báo mã lỗi', () => {
  assert.throws(() => parseCsv('a,"b'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE');
});
