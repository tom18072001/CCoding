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

test('csvcheck: nháy không đóng báo mã lỗi', () => {
  assert.throws(() => parseCsv('a,"b'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE');
});

test('csvcheck: dòng trống, BOM đôi, ô rỗng có nháy', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a\r\n\r\n  \r""\r'), [['a'], ['  '], ['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
});

test('csvcheck: lỗi phân tích', () => {
  assert.throws(() => parseCsv('ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a\n"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv(1), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a', { delimiter: '"' }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck: validate lỗi phân tích, rỗng, cột thiếu, ROW_LENGTH', () => {
  const s = { columns: [{ name: 'a', required: true }, { name: 'b' }] };
  assert.deepEqual(validateCsv('a\n"x', s).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n1,2\n', s).errors, [
    { row: 1, column: 'b', code: 'MISSING_COLUMN' },
    { row: 2, column: null, code: 'ROW_LENGTH' },
  ]);
  const h = validateCsv('a,b', s);
  assert.equal(h.ok, true);
  assert.equal(h.rowCount, 0);
});

test('csvcheck: kiểu, ràng buộc và thứ tự theo lược đồ', () => {
  const s = { columns: [
    { name: 'd', type: 'date', min: '2024-01-01' },
    { name: 'k', enum: ['x'], pattern: '^y', minLength: 3, maxLength: 1 },
    { name: 'n', type: 'number', max: 5, unique: true },
  ] };
  const r = validateCsv('n,k,d\n9,ab,2023-02-29\n9.5,x,2023-12-31\n5.,x,2024-02-29\n', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: 'd', code: 'TYPE' },
    { row: 2, column: 'k', code: 'ENUM' },
    { row: 2, column: 'k', code: 'PATTERN' },
    { row: 2, column: 'k', code: 'MIN_LENGTH' },
    { row: 2, column: 'k', code: 'MAX_LENGTH' },
    { row: 2, column: 'n', code: 'MAX' },
    { row: 3, column: 'd', code: 'MIN' },
    { row: 3, column: 'k', code: 'PATTERN' },
    { row: 3, column: 'k', code: 'MIN_LENGTH' },
    { row: 3, column: 'n', code: 'MAX' },
    { row: 4, column: 'k', code: 'PATTERN' },
    { row: 4, column: 'k', code: 'MIN_LENGTH' },
    { row: 4, column: 'n', code: 'TYPE' },
  ]);
});

test('csvcheck: lược đồ sai ném CSV_INVALID_SCHEMA', () => {
  const bad = [null, {}, { columns: [] }, { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] }, { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', type: 'int', min: 'z' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', maxLength: -1 }] }];
  for (const s of bad) assert.throws(() => validateCsv('a', s), (e) => e.code === 'CSV_INVALID_SCHEMA');
});
