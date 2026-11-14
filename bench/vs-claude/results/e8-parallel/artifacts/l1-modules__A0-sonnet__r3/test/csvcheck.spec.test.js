import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const thrown = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const BOM = String.fromCharCode(0xfeff);

test('parseCsv', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
  assert.deepEqual(parseCsv(BOM + 'a;b', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv(BOM + BOM + 'a'), [[BOM + 'a']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\r\n\r\n\n  \n""\r'), [['a'], ['  '], ['']]);
  assert.deepEqual(parseCsv('a\rb\r\nc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.equal(thrown(() => parseCsv(1)).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv('a', { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv('a', { delimiter: ',,' })).code, 'CSV_INVALID_INPUT');
  const u = thrown(() => parseCsv('a\n"b'));
  assert.equal(u.code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(u.row, 2);
  assert.equal(thrown(() => parseCsv('ab"c')).code, 'CSV_BAD_QUOTE');
  assert.equal(thrown(() => parseCsv('a\n"ab"c')).row, 2);
});

const schema = { columns: [
  { name: 'id', type: 'int', required: true, unique: true, min: 1 },
  { name: 'name', maxLength: 5 },
] };

test('validateCsv: ví dụ đặc tả', () => {
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

test('validateCsv: cấp tệp', () => {
  assert.deepEqual(validateCsv('', schema).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('id,name', schema), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('id\n"x', schema), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('id,na"me', schema).errors, [{ row: 1, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('name\n\n\n', schema), { ok: false, rowCount: 0, errors: [{ row: 1, column: 'id', code: 'MISSING_COLUMN' }] });
  assert.deepEqual(validateCsv('id,name\n1\n1,a,b\n1,a', schema).errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
  ]);
  assert.equal(thrown(() => validateCsv(5, schema)).code, 'CSV_INVALID_INPUT');
});

test('validateCsv: thứ tự theo lược đồ và các kiểu', () => {
  const s = { columns: [
    { name: 'b', type: 'bool' },
    { name: 'a', type: 'date', min: '2024-01-01', max: '2024-12-31' },
    { name: 'n', type: 'number', max: 10, enum: ['1.5', '20'], pattern: '^2' },
  ] };
  const r = validateCsv('n,a,b\n1.5,2023-12-31,TRUE\n20,2025-01-01,yes\n5.,2023-02-29,1', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: 'a', code: 'MIN' },
    { row: 2, column: 'n', code: 'PATTERN' },
    { row: 3, column: 'b', code: 'TYPE' },
    { row: 3, column: 'a', code: 'MAX' },
    { row: 3, column: 'n', code: 'MAX' },
    { row: 4, column: 'b', code: 'TYPE' },
    { row: 4, column: 'a', code: 'TYPE' },
    { row: 4, column: 'n', code: 'TYPE' },
  ]);
});

test('validateCsv: unique và độ dài theo điểm mã', () => {
  const s = { columns: [{ name: 'k', unique: true, minLength: 2 }] };
  assert.deepEqual(validateCsv('k\n01\n1\n01\n😀😀\n', s).errors, [
    { row: 3, column: 'k', code: 'MIN_LENGTH' },
    { row: 4, column: 'k', code: 'UNIQUE' },
  ]);
});

test('validateCsv: lược đồ sai', () => {
  const bads = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] }, { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] }, { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] }, { columns: [{ name: 'a', type: 'date', max: '2023-02-30' }] },
    { columns: [{ name: 'a', minLength: -1 }] }];
  for (const b of bads) assert.equal(thrown(() => validateCsv(5, b)).code, 'CSV_INVALID_SCHEMA');
});
