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
const S = (cols) => ({ columns: cols });
const codes = (r) => r.errors.map((e) => `${e.row}:${e.column}:${e.code}`);

test('csvcheck parse: BOM chỉ bỏ một, kết thúc dòng lẫn lộn, dòng cuối', () => {
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a\rb\r\nc\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a\n'), [['a']]);
  assert.deepEqual(parseCsv(''), []);
});

test('csvcheck parse: dòng trống, dấu cách, "" và dấu phân cách cuối', () => {
  assert.deepEqual(parseCsv('a\n\n\r\nb\n\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('csvcheck parse: xuống dòng trong nháy giữ nguyên', () => {
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('"a;b";c', { delimiter: ';' }), [['a;b', 'c']]);
});

test('csvcheck parse: lỗi và row', () => {
  assert.throws(() => parseCsv('a\nb"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), code('CSV_BAD_QUOTE'));
  assert.throws(() => parseCsv('a\n\n"x\ny'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv(5), code('CSV_INVALID_INPUT'));
  for (const d of ['"', '\n', '\r', 'ab', '']) {
    assert.throws(() => parseCsv('a', { delimiter: d }), code('CSV_INVALID_INPUT'));
  }
});

test('csvcheck validate: lỗi cấp tệp', () => {
  const s = S([{ name: 'a' }]);
  assert.deepEqual(validateCsv('', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('\n\n', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n1\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nb"c', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('a', s), { ok: true, rowCount: 0, errors: [] });
  assert.throws(() => validateCsv(1, s), code('CSV_INVALID_INPUT'));
});

test('csvcheck validate: MISSING_COLUMN, ROW_LENGTH, tiêu đề lặp', () => {
  const s = S([{ name: 'a', required: true, unique: true }, { name: 'zz', required: true }]);
  const r = validateCsv('a,b\n1,2\n1\n1,2,3\n1,x\n', s);
  assert.deepEqual(codes(r), ['1:zz:MISSING_COLUMN', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH', '5:a:UNIQUE']);
  assert.deepEqual(codes(validateCsv('a,b\n1,2\n1\n1,2,3\n', s)), ['1:zz:MISSING_COLUMN', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH']);
  assert.deepEqual(codes(validateCsv('A,a,a\n1,,2\n', S([{ name: 'a', required: true }]))), ['2:a:REQUIRED']);
});

test('csvcheck validate: thứ tự cột theo lược đồ, nhiều lỗi một ô', () => {
  const s = S([
    { name: 'b', enum: ['x'], pattern: '^y', minLength: 3, maxLength: 1, unique: true },
    { name: 'a', type: 'int', min: 5 },
  ]);
  const r = validateCsv('a,b\n3,q\n3,q\n', s);
  assert.deepEqual(codes(r), [
    '2:b:ENUM', '2:b:PATTERN', '2:b:MIN_LENGTH', '2:a:MIN',
    '3:b:ENUM', '3:b:PATTERN', '3:b:MIN_LENGTH', '3:b:UNIQUE', '3:a:MIN',
  ]);
  const t = validateCsv('a\n9\n', S([{ name: 'a', type: 'int', maxLength: 0, min: 10, max: 1 }]));
  assert.deepEqual(codes(t), ['2:a:MAX_LENGTH', '2:a:MIN', '2:a:MAX']);
});

test('csvcheck validate: TYPE dừng, ô rỗng, unique theo văn bản gốc', () => {
  const s = S([{ name: 'n', type: 'int', min: 0, max: 10, unique: true }]);
  const r = validateCsv('n\n11\n-1\nx\nx\n\n""\n1\n01\n1\n', s);
  // dòng trống bị bỏ; "" là bản ghi (hàng 6) hợp lệ vì không required
  assert.deepEqual(codes(r), ['2:n:MAX', '3:n:MIN', '4:n:TYPE', '5:n:TYPE', '9:n:UNIQUE']);
  assert.equal(r.rowCount, 8);
});

test('csvcheck validate: kiểu', () => {
  const ok = (type, v) => validateCsv(`c\n${v}`, S([{ name: 'c', type }])).ok;
  for (const v of ['007', '+5', '-0']) assert.equal(ok('int', v), true, v);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993']) assert.equal(ok('int', v), false, v);
  for (const v of ['1.5', '-2', '+3.25']) assert.equal(ok('number', v), true, v);
  for (const v of ['5.', '.5', 'NaN', 'Infinity', '1e3']) assert.equal(ok('number', v), false, v);
  for (const v of ['true', 'TRUE', 'False']) assert.equal(ok('bool', v), true, v);
  for (const v of ['1', 'yes']) assert.equal(ok('bool', v), false, v);
  for (const v of ['2024-02-29', '2000-02-29']) assert.equal(ok('date', v), true, v);
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01', '1900-02-29', '2024-1-01', '2024-04-31']) {
    assert.equal(ok('date', v), false, v);
  }
});

test('csvcheck validate: min/max date, string bỏ qua, độ dài theo điểm mã, pattern, enum', () => {
  const d = S([{ name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' }]);
  assert.deepEqual(codes(validateCsv('d\n2023-12-31\n2025-01-01\n2024-01-01\n', d)), ['2:d:MIN', '3:d:MAX']);
  assert.equal(validateCsv('s\nabc', S([{ name: 's', min: 100, max: 1 }])).ok, true);
  assert.equal(validateCsv('s\n\u{1F600}\u{1F600}', S([{ name: 's', maxLength: 2 }])).ok, true);
  assert.deepEqual(codes(validateCsv('s\n\u{1F600}', S([{ name: 's', minLength: 2 }]))), ['2:s:MIN_LENGTH']);
  const p = S([{ name: 'p', pattern: 'b', enum: ['abc', 'ABC', 'xbx'] }]);
  assert.deepEqual(codes(validateCsv('p\nabc\nABC\n\nxbx\nzzz\n', p)), ['3:p:PATTERN', '5:p:ENUM', '5:p:PATTERN']);
});

test('csvcheck validate: lược đồ sai ném CSV_INVALID_SCHEMA trước khi parse', () => {
  const bads = [
    null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'number', max: NaN }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const b of bads) assert.throws(() => validateCsv(5, b), code('CSV_INVALID_SCHEMA'));
});
