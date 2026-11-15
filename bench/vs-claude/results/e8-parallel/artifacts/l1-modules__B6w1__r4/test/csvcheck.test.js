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

const code = (fn) => { try { fn(); } catch (e) { return [e.code, e.row]; } return null; };

test('csvcheck: parse — dòng trống, CR đơn, rỗng, BOM kép, dấu phân cách cuối', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a\r\n\r\n\nb\rc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('  \n""\n'), [['  '], ['']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
});

test('csvcheck: parse — lỗi', () => {
  assert.deepEqual(code(() => parseCsv('a\n"b')), ['CSV_UNTERMINATED_QUOTE', 2]);
  assert.deepEqual(code(() => parseCsv('a\nab"c')), ['CSV_BAD_QUOTE', 2]);
  assert.deepEqual(code(() => parseCsv('"ab"c')), ['CSV_BAD_QUOTE', 1]);
  assert.equal(code(() => parseCsv(1))[0], 'CSV_INVALID_INPUT');
  assert.equal(code(() => parseCsv('a', { delimiter: '"' }))[0], 'CSV_INVALID_INPUT');
  assert.equal(code(() => parseCsv('a', { delimiter: ',,' }))[0], 'CSV_INVALID_INPUT');
});

test('csvcheck: validate — rỗng, lỗi phân tích, thiếu cột, độ dài hàng', () => {
  const s = { columns: [{ name: 'a', required: true }, { name: 'b' }] };
  assert.deepEqual(validateCsv('', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a,b\n1,"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a,b', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a\n,', s).errors, [
    { row: 1, column: 'b', code: 'MISSING_COLUMN' },
    { row: 2, column: null, code: 'ROW_LENGTH' },
  ]);
  assert.deepEqual(validateCsv('b,a\n,\n', s).errors, [{ row: 2, column: 'a', code: 'REQUIRED' }]);
});

test('csvcheck: validate — kiểu, enum, pattern, min/max, unique, thứ tự theo lược đồ', () => {
  const s = { columns: [
    { name: 'z', enum: ['x'], pattern: '^y', minLength: 3, maxLength: 1 },
    { name: 'n', type: 'number', min: 0, max: 10, unique: true },
    { name: 'd', type: 'date', min: '2024-01-01' },
    { name: 'b', type: 'bool' },
    { name: 'i', type: 'int' },
  ] };
  const text = 'i,b,d,n,z\n1.0,TRUE,2024-02-30,5.,ab\n+5,yes,2023-12-31,11,\n-0,false,2024-02-29,11,x\n';
  assert.deepEqual(validateCsv(text, s).errors, [
    { row: 2, column: 'z', code: 'ENUM' },
    { row: 2, column: 'z', code: 'PATTERN' },
    { row: 2, column: 'z', code: 'MIN_LENGTH' },
    { row: 2, column: 'z', code: 'MAX_LENGTH' },
    { row: 2, column: 'n', code: 'TYPE' },
    { row: 2, column: 'd', code: 'TYPE' },
    { row: 2, column: 'i', code: 'TYPE' },
    { row: 3, column: 'n', code: 'MAX' },
    { row: 3, column: 'd', code: 'MIN' },
    { row: 3, column: 'b', code: 'TYPE' },
    { row: 4, column: 'z', code: 'PATTERN' },
    { row: 4, column: 'z', code: 'MIN_LENGTH' },
    { row: 4, column: 'n', code: 'MAX' },
    { row: 4, column: 'n', code: 'UNIQUE' },
  ]);
});

test('csvcheck: validate — lược đồ sai', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] }, { columns: [{ name: 'a', type: 'date', max: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] }];
  for (const b of bad) assert.equal(code(() => validateCsv('a', b))[0], 'CSV_INVALID_SCHEMA');
  assert.equal(code(() => validateCsv(5, { columns: [{ name: 'a' }] }))[0], 'CSV_INVALID_INPUT');
});
