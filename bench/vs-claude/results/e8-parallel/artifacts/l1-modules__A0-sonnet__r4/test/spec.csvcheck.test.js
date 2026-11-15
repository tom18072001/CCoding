import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const code = (fn, c, row) => assert.throws(fn, (e) => e.code === c && (row === undefined || e.row === row));

test('parseCsv: biên', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\r\n\r\n\nb\rc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('  \n""\n'), [['  '], ['']]);
  assert.deepEqual(parseCsv('"a\r\nb",x'), [['a\r\nb', 'x']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('a|b', { delimiter: '|' }), [['a', 'b']]);
  code(() => parseCsv(5), 'CSV_INVALID_INPUT');
  for (const d of ['"', '\n', 'ab', '']) code(() => parseCsv('a', { delimiter: d }), 'CSV_INVALID_INPUT');
  code(() => parseCsv('a\n"b'), 'CSV_UNTERMINATED_QUOTE', 2);
  code(() => parseCsv('a\n\nab"c'), 'CSV_BAD_QUOTE', 2);
  code(() => parseCsv('"ab"c'), 'CSV_BAD_QUOTE', 1);
});

const schema = { columns: [
  { name: 'id', type: 'int', required: true, unique: true, min: 1 },
  { name: 'name', maxLength: 5 },
] };

test('validateCsv: ví dụ đặc tả', () => {
  assert.deepEqual(validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema), {
    ok: false, rowCount: 4, errors: [
      { row: 3, column: 'id', code: 'UNIQUE' },
      { row: 3, column: 'name', code: 'MAX_LENGTH' },
      { row: 4, column: 'id', code: 'TYPE' },
      { row: 5, column: 'id', code: 'REQUIRED' },
    ],
  });
});

test('validateCsv: tệp, tiêu đề, độ dài hàng', () => {
  assert.deepEqual(validateCsv('', schema).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('\n\n', schema).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('id,name', schema), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('id,"x', schema), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('id,name\n1,"a"b', schema).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('id\n1\nx\n', schema).errors, [{ row: 1, column: 'name', code: 'MISSING_COLUMN' }, { row: 3, column: 'id', code: 'TYPE' }]);
  assert.deepEqual(validateCsv('id,name\n1\n1,a,b\n1,a\n1,a', schema).errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 5, column: 'id', code: 'UNIQUE' },
  ]);
  assert.deepEqual(validateCsv('name,id\nA,1\n', schema).errors, []);
  assert.deepEqual(validateCsv('ID,id,id\n,1,2\n', schema).errors, [{ row: 1, column: 'name', code: 'MISSING_COLUMN' }]);
  code(() => validateCsv(1, schema), 'CSV_INVALID_INPUT');
});

test('validateCsv: thứ tự theo lược đồ, kiểu và ràng buộc', () => {
  const s = { columns: [
    { name: 'b', type: 'int', min: 2, max: 5 },
    { name: 'a', enum: ['x', 'y'], pattern: '^z', minLength: 3, maxLength: 1 },
    { name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' },
    { name: 'f', type: 'bool' },
    { name: 'n', type: 'number', unique: true },
  ] };
  const r = validateCsv('a,b,d,f,n\nq,1,2024-02-30,TRUE,1.5\nx,9,2025-01-01,yes,1.5\nx,+3,2023-12-31,false,1e3\n,,,,\n,,,,\n', s);
  assert.deepEqual(r.errors.map((e) => `${e.row}${e.column}${e.code}`), [
    '2bMIN', '2aENUM', '2aPATTERN', '2aMIN_LENGTH', '2dTYPE',
    '3bMAX', '3aPATTERN', '3aMIN_LENGTH', '3dMAX', '3fTYPE', '3nUNIQUE',
    '4aPATTERN', '4aMIN_LENGTH', '4dMIN', '4nTYPE',
  ].map((x) => x));
});

test('validateCsv: kiểu', () => {
  const one = (type, ...rows) => validateCsv('v\n' + rows.join('\n') + '\n', { columns: [{ name: 'v', type }] }).errors.length;
  assert.equal(one('int', '007', '+5', '-0'), 0);
  assert.equal(one('int', '1.0', ' 1', '1e3', '9007199254740993'), 4);
  assert.equal(one('number', '1.5', '-2', '+3.25'), 0);
  assert.equal(one('number', '5.', '.5', 'NaN', 'Infinity', '1e3'), 5);
  assert.equal(one('bool', 'TRUE', 'false', 'True'), 0);
  assert.equal(one('bool', '1', 'yes'), 2);
  assert.equal(one('date', '2024-02-29'), 0);
  assert.equal(one('date', '2023-02-29', '2024-13-01', '0000-01-01', '2024-1-1'), 4);
  assert.equal(validateCsv('v\n😀😀\n', { columns: [{ name: 'v', maxLength: 2 }] }).ok, true);
  assert.equal(validateCsv('v\nabc\n', { columns: [{ name: 'v', min: 5 }] }).ok, true);
  assert.equal(validateCsv('v\n1\n01\n', { columns: [{ name: 'v', unique: true }] }).ok, true);
});

test('validateCsv: lược đồ sai', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] }, { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'date', max: '2024-02-30' }] }, { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] }];
  for (const s of bad) code(() => validateCsv('a\n1', s), 'CSV_INVALID_SCHEMA');
  code(() => validateCsv('a"', {}), 'CSV_INVALID_SCHEMA');
});
