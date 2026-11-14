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
const v = (text, cols, o) => validateCsv(text, { columns: cols }, o);

test('parse: dòng trống, dòng "", dấu cách, \\r đơn, BOM kép, rỗng', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a\n\n\nb\r\r'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('a\n""\n  \n'), [['a'], [''], ['  ']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parse: lỗi và row', () => {
  assert.throws(() => parseCsv(5), { code: 'CSV_INVALID_INPUT' });
  for (const d of ['"', '\n', '\r', ',,', '']) assert.throws(() => parseCsv('a', { delimiter: d }), { code: 'CSV_INVALID_INPUT' });
  assert.throws(() => parseCsv('a\n\nb,"x\ny'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
});

test('validate: EMPTY_INPUT, UNTERMINATED_QUOTE, BAD_QUOTE', () => {
  const c = [{ name: 'a' }];
  assert.deepEqual(v('', c), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(v('a\n1\n"x', c).errors, [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(v('a\nx"y', c).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.equal(v('a\nx"y', c).rowCount, 0);
  assert.throws(() => v(1, c), { code: 'CSV_INVALID_INPUT' });
});

test('validate: MISSING_COLUMN, header-only, header phân biệt hoa thường', () => {
  const c = [{ name: 'a', required: true }, { name: 'b', required: true }];
  assert.deepEqual(v('a,B\n1,2', c).errors, [{ row: 1, column: 'b', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(v('a,b', c), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(v('a,a\n,x', [{ name: 'a', required: true }]).errors, [{ row: 2, column: 'a', code: 'REQUIRED' }]);
});

test('validate: ROW_LENGTH đứng một mình, không vào UNIQUE', () => {
  const c = [{ name: 'a', unique: true, required: true }, { name: 'b' }];
  const r = v('a,b\n1\n1,2,3\n1,x\n1,y', c);
  assert.deepEqual(codes(r), ['2:null:ROW_LENGTH', '3:null:ROW_LENGTH', '5:a:UNIQUE']);
  assert.equal(r.rowCount, 4);
});

test('validate: REQUIRED và ô rỗng bỏ qua ràng buộc', () => {
  const c = [{ name: 'n', type: 'int', min: 5, enum: ['9'], unique: true }, { name: 's', required: true }];
  assert.deepEqual(codes(v('n,s\n,\n,x\n', c)), ['2:s:REQUIRED']);
});

test('validate: TYPE từng kiểu và dừng sau TYPE', () => {
  const t = (type, ok, bad) => {
    for (const s of ok) assert.equal(v(`a\n${s}`, [{ name: 'a', type }]).ok, true, `${type} ${s}`);
    for (const s of bad) assert.deepEqual(codes(v(`a\n${s}`, [{ name: 'a', type }])), ['2:a:TYPE'], `${type} ${s}`);
  };
  t('int', ['007', '+5', '-0'], ['1.0', '1e3', ' 1', '9007199254740993']);
  t('number', ['1.5', '-2', '+3.0'], ['5.', '.5', '1e3', 'NaN', 'Infinity']);
  t('bool', ['true', 'TRUE', 'False'], ['1', 'yes']);
  t('date', ['2024-02-29'], ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-1']);
  const r = v('a\nx', [{ name: 'a', type: 'int', enum: ['1'], pattern: '^1$', minLength: 5, min: 3, unique: true }]);
  assert.deepEqual(codes(r), ['2:a:TYPE']);
  assert.equal(v('a\nx\nx', [{ name: 'a', type: 'int', unique: true }]).errors.length, 2);
});

test('validate: ENUM, PATTERN (không neo), độ dài theo điểm mã', () => {
  assert.deepEqual(codes(v('a\nB\nb', [{ name: 'a', enum: ['b'] }])), ['2:a:ENUM']);
  assert.deepEqual(codes(v('a\nxyz\nq', [{ name: 'a', pattern: 'y' }])), ['3:a:PATTERN']);
  assert.deepEqual(codes(v('a\nab\n😀😀😀\nabcd', [{ name: 'a', minLength: 3, maxLength: 3 }])), ['2:a:MIN_LENGTH', '4:a:MAX_LENGTH']);
});

test('validate: MIN/MAX int, number, date; bỏ qua với string/bool', () => {
  assert.deepEqual(codes(v('a\n0\n1\n5\n6', [{ name: 'a', type: 'int', min: 1, max: 5 }])), ['2:a:MIN', '5:a:MAX']);
  assert.deepEqual(codes(v('a\n0.5\n2.5', [{ name: 'a', type: 'number', min: 1, max: 2 }])), ['2:a:MIN', '3:a:MAX']);
  assert.deepEqual(codes(v('a\n2024-01-01\n2024-06-01\n2025-01-01', [{ name: 'a', type: 'date', min: '2024-02-01', max: '2024-12-31' }])), ['2:a:MIN', '4:a:MAX']);
  assert.equal(v('a\nzzz', [{ name: 'a', min: 'b', max: 'c' }]).ok, true);
});

test('validate: UNIQUE nguyên văn, lần đầu hợp lệ', () => {
  assert.deepEqual(codes(v('a\n1\n01\n1\n1', [{ name: 'a', unique: true }])), ['4:a:UNIQUE', '5:a:UNIQUE']);
});

test('validate: thứ tự lỗi theo lược đồ rồi theo thứ tự kiểm', () => {
  const c = [
    { name: 'z', enum: ['ok'], pattern: '^o', minLength: 3, maxLength: 1, unique: true },
    { name: 'a', type: 'int', min: 10, max: 0 },
  ];
  // tệp: cột a đứng trước z, nhưng lỗi z phải đứng trước a
  const r = v('a,z\n5,ok\n5,no\n', c);
  assert.deepEqual(codes(r), [
    '2:z:MIN_LENGTH', '2:z:MAX_LENGTH', '2:a:MIN', '2:a:MAX',
    '3:z:ENUM', '3:z:PATTERN', '3:z:MIN_LENGTH', '3:z:MAX_LENGTH', '3:a:MIN', '3:a:MAX',
  ]);
});

test('validate: lược đồ sai ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: 'x' }] },
    { columns: [{ name: 'a', type: 'date', max: '2023-02-30' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bad) assert.throws(() => validateCsv(5, s), { code: 'CSV_INVALID_SCHEMA' });
});

test('validate: delimiter tùy chọn và xuống dòng trong ô tính một hàng', () => {
  const r = v('a;b\n"x\ny";1\n;', [{ name: 'a', required: true }, { name: 'b', type: 'int' }], { delimiter: ';' });
  assert.deepEqual(codes(r), ['3:a:REQUIRED']);
  assert.equal(r.rowCount, 2);
});
