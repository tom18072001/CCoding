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

test('csvcheck: parse — dòng trống, kết thúc lẫn lộn, ô rỗng, CRLF trong nháy', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a\r\r\n\n  \n""\r'), [['a'], ['  '], ['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('"x\r\ny"'), [['x\r\ny']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
});

test('csvcheck: parse — lỗi', () => {
  assert.throws(() => parseCsv(5), { code: 'CSV_INVALID_INPUT' });
  assert.throws(() => parseCsv('a', { delimiter: '"' }), { code: 'CSV_INVALID_INPUT' });
  assert.throws(() => parseCsv('a', { delimiter: ',,' }), { code: 'CSV_INVALID_INPUT' });
  assert.throws(() => parseCsv('a\n"b'), { code: 'CSV_UNTERMINATED_QUOTE', row: 2 });
  assert.throws(() => parseCsv('ab"c'), { code: 'CSV_BAD_QUOTE', row: 1 });
  assert.throws(() => parseCsv('a\n"ab"c'), { code: 'CSV_BAD_QUOTE', row: 2 });
});

test('csvcheck: validate — rỗng, lỗi phân tích, chỉ tiêu đề, cột thiếu, độ dài hàng', () => {
  const s = { columns: [{ name: 'a', required: true }, { name: 'b' }] };
  assert.deepEqual(validateCsv('', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a,b\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a,b', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('b\n1\n', s).errors, [{ row: 1, column: 'a', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(validateCsv('a,b\n1\n1,2,3\n', s).errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' }, { row: 3, column: null, code: 'ROW_LENGTH' }]);
});

test('csvcheck: validate — kiểu, ràng buộc, thứ tự theo lược đồ', () => {
  const s = { columns: [
    { name: 'd', type: 'date', min: '2024-01-01' },
    { name: 'n', type: 'number', max: 5, enum: ['9', '1.5'], pattern: '^1' },
    { name: 'b', type: 'bool', unique: true },
  ] };
  const r = validateCsv('b,n,d\nTRUE,1.5,2024-02-29\ntrue,7,2023-02-29\nTRUE,.5,2023-12-31\nyes,,\n', s);
  assert.deepEqual(r.errors, [
    { row: 3, column: 'd', code: 'TYPE' },
    { row: 3, column: 'n', code: 'ENUM' },
    { row: 3, column: 'n', code: 'PATTERN' },
    { row: 3, column: 'n', code: 'MAX' },
    { row: 4, column: 'd', code: 'MIN' },
    { row: 4, column: 'n', code: 'TYPE' },
    { row: 4, column: 'b', code: 'UNIQUE' },
    { row: 5, column: 'b', code: 'TYPE' },
  ]);
});

test('csvcheck: validate — schema sai và độ dài theo điểm mã', () => {
  assert.throws(() => validateCsv('a', { columns: [] }), { code: 'CSV_INVALID_SCHEMA' });
  assert.throws(() => validateCsv('a', { columns: [{ name: 'a' }, { name: 'a' }] }), { code: 'CSV_INVALID_SCHEMA' });
  assert.throws(() => validateCsv('a', { columns: [{ name: 'a', pattern: '(' }] }), { code: 'CSV_INVALID_SCHEMA' });
  assert.throws(() => validateCsv('a', { columns: [{ name: 'a', type: 'int', min: 'x' }] }), { code: 'CSV_INVALID_SCHEMA' });
  const r = validateCsv('a\n😀😀\n', { columns: [{ name: 'a', maxLength: 2, minLength: 3 }] });
  assert.deepEqual(r.errors, [{ row: 2, column: 'a', code: 'MIN_LENGTH' }]);
});
