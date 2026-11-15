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
const S = (cols) => ({ columns: cols });

test('csvcheck: parse — dòng trống, kết thúc lẫn lộn, ô rỗng, nháy', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,\r\rb\n\n'), [['a', ''], ['b']]);
  assert.deepEqual(parseCsv('  \n""\n'), [['  '], ['']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
});

test('csvcheck: parse — lỗi ném kèm code và row', () => {
  assert.throws(() => parseCsv('a\n"b'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a\n"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv(5), (e) => e.code === 'CSV_INVALID_INPUT');
  for (const d of ['"', '\n', '\r', ',,', '']) {
    assert.throws(() => parseCsv('a', { delimiter: d }), (e) => e.code === 'CSV_INVALID_INPUT');
  }
});

test('csvcheck: lược đồ sai ném CSV_INVALID_SCHEMA trước khi parse', () => {
  const bads = [null, {}, { columns: [] }, S([5]), S([{}]), S([{ name: 'a' }, { name: 'a' }]),
    S([{ name: 'a', type: 'x' }]), S([{ name: 'a', pattern: '(' }]), S([{ name: 'a', enum: [] }]),
    S([{ name: 'a', enum: [1] }]), S([{ name: 'a', type: 'int', min: 'x' }]),
    S([{ name: 'a', type: 'date', max: '2023-02-29' }]), S([{ name: 'a', minLength: -1 }]),
    S([{ name: 'a', maxLength: 1.5 }])];
  for (const b of bads) {
    assert.throws(() => validateCsv(5, b), (e) => e.code === 'CSV_INVALID_SCHEMA');
  }
  assert.throws(() => validateCsv(5, S([{ name: 'a' }])), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck: EMPTY_INPUT, chỉ tiêu đề, lỗi parse', () => {
  const s = S([{ name: 'a' }]);
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('\n\n', s).errors.map((e) => e.code), ['EMPTY_INPUT']);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a\n1\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
});

test('csvcheck: MISSING_COLUMN, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const s = S([{ name: 'z', required: true }, { name: 'b', type: 'int' }, { name: 'a', required: true }]);
  const r = validateCsv('a,b,extra\n,x,1\n1,2\n1,2,3,4\n', s);
  assert.deepEqual(codes(r), ['1:z:MISSING_COLUMN', '2:b:TYPE', '2:a:REQUIRED', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH']);
  assert.equal(r.rowCount, 3);
  const r2 = validateCsv('A,a,a\n1,x,y\n', S([{ name: 'a', type: 'int' }]));
  assert.deepEqual(codes(r2), ['2:a:TYPE']);
  assert.deepEqual(Object.keys(r.errors[0]), ['row', 'column', 'code']);
});

test('csvcheck: kiểu dữ liệu', () => {
  const t = (type, good, bad) => {
    const s = S([{ name: 'v', type }]);
    for (const g of good) assert.equal(validateCsv(`v\n"${g}"`, s).ok, true, `${type} ${g}`);
    for (const b of bad) assert.deepEqual(codes(validateCsv(`v\n"${b}"`, s)), ['2:v:TYPE'], `${type} ${b}`);
  };
  t('int', ['007', '+5', '-0', '12'], ['1.0', '1e3', ' 1', 'a', '9007199254740993']);
  t('number', ['1', '-1.50', '+0.5'], ['5.', '.5', '1e3', 'NaN', 'Infinity', '1,5']);
  t('bool', ['true', 'FALSE', 'True'], ['1', 'yes']);
  t('date', ['2024-02-29', '2000-02-29'], ['2023-02-29', '2024-13-01', '1900-02-29', '0000-01-01', '2024-1-01', '2024-04-31']);
  t('string', ['anything'], []);
});

test('csvcheck: thứ tự kiểm một ô, ô rỗng bỏ qua, ô sai kiểu dừng', () => {
  const s = S([{ name: 'v', enum: ['abc', 'x'], pattern: '^\\d+$', minLength: 5, maxLength: 1 }]);
  assert.deepEqual(codes(validateCsv('v\nabc', s)), ['2:v:PATTERN', '2:v:MIN_LENGTH', '2:v:MAX_LENGTH']);
  const s2 = S([{ name: 'v', enum: ['q'], pattern: '^\\d+$', minLength: 5, maxLength: 1 }]);
  assert.deepEqual(codes(validateCsv('v\nabc', s2)), ['2:v:ENUM', '2:v:PATTERN', '2:v:MIN_LENGTH', '2:v:MAX_LENGTH']);
  assert.equal(validateCsv('v\n""', s).ok, true);
  const n = S([{ name: 'v', type: 'int', min: 5, max: 3, enum: ['q'], pattern: 'z', unique: true }]);
  assert.deepEqual(codes(validateCsv('v\n4', n)), ['2:v:ENUM', '2:v:PATTERN', '2:v:MIN', '2:v:MAX']);
  assert.deepEqual(codes(validateCsv('v\nx', n)), ['2:v:TYPE']);
});

test('csvcheck: min/max, độ dài theo điểm mã, pattern không neo', () => {
  const n = S([{ name: 'v', type: 'number', min: 1, max: 2 }]);
  assert.equal(validateCsv('v\n1\n2\n1.5', n).ok, true);
  assert.deepEqual(codes(validateCsv('v\n0.9\n2.1', n)), ['2:v:MIN', '3:v:MAX']);
  const d = S([{ name: 'v', type: 'date', min: '2024-01-01', max: '2024-12-31' }]);
  assert.deepEqual(codes(validateCsv('v\n2023-12-31\n2024-01-01\n2025-01-01', d)), ['2:v:MIN', '4:v:MAX']);
  assert.equal(validateCsv('v\nzzz', S([{ name: 'v', min: 'a', max: 'b' }])).ok, true);
  assert.equal(validateCsv('v\ntrue', S([{ name: 'v', type: 'bool', min: 1 }])).ok, true);
  const l = S([{ name: 'v', maxLength: 2 }]);
  assert.equal(validateCsv('v\n😀😀', l).ok, true);
  assert.deepEqual(codes(validateCsv('v\n😀😀😀', l)), ['2:v:MAX_LENGTH']);
  assert.equal(validateCsv('v\nxx42yy', S([{ name: 'v', pattern: '\\d+' }])).ok, true);
  assert.deepEqual(codes(validateCsv('v\nxx42yy', S([{ name: 'v', pattern: '^\\d+$' }]))), ['2:v:PATTERN']);
});

test('csvcheck: UNIQUE — nguyên văn, lần đầu hợp lệ, ô lỗi/rỗng/hàng sai độ dài không vào tập', () => {
  const s = S([{ name: 'id', type: 'int', unique: true }, { name: 'o' }]);
  const r = validateCsv('id,o\n1,a\n01,a\n1,a\nx,a\nx,a\n,a\n,a\n2\n2,b\n2,c', s);
  assert.deepEqual(codes(r), ['4:id:UNIQUE', '5:id:TYPE', '6:id:TYPE', '9:null:ROW_LENGTH', '11:id:UNIQUE']);
  assert.equal(r.rowCount, 10);
});

test('csvcheck: số hàng đếm bản ghi, delimiter tùy chọn', () => {
  const s = S([{ name: 'a', type: 'int' }, { name: 'b' }]);
  const r = validateCsv('a;b\n\n"x\ny";q\n\n5;"1\n2"', s, { delimiter: ';' });
  assert.deepEqual(codes(r), ['2:a:TYPE']);
  assert.equal(r.rowCount, 2);
});
