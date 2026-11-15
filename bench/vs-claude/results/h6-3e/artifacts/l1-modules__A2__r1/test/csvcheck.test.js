import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const throwsCode = (fn, code, row) => assert.throws(fn, (e) => e.code === code && (row === undefined || e.row === row));

test('parseCsv', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
  assert.deepEqual(parseCsv('﻿a;b', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\r\n\r\n\n  \n""\nb\rc'), [['a'], ['  '], [''], ['b'], ['c']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('a,\n'), [['a', '']]);
  throwsCode(() => parseCsv('a\n"abc'), 'CSV_UNTERMINATED_QUOTE', 2);
  throwsCode(() => parseCsv('ab"c'), 'CSV_BAD_QUOTE', 1);
  throwsCode(() => parseCsv('a\n"ab"c'), 'CSV_BAD_QUOTE', 2);
  throwsCode(() => parseCsv(5), 'CSV_INVALID_INPUT');
  throwsCode(() => parseCsv('a', { delimiter: '"' }), 'CSV_INVALID_INPUT');
  throwsCode(() => parseCsv('a', { delimiter: ';;' }), 'CSV_INVALID_INPUT');
});

const schema = { columns: [
  { name: 'id', type: 'int', required: true, unique: true, min: 1 },
  { name: 'name', maxLength: 5 },
] };

test('validateCsv ví dụ đặc tả', () => {
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
  assert.deepEqual(validateCsv('', schema), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('id,name\n', schema), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('id,name\n1,"a', schema).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('id,name\n1,a"', schema).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('id\n1\n1,2\n1\n', schema).errors, [
    { row: 1, column: 'name', code: 'MISSING_COLUMN' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: 'id', code: 'UNIQUE' },
  ]);
  assert.deepEqual(validateCsv('id,name\n1\n1,a\n', schema).errors, [{ row: 2, column: null, code: 'ROW_LENGTH' }]);
  const s2 = { columns: [
    { name: 'b', type: 'int', min: 5, max: 10, enum: ['1', '20'], pattern: '^9$' },
    { name: 'a', pattern: 'x', minLength: 3, maxLength: 1 },
  ] };
  assert.deepEqual(validateCsv('a,b\nzz,20\n', s2).errors.map((e) => `${e.column}:${e.code}`),
    ['b:PATTERN', 'b:MAX', 'a:PATTERN', 'a:MIN_LENGTH', 'a:MAX_LENGTH']);
  assert.deepEqual(validateCsv('a\nxyz\n', { columns: [{ name: 'a', pattern: 'y' }] }).errors, []);
  const t = (type, ok, bad) => {
    const sc = { columns: [{ name: 'v', type }] };
    for (const v of ok) assert.equal(validateCsv(`v\n"${v}"\n`, sc).ok, true, `${type} ${v}`);
    for (const v of bad) assert.equal(validateCsv(`v\n"${v}"\n`, sc).ok, false, `${type} ${v}`);
  };
  t('int', ['007', '+5', '-0'], ['1.0', '1e3', ' 1', '9007199254740993']);
  t('number', ['1', '-1.50', '+0.5'], ['5.', '.5', '1e3', 'NaN']);
  t('bool', ['true', 'FALSE', 'True'], ['1', 'yes']);
  t('date', ['2024-02-29', '2000-01-01'], ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-1']);
  assert.deepEqual(validateCsv('d\n2020-01-01\n', { columns: [{ name: 'd', type: 'date', min: '2021-01-01' }] }).errors,
    [{ row: 2, column: 'd', code: 'MIN' }]);
  assert.equal(validateCsv('v\n5\n', { columns: [{ name: 'v', min: 10 }] }).ok, true);
  assert.equal(validateCsv('ID,name\n1,a\n', schema).errors[0].code, 'MISSING_COLUMN');
  assert.equal(validateCsv('v\n\n""\n', { columns: [{ name: 'v', minLength: 3, pattern: 'x', enum: ['q'], unique: true }] }).ok, true);
  assert.equal(validateCsv('v\n😀😀\n', { columns: [{ name: 'v', maxLength: 2 }] }).ok, true);
});

test('lược đồ sai', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] }, { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] }];
  for (const s of bad) throwsCode(() => validateCsv('a\n1', s), 'CSV_INVALID_SCHEMA');
  throwsCode(() => validateCsv(5, schema), 'CSV_INVALID_INPUT');
});
