import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const thrown = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

test('parseCsv: biên', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,\n'), [['a', '']]);
  assert.deepEqual(parseCsv('a\r\n\r\n\nb\rc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('  \n""\n'), [['  '], ['']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
  assert.equal(thrown(() => parseCsv('a\n"b')).code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(thrown(() => parseCsv('a\n"b')).row, 2);
  assert.equal(thrown(() => parseCsv('ab"c')).code, 'CSV_BAD_QUOTE');
  assert.equal(thrown(() => parseCsv('"ab"c')).code, 'CSV_BAD_QUOTE');
  assert.equal(thrown(() => parseCsv(1)).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv('a', { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv('a', { delimiter: ';;' })).code, 'CSV_INVALID_INPUT');
});

test('validateCsv: ví dụ spec', () => {
  const schema = {
    columns: [
      { name: 'id', type: 'int', required: true, unique: true, min: 1 },
      { name: 'name', maxLength: 5 },
    ],
  };
  assert.deepEqual(validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema), {
    ok: false,
    rowCount: 4,
    errors: [
      { row: 3, column: 'id', code: 'UNIQUE' },
      { row: 3, column: 'name', code: 'MAX_LENGTH' },
      { row: 4, column: 'id', code: 'TYPE' },
      { row: 5, column: 'id', code: 'REQUIRED' },
    ],
  });
});

test('validateCsv: tệp rỗng, lỗi phân tích, thiếu cột, độ dài hàng', () => {
  const schema = { columns: [{ name: 'a', required: true }, { name: 'b', type: 'int' }] };
  assert.deepEqual(validateCsv('', schema).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a,b\n1,"x', schema), {
    ok: false,
    rowCount: 0,
    errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }],
  });
  assert.deepEqual(validateCsv('a\n\n', schema).errors, [{ row: 1, column: 'b', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(validateCsv('a,b\n', schema), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a,b\n1\n1,2,3\n,x\n', schema).errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: 'a', code: 'REQUIRED' },
    { row: 4, column: 'b', code: 'TYPE' },
  ]);
});

test('validateCsv: kiểu và ràng buộc', () => {
  const col = (c) => ({ columns: [{ name: 'v', ...c }] });
  const errs = (t, c) => validateCsv('v\n' + t + '\n', col(c)).errors.map((e) => e.code);
  assert.deepEqual(errs('007', { type: 'int' }), []);
  assert.deepEqual(['1.0', '1e3', '9007199254740993'].map((x) => errs(x, { type: 'int' })[0]), ['TYPE', 'TYPE', 'TYPE']);
  assert.deepEqual(['5.', '.5', 'NaN'].map((x) => errs(x, { type: 'number' })[0]), ['TYPE', 'TYPE', 'TYPE']);
  assert.deepEqual(errs('TRUE', { type: 'bool' }), []);
  assert.deepEqual(errs('yes', { type: 'bool' }), ['TYPE']);
  assert.deepEqual(errs('2024-02-29', { type: 'date' }), []);
  assert.deepEqual(errs('0000-01-01', { type: 'date' }), ['TYPE']);
  assert.deepEqual(errs('2023-01-01', { type: 'date', min: '2024-01-01' }), ['MIN']);
  assert.deepEqual(errs('abc', { enum: ['x'], pattern: '^x$', minLength: 5 }), ['ENUM', 'PATTERN', 'MIN_LENGTH']);
  assert.deepEqual(errs('5', { type: 'int', min: 6, max: 4 }), ['MIN', 'MAX']);
  assert.deepEqual(errs('zzz', { min: 6 }), []);
  assert.deepEqual(errs('😀😀', { maxLength: 2 }), []);
  assert.deepEqual(validateCsv('v\n1\n01\n1\n', col({ unique: true })).errors, [
    { row: 4, column: 'v', code: 'UNIQUE' },
  ]);
});

test('validateCsv: thứ tự theo lược đồ, lược đồ sai', () => {
  const schema = { columns: [{ name: 'b', required: true }, { name: 'a', required: true }] };
  assert.deepEqual(validateCsv('a,b\n,\n', schema).errors.map((e) => e.column), ['b', 'a']);
  const bads = [
    null,
    {},
    { columns: [] },
    { columns: [1] },
    { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', type: 'int', min: 'x' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
  ];
  for (const bad of bads) assert.equal(thrown(() => validateCsv('a\n1', bad)).code, 'CSV_INVALID_SCHEMA');
});
