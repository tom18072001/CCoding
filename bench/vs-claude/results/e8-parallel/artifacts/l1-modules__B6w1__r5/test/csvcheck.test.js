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

test('csvcheck: parse — dòng trống, kết thúc lẫn lộn, ô rỗng', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a\r\r\n\n\nb'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('a,\n  \n""\n'), [['a', ''], ['  '], ['']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
});

test('csvcheck: parse — lỗi và row', () => {
  const code = (t, o) => { try { parseCsv(t, o); } catch (e) { return [e.code, e.row]; } };
  assert.deepEqual(code('a\n\nb,"x'), ['CSV_UNTERMINATED_QUOTE', 2]);
  assert.deepEqual(code('a\nab"c'), ['CSV_BAD_QUOTE', 2]);
  assert.deepEqual(code('"ab"c'), ['CSV_BAD_QUOTE', 1]);
  assert.deepEqual(code(5), ['CSV_INVALID_INPUT', undefined]);
  assert.deepEqual(code('a', { delimiter: '"' }), ['CSV_INVALID_INPUT', undefined]);
  assert.deepEqual(code('a', { delimiter: ',,' }), ['CSV_INVALID_INPUT', undefined]);
});

test('csvcheck: validate — rỗng, parse lỗi, chỉ tiêu đề', () => {
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n"x', s).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('a\nx"', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
});

test('csvcheck: validate — MISSING_COLUMN, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const s = { columns: [{ name: 'b', required: true }, { name: 'zz', required: true }, { name: 'a', required: true }] };
  const r = validateCsv('a,b\n,\n1\n1,2,3\n', s);
  assert.deepEqual(codes(r), ['1:zz:MISSING_COLUMN', '2:b:REQUIRED', '2:a:REQUIRED', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH']);
  assert.equal(r.rowCount, 3);
});

test('csvcheck: validate — thứ tự kiểm một ô và UNIQUE', () => {
  const s = { columns: [{ name: 'v', enum: ['abc', 'zzzz'], pattern: '^z', minLength: 4, maxLength: 3, unique: true }] };
  assert.deepEqual(codes(validateCsv('v\nabd\n', s)), ['2:v:ENUM', '2:v:PATTERN', '2:v:MIN_LENGTH']);
  assert.deepEqual(codes(validateCsv('v\nzzzz\nzzzz\n', s)), ['2:v:MAX_LENGTH', '3:v:MAX_LENGTH', '3:v:UNIQUE']);
  const u = { columns: [{ name: 'n', type: 'int', unique: true }] };
  assert.deepEqual(codes(validateCsv('n\n1\n01\nx\nx\n\n1\n', u)), ['4:n:TYPE', '5:n:TYPE', '6:n:UNIQUE']);
  const u2 = { columns: [{ name: 'a', unique: true }] };
  assert.deepEqual(codes(validateCsv('a,b\nx\nx,1\n,1\n,1\n', u2)), ['2:null:ROW_LENGTH']);
});

test('csvcheck: validate — kiểu dữ liệu', () => {
  const t = (type, v) => validateCsv(`c\n"${v}"\n`, { columns: [{ name: 'c', type }] }).ok;
  for (const v of ['007', '+5', '-0']) assert.equal(t('int', v), true);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993']) assert.equal(t('int', v), false);
  for (const v of ['1.5', '-2', '3']) assert.equal(t('number', v), true);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity']) assert.equal(t('number', v), false);
  assert.equal(t('bool', 'TRUE'), true);
  assert.equal(t('bool', 'yes'), false);
  assert.equal(t('bool', '1'), false);
  for (const v of ['2024-02-29', '2000-02-29']) assert.equal(t('date', v), true);
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01', '1900-02-29', '2024-1-01']) assert.equal(t('date', v), false);
});

test('csvcheck: validate — min/max, độ dài theo điểm mã, bỏ qua với string', () => {
  const s = { columns: [{ name: 'n', type: 'int', min: 1, max: 3 }, { name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' }] };
  assert.deepEqual(codes(validateCsv('n,d\n0,2023-12-31\n4,2025-01-01\n1,2024-01-01\n3,2024-12-31\n', s)),
    ['2:n:MIN', '2:d:MIN', '3:n:MAX', '3:d:MAX']);
  const str = { columns: [{ name: 's', min: 5, max: 1, maxLength: 1 }] };
  assert.equal(validateCsv('s\n😀\n', str).ok, true);
  assert.deepEqual(codes(validateCsv('s\n😀😀\n', str)), ['2:s:MAX_LENGTH']);
});

test('csvcheck: validate — tiêu đề so khớp chính xác, trùng lấy cột đầu, bản ghi nhiều dòng', () => {
  const s = { columns: [{ name: 'a', required: true }] };
  assert.deepEqual(codes(validateCsv('A,a,a\n1,,2\n', s)), ['2:a:REQUIRED']);
  assert.deepEqual(codes(validateCsv('a\n"x\ny"\n\n\n', { columns: [{ name: 'a', maxLength: 2 }] })), ['2:a:MAX_LENGTH']);
  assert.deepEqual(codes(validateCsv(' a\n1\n', s)), ['1:a:MISSING_COLUMN']);
});

test('csvcheck: lược đồ sai ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bads = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] }, { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'date', max: '2023-02-30' }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] }];
  for (const b of bads) assert.throws(() => validateCsv(5, b), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv(5, { columns: [{ name: 'a' }] }), (e) => e.code === 'CSV_INVALID_INPUT');
});
