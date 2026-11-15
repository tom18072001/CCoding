import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };

test('parseCsv', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
  assert.deepEqual(parseCsv('﻿a;b', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a\r\r\n\n  \n""\nb\rc'), [['a'], ['  '], [''], ['b'], ['c']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.equal(err(() => parseCsv('a,"b')).code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(err(() => parseCsv('a\nab"c')).row, 2);
  assert.equal(err(() => parseCsv('"ab"c')).code, 'CSV_BAD_QUOTE');
  assert.equal(err(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
  assert.equal(err(() => parseCsv('a', { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
  assert.equal(err(() => parseCsv('a', { delimiter: ';;' })).code, 'CSV_INVALID_INPUT');
});

test('validateCsv ví dụ chuẩn', () => {
  const schema = { columns: [
    { name: 'id', type: 'int', required: true, unique: true, min: 1 },
    { name: 'name', maxLength: 5 },
  ] };
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

test('validateCsv các trường hợp khác', () => {
  const v = (t, cols) => validateCsv(t, { columns: cols });
  assert.deepEqual(v('', [{ name: 'a' }]).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(v('a\n"x', [{ name: 'a' }]).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(v('a', [{ name: 'a' }]), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(v('a,b\n1', [{ name: 'a' }, { name: 'c', required: true }]).errors, [
    { row: 1, column: 'c', code: 'MISSING_COLUMN' },
    { row: 2, column: null, code: 'ROW_LENGTH' },
  ]);
  const r = v('b,a\nxx,yy', [{ name: 'a', enum: ['q'], pattern: '^z', minLength: 3, maxLength: 1 }, { name: 'b', type: 'int' }]);
  assert.deepEqual(r.errors.map((e) => e.column + ':' + e.code), ['a:ENUM', 'a:PATTERN', 'a:MIN_LENGTH', 'a:MAX_LENGTH', 'b:TYPE']);
  const t = (type, val) => v('a\n' + val, [{ name: 'a', type }]).ok;
  assert.deepEqual(['007', '+5', '-0'].map((x) => t('int', x)), [true, true, true]);
  assert.deepEqual(['1.0', '1e3', ' 1'].map((x) => t('int', x)), [false, false, false]);
  assert.deepEqual(['1.5', '-2'].map((x) => t('number', x)), [true, true]);
  assert.deepEqual(['5.', '.5', 'NaN'].map((x) => t('number', x)), [false, false, false]);
  assert.deepEqual(['TRUE', 'false'].map((x) => t('bool', x)), [true, true]);
  assert.deepEqual(['1', 'yes'].map((x) => t('bool', x)), [false, false]);
  assert.deepEqual(['2024-02-29', '2023-02-29', '2024-13-01', '0000-01-01'].map((x) => t('date', x)), [true, false, false, false]);
  assert.deepEqual(v('a\n2023-01-01', [{ name: 'a', type: 'date', min: '2024-01-01' }]).errors, [{ row: 2, column: 'a', code: 'MIN' }]);
  assert.equal(v('a\n5', [{ name: 'a', min: 10 }]).ok, true);
  assert.equal(v('a\n1\n01', [{ name: 'a', unique: true }]).ok, true);
  assert.equal(v('a\n😀😀', [{ name: 'a', maxLength: 2 }]).ok, true);
  assert.equal(v('a,b\n,\n', [{ name: 'a', unique: true, min: 5 }]).ok, true);
  for (const bad of [null, {}, { columns: [] }, { columns: [{}] }, { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] }, { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] }, { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', minLength: -1 }] }]) {
    assert.equal(err(() => validateCsv('a', bad)).code, 'CSV_INVALID_SCHEMA');
  }
});
