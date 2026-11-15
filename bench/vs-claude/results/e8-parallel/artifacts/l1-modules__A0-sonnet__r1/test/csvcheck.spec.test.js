import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const BOM = '﻿';
const thrown = (fn) => { try { fn(); } catch (e) { return e; } return null; };

test('parseCsv', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
  assert.deepEqual(parseCsv(BOM + 'a;b', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv(BOM + BOM + 'a'), [[BOM + 'a']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\r\n\r\n\n  \n""\r'), [['a'], ['  '], ['']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv('a\rb\nc\r\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parseCsv lỗi', () => {
  assert.equal(thrown(() => parseCsv('a\n"b')).code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(thrown(() => parseCsv('a\n"b')).row, 2);
  assert.equal(thrown(() => parseCsv('ab"c')).code, 'CSV_BAD_QUOTE');
  assert.equal(thrown(() => parseCsv('"ab"c')).code, 'CSV_BAD_QUOTE');
  assert.equal(thrown(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv('a', { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv('a', { delimiter: ',,' })).code, 'CSV_INVALID_INPUT');
});

test('validateCsv ví dụ chuẩn', () => {
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

test('validateCsv các nhánh', () => {
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a\n"x', s).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('a,b\n1\n1,2,3\n', s).errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' }, { row: 3, column: null, code: 'ROW_LENGTH' }]);
  assert.deepEqual(validateCsv('x\n1\n', { columns: [{ name: 'a', required: true }, { name: 'x' }] }).errors, [
    { row: 1, column: 'a', code: 'MISSING_COLUMN' }]);
  const s2 = { columns: [{ name: 'b', enum: ['x'], pattern: '^z', minLength: 3, maxLength: 1 }, { name: 'a', type: 'int', max: 5 }] };
  assert.deepEqual(validateCsv('a,b\n9,yy\n', s2).errors.map((e) => e.column + ':' + e.code), [
    'b:ENUM', 'b:PATTERN', 'b:MIN_LENGTH', 'b:MAX_LENGTH', 'a:MAX']);
});

test('validateCsv kiểu', () => {
  const t = (type, v) => validateCsv(`c\n${v}\n`, { columns: [{ name: 'c', type }] }).ok;
  for (const v of ['007', '+5', '-0']) assert.ok(t('int', v), v);
  for (const v of ['1.0', '1e3', '1 ']) assert.equal(t('int', v), false, v);
  assert.ok(t('number', '-1.5'));
  for (const v of ['5.', '.5', '1e3', 'NaN']) assert.equal(t('number', v), false, v);
  assert.ok(t('bool', 'TRUE'));
  assert.equal(t('bool', 'yes'), false);
  assert.ok(t('date', '2024-02-29'));
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01']) assert.equal(t('date', v), false, v);
});

test('validateCsv min/max, unique, bỏ qua', () => {
  const r = validateCsv('d,s\n2024-01-01,5\n2023-01-01,5\n2025-01-01,05\n',
    { columns: [{ name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' }, { name: 's', unique: true, min: 100 }] });
  assert.deepEqual(r.errors, [{ row: 3, column: 'd', code: 'MIN' }, { row: 3, column: 's', code: 'UNIQUE' }, { row: 4, column: 'd', code: 'MAX' }]);
});

test('validateCsv lược đồ sai', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] }, { columns: [{ name: 'a', type: 'date', min: '2023-02-30' }] },
    { columns: [{ name: 'a', minLength: -1 }] }];
  for (const s of bad) assert.equal(thrown(() => validateCsv(5, s)).code, 'CSV_INVALID_SCHEMA');
});
