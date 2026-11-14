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
const q = (v) => `"${v.replace(/"/g, '""')}"`;

test('parseCsv: dòng trống, kết thúc dòng lẫn lộn, dòng cuối', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\r\n'), []);
  assert.deepEqual(parseCsv('a\r\r\nb\rc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a\n\n  \n""\n'), [['a'], ['  '], ['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(',\n'), [['', '']]);
});

test('parseCsv: CRLF giữ nguyên trong nháy, BOM đúng một lần', () => {
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parseCsv: lỗi và row', () => {
  assert.throws(() => parseCsv(1), (e) => e.code === 'CSV_INVALID_INPUT' && !('row' in e));
  for (const d of ['"', '\n', '\r', ',,', '']) {
    assert.throws(() => parseCsv('a', { delimiter: d }), (e) => e.code === 'CSV_INVALID_INPUT');
  }
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a\n\n"x\ny'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
});

test('validateCsv: lỗi phân tích, rỗng, chỉ tiêu đề', () => {
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('a\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.throws(() => validateCsv(5, s), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('validateCsv: lược đồ sai', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'number', max: Infinity }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bad) {
    assert.throws(() => validateCsv('a\n1', s), (e) => e.code === 'CSV_INVALID_SCHEMA');
  }
  assert.throws(() => validateCsv('"x', { columns: [] }), (e) => e.code === 'CSV_INVALID_SCHEMA');
});

test('validateCsv: MISSING_COLUMN, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const s = { columns: [{ name: 'b', required: true }, { name: 'zz', required: true }, { name: 'a', required: true, unique: true }] };
  const r = validateCsv('a,b,extra\n1,\n,,\n1,x,y\n1,,y\n', s);
  assert.deepEqual(codes(r), [
    '1:zz:MISSING_COLUMN',
    '2:null:ROW_LENGTH',
    '3:b:REQUIRED',
    '3:a:REQUIRED',
    '5:b:REQUIRED',
    '5:a:UNIQUE',
  ]);
  assert.equal(r.rowCount, 4);
  assert.deepEqual(Object.keys(r.errors[0]).sort(), ['code', 'column', 'row']);
});

test('validateCsv: hàng sai độ dài không vào tập UNIQUE; hàng đếm theo bản ghi', () => {
  const s = { columns: [{ name: 'id', unique: true }, { name: 'v' }] };
  const r = validateCsv('id,v\n\n"1\n2",x\n1\n"1\n2",y\n', s);
  assert.deepEqual(codes(r), ['3:null:ROW_LENGTH', '4:id:UNIQUE']);
});

test('validateCsv: tiêu đề phân biệt hoa thường, lặp lấy cột đầu', () => {
  const s = { columns: [{ name: 'a', type: 'int' }] };
  assert.deepEqual(codes(validateCsv('a,a\nx,1\n', s)), ['2:a:TYPE']);
  assert.deepEqual(codes(validateCsv('A\n1\n', s)), ['1:a:MISSING_COLUMN']);
  assert.deepEqual(codes(validateCsv(' a\n1\n', s)), ['1:a:MISSING_COLUMN']);
});

test('validateCsv: kiểu', () => {
  const run = (type, vals) => vals.map((v) => validateCsv(`c\n${q(v)}\n`, { columns: [{ name: 'c', type }] }).ok);
  assert.deepEqual(run('int', ['007', '+5', '-0', '1.0', '1e3', ' 1', '9007199254740993']), [true, true, true, false, false, false, false]);
  assert.deepEqual(run('number', ['1', '-1.5', '+0.25', '5.', '.5', '1e3', 'NaN', 'Infinity']), [true, true, true, false, false, false, false, false]);
  assert.deepEqual(run('bool', ['true', 'FALSE', 'True', '1', 'yes']), [true, true, true, false, false]);
  assert.deepEqual(run('date', ['2024-02-29', '2023-02-29', '2024-13-01', '0000-01-01', '2024-1-01', '1900-02-29', '2000-02-29']), [true, false, false, false, false, false, true]);
  assert.deepEqual(run('string', ['anything']), [true]);
});

test('validateCsv: ràng buộc, thứ tự và dừng khi sai kiểu', () => {
  const s = { columns: [
    { name: 'n', type: 'int', min: 5, max: 10, enum: ['1', '7'], pattern: '^\\d$', unique: true },
  ] };
  const r = validateCsv('n\n1\n20\nx\n7\n7\n', s);
  assert.deepEqual(codes(r), ['2:n:MIN', '3:n:ENUM', '3:n:PATTERN', '3:n:MAX', '4:n:TYPE', '6:n:UNIQUE']);
  const s2 = { columns: [{ name: 's', enum: ['ab'], pattern: '^z', minLength: 5 }, { name: 't', maxLength: 1 }] };
  assert.deepEqual(codes(validateCsv('t,s\nxx,c\n', s2)), ['2:s:ENUM', '2:s:PATTERN', '2:s:MIN_LENGTH', '2:t:MAX_LENGTH']);
});

test('validateCsv: biên min/max/length, date, điểm mã, pattern không neo', () => {
  assert.equal(validateCsv('n\n5\n10\n', { columns: [{ name: 'n', type: 'number', min: 5, max: 10 }] }).ok, true);
  assert.deepEqual(codes(validateCsv('d\n2024-01-01\n2023-12-31\n2024-12-31\n2025-01-01\n', { columns: [{ name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' }] })), ['3:d:MIN', '5:d:MAX']);
  assert.equal(validateCsv('s\nabc\n', { columns: [{ name: 's', min: 'z', max: 1 }] }).ok, true);
  assert.equal(validateCsv('s\n😀😀\n', { columns: [{ name: 's', maxLength: 2, minLength: 2 }] }).ok, true);
  assert.deepEqual(codes(validateCsv('s\nabc\n', { columns: [{ name: 's', maxLength: 2 }] })), ['2:s:MAX_LENGTH']);
  assert.equal(validateCsv('s\nxabcx\n', { columns: [{ name: 's', pattern: 'abc' }] }).ok, true);
  assert.deepEqual(codes(validateCsv('s\nxabcx\n', { columns: [{ name: 's', pattern: '^abc$' }] })), ['2:s:PATTERN']);
  assert.deepEqual(codes(validateCsv('r\nAdmin\n', { columns: [{ name: 'r', enum: ['admin'] }] })), ['2:r:ENUM']);
  assert.equal(validateCsv('r\n\n""\n', { columns: [{ name: 'r', enum: ['a'], minLength: 3 }] }).ok, true);
});

test('validateCsv: UNIQUE nguyên văn, ô rỗng và ô sai kiểu không vào tập', () => {
  const s = { columns: [{ name: 'id', type: 'int', unique: true }, { name: 'k' }] };
  assert.deepEqual(codes(validateCsv('id,k\n1,a\n01,a\n1,b\n,c\n,d\n', s)), ['4:id:UNIQUE']);
});
