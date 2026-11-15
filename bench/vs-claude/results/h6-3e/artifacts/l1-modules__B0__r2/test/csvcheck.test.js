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

const code = (fn) => { try { fn(); } catch (e) { return e; } return null; };

test('csvcheck: parse — dòng trống, kết thúc lẫn lộn, ô rỗng, BOM kép', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,\n\n  \n""\r\rb\r'), [['a', ''], ['  '], [''], ['b']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a,"b",'), [['a', 'b', '']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('csvcheck: parse — lỗi và row', () => {
  let e = code(() => parseCsv('a\nb"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE'); assert.equal(e.row, 2);
  e = code(() => parseCsv('"ab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE');
  e = code(() => parseCsv('a\n\n"x\ny'));
  assert.equal(e.code, 'CSV_UNTERMINATED_QUOTE'); assert.equal(e.row, 2);
  assert.equal(code(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
  assert.equal(code(() => parseCsv('a', { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
  assert.equal(code(() => parseCsv('a', { delimiter: ';;' })).code, 'CSV_INVALID_INPUT');
});

test('csvcheck: validate — tệp rỗng, lỗi phân tích, chỉ tiêu đề', () => {
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n"x', s).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('a\nx"', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'BAD_QUOTE' }] });
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
});

test('csvcheck: validate — cột thiếu, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const s = { columns: [
    { name: 'z', required: true },
    { name: 'b', type: 'int', required: true },
    { name: 'a', enum: ['x'], pattern: '^y', minLength: 3, maxLength: 0 },
  ] };
  const r = validateCsv('a,b\n1\nq,\nq,2,3\n', s);
  assert.deepEqual(r.errors, [
    { row: 1, column: 'z', code: 'MISSING_COLUMN' },
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: 'b', code: 'REQUIRED' },
    { row: 3, column: 'a', code: 'ENUM' },
    { row: 3, column: 'a', code: 'PATTERN' },
    { row: 3, column: 'a', code: 'MIN_LENGTH' },
    { row: 3, column: 'a', code: 'MAX_LENGTH' },
    { row: 4, column: null, code: 'ROW_LENGTH' },
  ]);
});

test('csvcheck: kiểu dữ liệu', () => {
  const t = (type, v) => validateCsv(`c\n${v}\n`, { columns: [{ name: 'c', type }] }).ok;
  for (const v of ['007', '+5', '-0']) assert.ok(t('int', v), v);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993']) assert.ok(!t('int', v), v);
  assert.ok(t('number', '-1.50')); assert.ok(t('number', '3'));
  for (const v of ['5.', '.5', '1e3', 'NaN']) assert.ok(!t('number', v), v);
  assert.ok(t('bool', 'TRUE')); assert.ok(!t('bool', 'yes')); assert.ok(!t('bool', '1'));
  assert.ok(t('date', '2024-02-29'));
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01', '1900-02-29', '2024-1-01']) assert.ok(!t('date', v), v);
  assert.ok(t('date', '2000-02-29'));
});

test('csvcheck: min/max, UNIQUE, TYPE dừng, string bỏ qua min', () => {
  const s = { columns: [
    { name: 'n', type: 'int', min: 2, max: 5, unique: true },
    { name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' },
    { name: 's', min: 'zzz' },
  ] };
  const r = validateCsv('n,d,s\n1,2023-12-31,a\n6,2025-01-01,a\nx,bad,a\n3,2024-05-05,a\n03,2024-05-05,a\n3,2024-05-05,a\n', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: 'n', code: 'MIN' },
    { row: 2, column: 'd', code: 'MIN' },
    { row: 3, column: 'n', code: 'MAX' },
    { row: 3, column: 'd', code: 'MAX' },
    { row: 4, column: 'n', code: 'TYPE' },
    { row: 4, column: 'd', code: 'TYPE' },
    { row: 7, column: 'n', code: 'UNIQUE' },
  ]);
});

test('csvcheck: hàng đếm theo bản ghi; độ dài theo điểm mã; trùng tên tiêu đề', () => {
  const s = { columns: [{ name: 'a', maxLength: 2 }] };
  const r = validateCsv('a,a\n\n"x\ny",1\n😀😀😀,2\n', s);
  assert.equal(r.rowCount, 2);
  assert.deepEqual(r.errors, [{ row: 2, column: 'a', code: 'MAX_LENGTH' }, { row: 3, column: 'a', code: 'MAX_LENGTH' }]);
});

test('csvcheck: lược đồ sai ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bads = [
    null, {}, { columns: [] }, { columns: [1] },
    { columns: [{}] }, { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'date', max: '2023-02-30' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const b of bads) assert.equal(code(() => validateCsv(5, b)).code, 'CSV_INVALID_SCHEMA');
  assert.equal(code(() => validateCsv(5, { columns: [{ name: 'a' }] })).code, 'CSV_INVALID_INPUT');
});

test('csvcheck: delimiter tùy chọn trong validate', () => {
  const r = validateCsv('a;b\n1;x\n', { columns: [{ name: 'a', type: 'int' }] }, { delimiter: ';' });
  assert.deepEqual(r, { ok: true, rowCount: 1, errors: [] });
});
