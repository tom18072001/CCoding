import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const thrown = (fn) => { try { fn(); } catch (e) { return e; } return {}; };

test('parseCsv', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
  assert.deepEqual(parseCsv('﻿a;b', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,\r\r\n\n  \n""\r'), [['a', ''], ['  '], ['']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parseCsv lỗi', () => {
  assert.equal(thrown(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv('a', { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv('a', { delimiter: ',,' })).code, 'CSV_INVALID_INPUT');
  const e = thrown(() => parseCsv('a\nb\n"x'));
  assert.equal(e.code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(e.row, 3);
  assert.equal(thrown(() => parseCsv('ab"c')).code, 'CSV_BAD_QUOTE');
  const e2 = thrown(() => parseCsv('a\n\n"ab"c'));
  assert.equal(e2.code, 'CSV_BAD_QUOTE');
  assert.equal(e2.row, 2);
});

test('validateCsv ví dụ trong đặc tả', () => {
  const schema = { columns: [
    { name: 'id', type: 'int', required: true, unique: true, min: 1 },
    { name: 'name', maxLength: 5 },
  ] };
  assert.deepEqual(validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema), {
    ok: false, rowCount: 4, errors: [
      { row: 3, column: 'id', code: 'UNIQUE' },
      { row: 3, column: 'name', code: 'MAX_LENGTH' },
      { row: 4, column: 'id', code: 'TYPE' },
      { row: 5, column: 'id', code: 'REQUIRED' },
    ],
  });
});

test('validateCsv: tệp/hàng/cột', () => {
  const s = { columns: [{ name: 'a' }, { name: 'b', required: true }] };
  assert.deepEqual(validateCsv('', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a,b\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a,b\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\n1\n', s).errors, [{ row: 1, column: 'b', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(validateCsv('a,b\n1\n1,2,3\n\n,\n', s).errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: 'b', code: 'REQUIRED' },
  ]);
  const both = { columns: [{ name: 'a', required: true }, { name: 'b', required: true }] };
  assert.deepEqual(validateCsv('b,a\n,\n', both).errors.map((e) => e.column), ['a', 'b']);
  assert.equal(validateCsv('a,a\n1,\n', { columns: [{ name: 'a', required: true }] }).ok, true);
});

test('validateCsv: kiểu và ràng buộc', () => {
  const v = (type, cell, extra = {}) =>
    validateCsv(`c\n${cell}\n`, { columns: [{ name: 'c', type, ...extra }] }).errors.map((e) => e.code);
  for (const c of ['007', '+5', '-0']) assert.deepEqual(v('int', c), []);
  for (const c of ['1.0', '1e3', ' 1', '9007199254740993']) assert.deepEqual(v('int', c), ['TYPE']);
  for (const c of ['5', '-5.25']) assert.deepEqual(v('number', c), []);
  for (const c of ['5.', '.5', 'NaN', '1e3']) assert.deepEqual(v('number', c), ['TYPE']);
  assert.deepEqual(v('bool', 'TRUE'), []);
  assert.deepEqual(v('bool', 'yes'), ['TYPE']);
  assert.deepEqual(v('date', '2024-02-29'), []);
  for (const c of ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-01']) assert.deepEqual(v('date', c), ['TYPE']);
  assert.deepEqual(v('int', 'x', { enum: ['a'], min: 1 }), ['TYPE']);
  assert.deepEqual(v('string', 'b', { enum: ['a'], pattern: '^a$', minLength: 2, maxLength: 0 }), ['ENUM', 'PATTERN', 'MIN_LENGTH', 'MAX_LENGTH']);
  assert.deepEqual(v('int', '5', { min: 6, max: 4 }), ['MIN', 'MAX']);
  assert.deepEqual(v('string', 'abc', { min: 100 }), []);
  assert.deepEqual(v('date', '2024-05-01', { min: '2024-06-01' }), ['MIN']);
  assert.deepEqual(v('string', 'xay', { pattern: 'a' }), []);
  assert.deepEqual(v('string', '😀😀', { maxLength: 2 }), []);
  assert.deepEqual(v('string', '', { minLength: 3 }), []);
  const u = validateCsv('c\n1\n01\n1\n\n', { columns: [{ name: 'c', unique: true }] });
  assert.deepEqual(u.errors, [{ row: 4, column: 'c', code: 'UNIQUE' }]);
});

test('validateCsv: lược đồ sai', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] }, { columns: [{ name: 'a', type: 'date', min: '2023-02-30' }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] }];
  for (const s of bad) assert.equal(thrown(() => validateCsv('a\n1', s)).code, 'CSV_INVALID_SCHEMA', JSON.stringify(s));
  assert.equal(thrown(() => validateCsv('"x', null)).code, 'CSV_INVALID_SCHEMA');
  assert.equal(thrown(() => validateCsv(5, { columns: [{ name: 'a' }] })).code, 'CSV_INVALID_INPUT');
});
