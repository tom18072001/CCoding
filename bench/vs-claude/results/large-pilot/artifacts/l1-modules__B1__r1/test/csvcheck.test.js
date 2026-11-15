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

const codes = (r) => r.errors.map((e) => `${e.row}:${e.column}:${e.code}`);

test('csvcheck: parse biên - dòng trống, nháy rỗng, dấu phân cách cuối, rỗng', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\r\n'), []);
  assert.deepEqual(parseCsv('a,\n\n  \n""\r'), [['a', ''], ['  '], ['']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('\uFEFF\uFEFFa'), [['\uFEFFa']]);
  assert.deepEqual(parseCsv('a\rb\nc\r\nd'), [['a'], ['b'], ['c'], ['d']]);
});

test('csvcheck: parse lỗi và đầu vào sai', () => {
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE');
  assert.throws(() => parseCsv('x\n"b'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv(5), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a', { delimiter: '"' }), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a', { delimiter: ';;' }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck: validate - tệp rỗng, lỗi phân tích, chỉ tiêu đề', () => {
  const schema = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('', schema), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n"x', schema).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('a\nx"y', schema).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('a', schema), { ok: true, rowCount: 0, errors: [] });
});

test('csvcheck: MISSING_COLUMN, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const schema = { columns: [
    { name: 'b', required: true },
    { name: 'zz', required: true },
    { name: 'a', type: 'int', unique: true },
  ] };
  const r = validateCsv('a,b\n1,x\n1\n1,,\nq,\n', schema);
  assert.deepEqual(codes(r), [
    '1:zz:MISSING_COLUMN',
    '3:null:ROW_LENGTH',
    '4:null:ROW_LENGTH',
    '5:b:REQUIRED',
    '5:a:TYPE',
  ]);
  assert.equal(r.rowCount, 4);
});

test('csvcheck: UNIQUE không tính ô sai kiểu/hàng sai độ dài; "1" khác "01"', () => {
  const schema = { columns: [{ name: 'id', type: 'int', unique: true }, { name: 'n' }] };
  assert.deepEqual(codes(validateCsv('id,n\n1,a\n01,b\n1,c\n', schema)), ['4:id:UNIQUE']);
  assert.deepEqual(codes(validateCsv('id,n\n1\n1,a\n', schema)), ['2:null:ROW_LENGTH']);
});

test('csvcheck: kiểu dữ liệu', () => {
  const t = (type, v) => validateCsv(`c\n${v}\n`, { columns: [{ name: 'c', type }] }).ok;
  for (const v of ['007', '+5', '-0']) assert.equal(t('int', v), true, v);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993']) assert.equal(t('int', v), false, v);
  for (const v of ['1', '-1.50', '+0.5']) assert.equal(t('number', v), true, v);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity']) assert.equal(t('number', v), false, v);
  for (const v of ['true', 'FALSE', 'True']) assert.equal(t('bool', v), true, v);
  for (const v of ['1', 'yes']) assert.equal(t('bool', v), false, v);
  for (const v of ['2024-02-29', '2000-02-29']) assert.equal(t('date', v), true, v);
  for (const v of ['2023-02-29', '1900-02-29', '2024-13-01', '0000-01-01', '2024-1-1']) assert.equal(t('date', v), false, v);
});

test('csvcheck: ràng buộc theo thứ tự ENUM→PATTERN→độ dài→MIN→MAX', () => {
  const schema = { columns: [{
    name: 'c', type: 'int', enum: ['5', '50'], pattern: '^1', minLength: 3, maxLength: 1, min: 10, max: 2,
  }] };
  assert.deepEqual(
    validateCsv('c\n7\n', schema).errors.map((e) => e.code),
    ['ENUM', 'PATTERN', 'MIN_LENGTH', 'MIN', 'MAX'],
  );
  assert.deepEqual(validateCsv('c\n50\n', schema).errors.map((e) => e.code),
    ['PATTERN', 'MIN_LENGTH', 'MAX_LENGTH', 'MAX']);
});

test('csvcheck: min/max cho date, bỏ qua với string; độ dài theo điểm mã; ô rỗng bỏ qua ràng buộc', () => {
  const d = { columns: [{ name: 'c', type: 'date', min: '2024-01-01', max: '2024-12-31' }] };
  assert.deepEqual(codes(validateCsv('c\n2023-12-31\n2024-01-01\n2024-12-31\n2025-01-01\n', d)), ['2:c:MIN', '5:c:MAX']);
  const s = { columns: [{ name: 'c', min: 5, maxLength: 1, pattern: 'x', unique: true }] };
  assert.deepEqual(validateCsv('c\n\n\n😀\n', { columns: [{ name: 'c', maxLength: 1, unique: true }] }).errors, []);
  assert.deepEqual(codes(validateCsv('c\n\n\nab\n', s)), ['2:c:PATTERN', '2:c:MAX_LENGTH']);
});

test('csvcheck: lược đồ sai ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bad = (schema) => assert.throws(() => validateCsv('"', schema), (e) => e.code === 'CSV_INVALID_SCHEMA');
  bad(null);
  bad({});
  bad({ columns: [] });
  bad({ columns: [1] });
  bad({ columns: [{}] });
  bad({ columns: [{ name: 'a' }, { name: 'a' }] });
  bad({ columns: [{ name: 'a', type: 'x' }] });
  bad({ columns: [{ name: 'a', pattern: '(' }] });
  bad({ columns: [{ name: 'a', enum: [] }] });
  bad({ columns: [{ name: 'a', enum: [1] }] });
  bad({ columns: [{ name: 'a', type: 'int', min: '1' }] });
  bad({ columns: [{ name: 'a', type: 'date', max: '2023-02-30' }] });
  bad({ columns: [{ name: 'a', minLength: -1 }] });
  bad({ columns: [{ name: 'a', maxLength: 1.5 }] });
  assert.throws(() => validateCsv(1, { columns: [{ name: 'a' }] }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck: tiêu đề lặp lấy cột đầu, phân biệt hoa thường, delimiter tùy chọn', () => {
  const schema = { columns: [{ name: 'a', type: 'int' }] };
  assert.deepEqual(codes(validateCsv('a;a\n1;x\n', schema, { delimiter: ';' })), []);
  assert.deepEqual(codes(validateCsv('A\n1\n', schema)), ['1:a:MISSING_COLUMN']);
});
