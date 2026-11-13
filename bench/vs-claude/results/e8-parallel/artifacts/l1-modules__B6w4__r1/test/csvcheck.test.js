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

const errOf = (f) => { try { f(); } catch (e) { return e; } return null; };

test('parseCsv: dòng trống, kết thúc dòng lẫn lộn, rỗng', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('﻿'), []);
  assert.deepEqual(parseCsv('a\r\r\n\n\nb\rc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('  \n""\n'), [['  '], ['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a,\n,'), [['a', ''], ['', '']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('"a"'), [['a']]);
  assert.deepEqual(parseCsv('"a",\r\n'), [['a', '']]);
});

test('parseCsv: lỗi và row', () => {
  let e = errOf(() => parseCsv('a\nb"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE'); assert.equal(e.row, 2);
  e = errOf(() => parseCsv('"ab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE'); assert.equal(e.row, 1);
  e = errOf(() => parseCsv('a\n\n"x\ny'));
  assert.equal(e.code, 'CSV_UNTERMINATED_QUOTE'); assert.equal(e.row, 2);
  for (const bad of [[1], ['a', { delimiter: '' }], ['a', { delimiter: 'ab' }], ['a', { delimiter: '"' }], ['a', { delimiter: '\n' }]]) {
    assert.equal(errOf(() => parseCsv(...bad)).code, 'CSV_INVALID_INPUT');
  }
});

test('validateCsv: lược đồ sai', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'date', max: '2023-02-29' }] },
    { columns: [{ name: 'a', maxLength: -1 }] },
    { columns: [{ name: 'a', minLength: 1.5 }] },
  ];
  for (const s of bad) assert.equal(errOf(() => validateCsv('a\n1', s)).code, 'CSV_INVALID_SCHEMA');
  assert.equal(errOf(() => validateCsv('a,"', {})).code, 'CSV_INVALID_SCHEMA');
  assert.equal(errOf(() => validateCsv(5, { columns: [{ name: 'a' }] })).code, 'CSV_INVALID_INPUT');
});

test('validateCsv: lỗi phân tích, tệp rỗng, chỉ tiêu đề', () => {
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('a\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('\n\n', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a', s), { ok: true, rowCount: 0, errors: [] });
});

test('validateCsv: MISSING_COLUMN, ROW_LENGTH, thứ tự cột theo lược đồ', () => {
  const s = { columns: [
    { name: 'z', required: true }, { name: 'q', required: true }, { name: 'a', required: true },
  ] };
  const r = validateCsv('a,b,z\n,1,\n1,2\n1,2,3,4\n', s);
  assert.deepEqual(r.errors, [
    { row: 1, column: 'q', code: 'MISSING_COLUMN' },
    { row: 2, column: 'z', code: 'REQUIRED' },
    { row: 2, column: 'a', code: 'REQUIRED' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: null, code: 'ROW_LENGTH' },
  ]);
  assert.equal(r.rowCount, 3);
  const r2 = validateCsv('A,a,a\nx,,y', { columns: [{ name: 'a', required: true }] });
  assert.deepEqual(r2.errors, [{ row: 2, column: 'a', code: 'REQUIRED' }]);
  const r3 = validateCsv('a\n"x\ny"\n\n\n', { columns: [{ name: 'a', enum: ['q'] }] });
  assert.deepEqual(r3.errors, [{ row: 2, column: 'a', code: 'ENUM' }]);
});

test('validateCsv: hàng sai độ dài không vào UNIQUE', () => {
  const r = validateCsv('a,b\n1\n1,x\n1,y', { columns: [{ name: 'a', unique: true }] });
  assert.deepEqual(r.errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: 'a', code: 'UNIQUE' },
  ]);
});

test('validateCsv: kiểu dữ liệu', () => {
  const t = (type, v) => validateCsv('a\n"' + v + '"', { columns: [{ name: 'a', type }] }).errors.length === 0;
  for (const v of ['007', '+5', '-0', '9007199254740991']) assert.ok(t('int', v), v);
  for (const v of ['1.0', '1e3', '9007199254740992', 'x', ' 1']) assert.ok(!t('int', v), v);
  for (const v of ['5', '-5.25', '+0.5']) assert.ok(t('number', v), v);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity']) assert.ok(!t('number', v), v);
  for (const v of ['true', 'FALSE', 'True']) assert.ok(t('bool', v), v);
  for (const v of ['1', 'yes']) assert.ok(!t('bool', v), v);
  for (const v of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.ok(t('date', v), v);
  for (const v of ['2023-02-29', '1900-02-29', '2024-13-01', '0000-01-01', '2024-1-01', '2024-04-31']) assert.ok(!t('date', v), v);
});

test('validateCsv: thứ tự kiểm một ô và dừng khi sai kiểu', () => {
  const s = { columns: [{ name: 'a', type: 'int', enum: ['6'], pattern: '^9', minLength: 3, maxLength: 0, min: 10, max: 0, unique: true }] };
  const r = validateCsv('a\n5\n5\nx', s);
  assert.deepEqual(r.errors.map((e) => `${e.row}:${e.code}`), [
    '2:ENUM', '2:PATTERN', '2:MIN_LENGTH', '2:MAX_LENGTH', '2:MIN', '2:MAX',
    '3:ENUM', '3:PATTERN', '3:MIN_LENGTH', '3:MAX_LENGTH', '3:MIN', '3:MAX', '3:UNIQUE',
    '4:TYPE',
  ]);
});

test('validateCsv: PATTERN không neo, độ dài theo điểm mã, ô rỗng bỏ qua ràng buộc', () => {
  const s = { columns: [
    { name: 'b', pattern: '^ab$', minLength: 2, maxLength: 2, unique: true },
  ] };
  const r = validateCsv('b\n😀😀\nxaby\n\n\n""\n', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: 'b', code: 'PATTERN' },
    { row: 3, column: 'b', code: 'PATTERN' },
    { row: 3, column: 'b', code: 'MAX_LENGTH' },
  ]);
  const un = validateCsv('b\nxaby', { columns: [{ name: 'b', pattern: 'ab' }] });
  assert.equal(un.ok, true);
});

test('validateCsv: min/max cho date, bỏ qua với string; UNIQUE nguyên văn', () => {
  const s = { columns: [
    { name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' },
    { name: 's', min: 5 },
    { name: 'n', type: 'number', unique: true },
  ] };
  const r = validateCsv('d,s,n\n2023-12-31,a,1\n2025-01-01,b,1.0\n2024-06-01,c,1', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: 'd', code: 'MIN' },
    { row: 3, column: 'd', code: 'MAX' },
    { row: 4, column: 'n', code: 'UNIQUE' },
  ]);
  assert.deepEqual(Object.keys(r.errors[0]).sort(), ['code', 'column', 'row']);
});
