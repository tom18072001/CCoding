import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const code = (f, c) => assert.throws(f, (e) => e.code === c);

test('parseCsv quy tắc chi tiết', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\n'), []);
  assert.deepEqual(parseCsv('a,\n'), [['a', '']]);
  assert.deepEqual(parseCsv('a\r\r\nb'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
  code(() => parseCsv('a', { delimiter: '"' }), 'CSV_INVALID_INPUT');
  code(() => parseCsv('a', { delimiter: ',,' }), 'CSV_INVALID_INPUT');
  code(() => parseCsv(5), 'CSV_INVALID_INPUT');
  code(() => parseCsv('ab"c'), 'CSV_BAD_QUOTE');
  code(() => parseCsv('"ab"c'), 'CSV_BAD_QUOTE');
  code(() => parseCsv('"ab'), 'CSV_UNTERMINATED_QUOTE');
  assert.throws(() => parseCsv('a\n\nb,"x'), (e) => e.row === 2);
});
const schema = { columns: [
  { name: 'id', type: 'int', required: true, unique: true, min: 1 },
  { name: 'name', maxLength: 5 },
] };
test('validateCsv ví dụ SPEC', () => {
  assert.deepEqual(validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema), {
    ok: false, rowCount: 4, errors: [
      { row: 3, column: 'id', code: 'UNIQUE' },
      { row: 3, column: 'name', code: 'MAX_LENGTH' },
      { row: 4, column: 'id', code: 'TYPE' },
      { row: 5, column: 'id', code: 'REQUIRED' },
    ],
  });
});
test('validateCsv các trường hợp khác', () => {
  assert.deepEqual(validateCsv('', schema).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('id,name', schema), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('id,name\n"a', schema).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('id\n1', schema).errors, [{ row: 1, column: 'name', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(validateCsv('id,name\n1\n2,a,b', schema).errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' }, { row: 3, column: null, code: 'ROW_LENGTH' }]);
  const s2 = { columns: [{ name: 'a', required: true }, { name: 'b', required: true }] };
  assert.deepEqual(validateCsv('b,a\n,\n', s2).errors.map((e) => e.column), ['a', 'b']);
  const s3 = { columns: [{ name: 'x', enum: ['aa'], pattern: '^z', minLength: 5, maxLength: 1 }] };
  assert.deepEqual(validateCsv('x\nab', s3).errors.map((e) => e.code), ['ENUM', 'PATTERN', 'MIN_LENGTH', 'MAX_LENGTH']);
  const s4 = { columns: [{ name: 'n', type: 'number', min: 0, max: 1 }, { name: 'd', type: 'date', min: '2024-01-01' }, { name: 'b', type: 'bool' }, { name: 'i', type: 'int' }] };
  const r = validateCsv('n,d,b,i\n2,2023-12-31,TRUE,007\n.5,2023-02-29,yes,1.0\n-0.5,2024-02-29,false,-0', s4);
  assert.deepEqual(r.errors.map((e) => `${e.row}${e.column}${e.code}`),
    ['2nMAX', '2dMIN', '3nTYPE', '3dTYPE', '3bTYPE', '3iTYPE', '4nMIN']);
  const s5 = { columns: [{ name: 'k', unique: true }] };
  assert.deepEqual(validateCsv('k\n1\n01\n1\n\n', s5).errors, [{ row: 4, column: 'k', code: 'UNIQUE' }]);
});
test('schema sai', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] }, { columns: [{ name: 'a', type: 'date', max: '2023-02-30' }] },
    { columns: [{ name: 'a', maxLength: -1 }] }];
  for (const s of bad) code(() => validateCsv('', s), 'CSV_INVALID_SCHEMA');
  code(() => validateCsv(5, schema), 'CSV_INVALID_INPUT');
});
