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

const catchErr = (f) => { try { f(); } catch (e) { return e; } return null; };
const S = (...columns) => ({ columns });
const codes = (r) => r.errors.map((e) => e.code);

test('csvcheck parse: dòng trống, kết thúc dòng lẫn lộn, ô rỗng', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\r\n\r'), []);
  assert.deepEqual(parseCsv('a\r\rb\r\n\nc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a,\n  \n""\n'), [['a', ''], ['  '], ['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('csvcheck parse: BOM chỉ bỏ một ký tự, CRLF trong nháy giữ nguyên', () => {
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('"a;b";c', { delimiter: ';' }), [['a;b', 'c']]);
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
});

test('csvcheck parse: lỗi ném kèm code và row', () => {
  let e = catchErr(() => parseCsv('a\n\nb,"x\ny'));
  assert.equal(e.code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(e.row, 2);
  e = catchErr(() => parseCsv('a\nab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE');
  assert.equal(e.row, 2);
  assert.equal(catchErr(() => parseCsv('"ab"c')).code, 'CSV_BAD_QUOTE');
  assert.equal(catchErr(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
  for (const d of ['', 'ab', '"', '\n', '\r', 1]) {
    assert.equal(catchErr(() => parseCsv('a', { delimiter: d })).code, 'CSV_INVALID_INPUT');
  }
});

test('csvcheck schema: lược đồ sai ném CSV_INVALID_SCHEMA trước khi parse', () => {
  const bad = [
    null, {}, { columns: [] }, S(1), S({}), S({ name: 'a' }, { name: 'a' }),
    S({ name: 'a', type: 'x' }), S({ name: 'a', pattern: '(' }), S({ name: 'a', enum: [] }),
    S({ name: 'a', enum: [1] }), S({ name: 'a', type: 'int', min: '1' }),
    S({ name: 'a', type: 'date', max: '2023-02-30' }), S({ name: 'a', minLength: -1 }),
    S({ name: 'a', maxLength: 1.5 }),
  ];
  for (const s of bad) {
    assert.equal(catchErr(() => validateCsv('a\n"', s)).code, 'CSV_INVALID_SCHEMA');
  }
  assert.equal(catchErr(() => validateCsv(1, S({ name: 'a' }))).code, 'CSV_INVALID_INPUT');
});

test('csvcheck validate: lỗi phân tích, tệp rỗng, chỉ tiêu đề', () => {
  const s = S({ name: 'a' });
  assert.deepEqual(validateCsv('a\n1\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('\n\n', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
});

test('csvcheck validate: số hàng tính theo bản ghi, bỏ qua dòng trống', () => {
  const r = validateCsv('a\n\n"1\n2"\n\nx\n', S({ name: 'a', type: 'int' }));
  assert.equal(r.rowCount, 2);
  assert.deepEqual(r.errors, [{ row: 2, column: 'a', code: 'TYPE' }, { row: 3, column: 'a', code: 'TYPE' }]);
});

test('csvcheck validate: MISSING_COLUMN, ROW_LENGTH, cột thừa, tiêu đề lặp, phân biệt hoa thường', () => {
  const s = S({ name: 'b', required: true }, { name: 'a', required: true }, { name: 'z', required: true });
  const r = validateCsv('a,b,ignored\n1,2,3\n1,2\n1,2,3,4\n,,\n', s);
  assert.deepEqual(r.errors, [
    { row: 1, column: 'z', code: 'MISSING_COLUMN' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: null, code: 'ROW_LENGTH' },
    { row: 5, column: 'b', code: 'REQUIRED' },
    { row: 5, column: 'a', code: 'REQUIRED' },
  ]);
  assert.deepEqual(validateCsv('A\n1', S({ name: 'a' })).errors, [{ row: 1, column: 'a', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(validateCsv(' a\n1', S({ name: 'a' })).errors, [{ row: 1, column: 'a', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(validateCsv('a,a\nx,5', S({ name: 'a', type: 'int' })).errors, [{ row: 2, column: 'a', code: 'TYPE' }]);
});

test('csvcheck validate: hàng sai độ dài không ghi vào UNIQUE', () => {
  const r = validateCsv('a,b\n1\n1,x\n1,y\n', S({ name: 'a', unique: true }));
  assert.deepEqual(r.errors, [{ row: 2, column: null, code: 'ROW_LENGTH' }, { row: 4, column: 'a', code: 'UNIQUE' }]);
});

test('csvcheck validate: kiểu dữ liệu', () => {
  const t = (type, good, bad) => {
    const s = S({ name: 'v', type });
    for (const g of good) assert.equal(validateCsv(`v\n"${g}"`, s).ok, true, `${type} ${g}`);
    for (const b of bad) assert.deepEqual(validateCsv(`v\n"${b}"`, s).errors, [{ row: 2, column: 'v', code: 'TYPE' }], `${type} ${b}`);
  };
  t('int', ['007', '+5', '-0', '9007199254740991'], ['1.0', '1e3', ' 1', '9007199254740993', 'a']);
  t('number', ['1', '-1.50', '+0.5'], ['5.', '.5', '1e3', 'NaN', 'Infinity', '1,5', '1'.repeat(400)]);
  t('bool', ['true', 'FALSE', 'True'], ['1', 'yes', ' true']);
  t('date', ['2024-02-29', '2000-02-29', '0001-01-01'], ['2023-02-29', '1900-02-29', '2024-13-01', '2024-00-10', '2024-04-31', '0000-01-01', '2024-1-01', '2024-01-01 ']);
});

test('csvcheck validate: thứ tự kiểm một ô, nhiều lỗi không dừng nhau', () => {
  const s = S({ name: 'v', enum: ['abcdefgh'], pattern: '^z', minLength: 5, maxLength: 2, unique: true });
  assert.deepEqual(codes(validateCsv('v\nabc\nabc\n', s)),
    ['ENUM', 'PATTERN', 'MIN_LENGTH', 'MAX_LENGTH', 'ENUM', 'PATTERN', 'MIN_LENGTH', 'MAX_LENGTH', 'UNIQUE']);
  const s2 = S({ name: 'n', type: 'int', enum: ['5', '50'], pattern: '^1', minLength: 3, maxLength: 1, min: 10, max: 0 });
  assert.deepEqual(codes(validateCsv('n\n5', s2)), ['PATTERN', 'MIN_LENGTH', 'MIN', 'MAX']);
  assert.deepEqual(codes(validateCsv('n\n50', s2)), ['PATTERN', 'MIN_LENGTH', 'MAX_LENGTH', 'MAX']);
  assert.deepEqual(codes(validateCsv('n\n7', s2)), ['ENUM', 'PATTERN', 'MIN_LENGTH', 'MIN', 'MAX']);
});

test('csvcheck validate: TYPE dừng, không vào UNIQUE; ô rỗng bỏ qua ràng buộc', () => {
  const s = S({ name: 'v', type: 'int', unique: true, min: 5, enum: ['1'] });
  assert.deepEqual(validateCsv('v\nx\nx\n1\n1\n', s).errors, [
    { row: 2, column: 'v', code: 'TYPE' }, { row: 3, column: 'v', code: 'TYPE' },
    { row: 4, column: 'v', code: 'MIN' }, { row: 5, column: 'v', code: 'MIN' }, { row: 5, column: 'v', code: 'UNIQUE' },
  ]);
  const s2 = S({ name: 'v', unique: true, enum: ['q'], pattern: '^q', minLength: 3 });
  assert.deepEqual(validateCsv('v\n\n\n', s2).errors, []);
  assert.deepEqual(validateCsv('v,w\n,1\n"",2\n', S({ name: 'v', unique: true, minLength: 3 })).errors, []);
  assert.equal(validateCsv('v,w\n,1\n"",2\n', S({ name: 'v', required: true })).errors.length, 2);
});

test('csvcheck validate: pattern không neo, min/max, độ dài theo điểm mã, unique nguyên văn', () => {
  assert.equal(validateCsv('v\nxabcx', S({ name: 'v', pattern: 'abc' })).ok, true);
  assert.equal(validateCsv('v\nxabcx', S({ name: 'v', pattern: '^abc$' })).ok, false);
  assert.equal(validateCsv('v\nabc', S({ name: 'v', min: 5, max: 1 })).ok, true);
  assert.equal(validateCsv('v\ntrue', S({ name: 'v', type: 'bool', min: 5 })).ok, true);
  const s = S({ name: 'v', type: 'number', min: 1.5, max: 2.5 });
  assert.equal(validateCsv('v\n1.5\n2.5', s).ok, true);
  assert.deepEqual(codes(validateCsv('v\n1.4\n2.6', s)), ['MIN', 'MAX']);
  const d = S({ name: 'v', type: 'date', min: '2024-01-01', max: '2024-12-31' });
  assert.equal(validateCsv('v\n2024-01-01\n2024-12-31', d).ok, true);
  assert.deepEqual(codes(validateCsv('v\n2023-12-31\n2025-01-01', d)), ['MIN', 'MAX']);
  assert.equal(validateCsv('v\n😀😀', S({ name: 'v', maxLength: 2, minLength: 2 })).ok, true);
  assert.equal(validateCsv('v\n007\n7', S({ name: 'v', type: 'int', unique: true })).ok, true);
  assert.equal(validateCsv('v\nA\nA', S({ name: 'v', unique: true })).errors[0].code, 'UNIQUE');
});

test('csvcheck validate: delimiter được chuyển cho parse; lỗi có đúng 3 khóa', () => {
  const r = validateCsv('a;b\n1;x', S({ name: 'a', type: 'bool' }), { delimiter: ';' });
  assert.deepEqual(r.errors, [{ row: 2, column: 'a', code: 'TYPE' }]);
  assert.deepEqual(Object.keys(r.errors[0]).sort(), ['code', 'column', 'row']);
});
