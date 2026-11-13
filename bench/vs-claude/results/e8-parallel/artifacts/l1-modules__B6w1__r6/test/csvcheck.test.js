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

const code = (c) => (e) => e.code === c;
const codes = (r) => r.errors.map((e) => `${e.row}:${e.column}:${e.code}`);

test('csvcheck: parse — dòng trống, kết thúc dòng lẫn lộn, ô rỗng', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,\n\n\r\n  \n""\r'), [['a', ''], ['  '], ['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('csvcheck: parse — lỗi', () => {
  assert.throws(() => parseCsv('a\nb"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), code('CSV_BAD_QUOTE'));
  assert.throws(() => parseCsv('a\n"b'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv(5), code('CSV_INVALID_INPUT'));
  for (const d of ['"', '\n', '\r', ',,', '']) {
    assert.throws(() => parseCsv('a', { delimiter: d }), code('CSV_INVALID_INPUT'));
  }
});

test('csvcheck: lược đồ sai ném CSV_INVALID_SCHEMA trước khi parse', () => {
  const bads = [
    null, {}, { columns: [] }, { columns: [1] },
    { columns: [{}] }, { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'date', max: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bads) assert.throws(() => validateCsv(5, s), code('CSV_INVALID_SCHEMA'));
  assert.throws(() => validateCsv(5, { columns: [{ name: 'a' }] }), code('CSV_INVALID_INPUT'));
});

test('csvcheck: lỗi phân tích và tệp rỗng không ném', () => {
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('a\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('\n\n', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
});

test('csvcheck: MISSING_COLUMN, ROW_LENGTH và thứ tự theo lược đồ', () => {
  const s = { columns: [
    { name: 'b', required: true },
    { name: 'zz', required: true },
    { name: 'a', type: 'int' },
  ] };
  const r = validateCsv('a,b\nx,\n1\n1,2,3\n\n,ok\n', s);
  assert.deepEqual(codes(r), ['1:zz:MISSING_COLUMN', '2:b:REQUIRED', '2:a:TYPE', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH']);
  assert.equal(r.rowCount, 4);
});

test('csvcheck: kiểu dữ liệu', () => {
  const t = (type, good, bad) => {
    const s = { columns: [{ name: 'v', type }] };
    for (const g of good) assert.equal(validateCsv(`v\n"${g}"`, s).ok, true, `${type} ${g}`);
    for (const b of bad) assert.deepEqual(codes(validateCsv(`v\n"${b}"`, s)), ['2:v:TYPE'], `${type} ${b}`);
  };
  t('int', ['007', '+5', '-0', '9007199254740991'], ['1.0', '1e3', ' 1', '9007199254740993']);
  t('number', ['1', '-1.5', '+0.25'], ['5.', '.5', 'NaN', 'Infinity', '1e3']);
  t('bool', ['true', 'FALSE', 'True'], ['1', 'yes', ' true']);
  t('date', ['2024-02-29', '2000-02-29'], ['2023-02-29', '2024-13-01', '0000-01-01', '1900-02-29', '2024-1-1', '2024-04-31']);
});

test('csvcheck: enum, pattern, độ dài, min/max; bước 3–9 không dừng nhau', () => {
  const s = { columns: [{ name: 'v', enum: ['abc', 'xyz'], pattern: '^a', minLength: 4, maxLength: 2 }] };
  assert.deepEqual(codes(validateCsv('v\nxyz\nabc', s)),
    ['2:v:PATTERN', '2:v:MIN_LENGTH', '2:v:MAX_LENGTH', '3:v:MIN_LENGTH', '3:v:MAX_LENGTH']);
  assert.deepEqual(codes(validateCsv('v\nAbc', s)), ['2:v:ENUM', '2:v:PATTERN', '2:v:MIN_LENGTH', '2:v:MAX_LENGTH']);
  assert.equal(validateCsv('v\nxxaxx', { columns: [{ name: 'v', pattern: 'a' }] }).ok, true);
  const em = { columns: [{ name: 'v', maxLength: 2 }] };
  assert.equal(validateCsv('v\n😀😀', em).ok, true);
  assert.deepEqual(codes(validateCsv('v\n😀😀😀', em)), ['2:v:MAX_LENGTH']);
  const n = { columns: [{ name: 'v', type: 'int', min: 1, max: 5 }] };
  assert.deepEqual(codes(validateCsv('v\n0\n1\n5\n6', n)), ['2:v:MIN', '5:v:MAX']);
  const d = { columns: [{ name: 'v', type: 'date', min: '2024-01-01', max: '2024-12-31' }] };
  assert.deepEqual(codes(validateCsv('v\n2023-12-31\n2024-01-01\n2025-01-01', d)), ['2:v:MIN', '4:v:MAX']);
  assert.equal(validateCsv('v\nabc', { columns: [{ name: 'v', min: 100, max: 1 }] }).ok, true);
});

test('csvcheck: ô rỗng bỏ qua ràng buộc; unique', () => {
  assert.equal(validateCsv('v,w\n,a\n,b\n""\u0000', { columns: [{ name: 'v', unique: true, minLength: 3 }] }).errors.length, 1);
  assert.equal(validateCsv('v,w\n,a\n,b', { columns: [{ name: 'v', unique: true, minLength: 3, pattern: 'z' }] }).ok, true);
  const u = { columns: [{ name: 'v', type: 'int', unique: true }] };
  assert.deepEqual(codes(validateCsv('v\n1\n01\n1\nx\nx\n1', u)), ['4:v:UNIQUE', '5:v:TYPE', '6:v:TYPE', '7:v:UNIQUE']);
});

test('csvcheck: ROW_LENGTH không ghi vào unique; tiêu đề lặp; phân biệt hoa thường', () => {
  const s = { columns: [{ name: 'a', unique: true }] };
  assert.deepEqual(codes(validateCsv('a\n1,2\n1\n1', s)), ['2:null:ROW_LENGTH', '4:a:UNIQUE']);
  assert.deepEqual(codes(validateCsv('a,a\n1,2\n1,3', s)), ['3:a:UNIQUE']);
  assert.equal(validateCsv('A\n1', s).errors[0].code, 'MISSING_COLUMN');
});

test('csvcheck: số hàng đếm theo bản ghi', () => {
  const s = { columns: [{ name: 'a', type: 'int' }] };
  assert.deepEqual(codes(validateCsv('a\n\n"1\n2"\n\nx', s)), ['2:a:TYPE', '3:a:TYPE']);
});
