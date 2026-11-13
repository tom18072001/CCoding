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
const S = (...columns) => ({ columns });

test('parseCsv: biên phân tích', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a\rb\r\nc\n'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a,\n\n  \n""\n,\n'), [['a', ''], ['  '], [''], ['', '']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
});

test('parseCsv: lỗi và row', () => {
  assert.throws(() => parseCsv('a\n\nb"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a\n"x\ny'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv(5), (e) => e.code === 'CSV_INVALID_INPUT');
  for (const d of ['"', '\n', '\r', ',,', '']) {
    assert.throws(() => parseCsv('a', { delimiter: d }), (e) => e.code === 'CSV_INVALID_INPUT');
  }
});

test('validateCsv: lược đồ sai ném CSV_INVALID_SCHEMA', () => {
  const bad = [
    null, {}, { columns: [] }, S(1), S({}), S({ name: 'a' }, { name: 'a' }),
    S({ name: 'a', type: 'x' }), S({ name: 'a', pattern: '(' }), S({ name: 'a', enum: [] }),
    S({ name: 'a', enum: [1] }), S({ name: 'a', type: 'int', min: '1' }),
    S({ name: 'a', type: 'date', max: '2023-02-29' }), S({ name: 'a', minLength: -1 }),
    S({ name: 'a', maxLength: 1.5 }),
  ];
  for (const s of bad) assert.throws(() => validateCsv('a\n1', s), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv(1, S({ name: 'a' })), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => validateCsv('a', S({ name: 'a' }), { delimiter: '"' }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('validateCsv: rỗng, chỉ tiêu đề, lỗi phân tích', () => {
  const s = S({ name: 'a' });
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('\n\n', s).errors.map((e) => e.code), ['EMPTY_INPUT']);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a\n1\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
});

test('validateCsv: MISSING_COLUMN, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const s = S({ name: 'z', required: true }, { name: 'b', type: 'int' }, { name: 'a', type: 'int' });
  const r = validateCsv('a,b\nx,y\n1\n1,2,3\n', s);
  assert.deepEqual(codes(r), ['1:z:MISSING_COLUMN', '2:b:TYPE', '2:a:TYPE', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH']);
  assert.equal(r.rowCount, 3);
  assert.deepEqual(Object.keys(r.errors[0]).sort(), ['code', 'column', 'row']);
  assert.deepEqual(codes(validateCsv(' a,A\n1,2', S({ name: 'a' }))), ['1:a:MISSING_COLUMN']);
  assert.deepEqual(codes(validateCsv('a,a\nx,1', S({ name: 'a', type: 'int' }))), ['2:a:TYPE']);
});

test('validateCsv: hàng sai độ dài không vào UNIQUE; hàng đếm theo bản ghi', () => {
  const s = S({ name: 'id', unique: true }, { name: 'n' });
  const r = validateCsv('id,n\n"a\nb",1\n\nx\nx,2\nx,3\n', s);
  assert.deepEqual(codes(r), ['3:null:ROW_LENGTH', '5:id:UNIQUE']);
  assert.equal(r.rowCount, 4);
});

test('validateCsv: ô rỗng và thứ tự kiểm một ô', () => {
  const s = S({ name: 'v', type: 'int', enum: ['5', 'x'], pattern: '^9', minLength: 3, maxLength: 0, min: 100, max: 0, unique: true });
  assert.deepEqual(codes(validateCsv('v\n7\n7', s)), [
    '2:v:ENUM', '2:v:PATTERN', '2:v:MIN_LENGTH', '2:v:MAX_LENGTH', '2:v:MIN', '2:v:MAX',
    '3:v:ENUM', '3:v:PATTERN', '3:v:MIN_LENGTH', '3:v:MAX_LENGTH', '3:v:MIN', '3:v:MAX', '3:v:UNIQUE',
  ]);
  assert.deepEqual(codes(validateCsv('v\n12', S({ name: 'v', type: 'int', maxLength: 1, max: 5 }))), ['2:v:MAX_LENGTH', '2:v:MAX']);
  assert.deepEqual(codes(validateCsv('v\n\n\n""\n', S({ name: 'v', unique: true, minLength: 3, pattern: 'a' }))), []);
  assert.deepEqual(codes(validateCsv('v\nx\nx', S({ name: 'v', type: 'int', unique: true, enum: ['q'] }))), ['2:v:TYPE', '3:v:TYPE']);
  assert.deepEqual(codes(validateCsv('v\n1\n01\n1', S({ name: 'v', type: 'int', unique: true }))), ['4:v:UNIQUE']);
});

test('validateCsv: kiểu dữ liệu', () => {
  const t = (type, cell) => validateCsv(`v\n${cell}`, S({ name: 'v', type })).ok;
  for (const c of ['007', '+5', '-0', '9007199254740991']) assert.equal(t('int', c), true, c);
  for (const c of ['1.0', '1e3', '" 1"', '9007199254740992', 'a']) assert.equal(t('int', c), false, c);
  for (const c of ['1', '-1.50', '+0.5']) assert.equal(t('number', c), true, c);
  for (const c of ['5.', '.5', '1e3', 'NaN', 'Infinity']) assert.equal(t('number', c), false, c);
  assert.equal(t('number', '9'.repeat(400)), false);
  for (const c of ['true', 'FALSE', 'True']) assert.equal(t('bool', c), true, c);
  for (const c of ['1', 'yes']) assert.equal(t('bool', c), false, c);
  for (const c of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.equal(t('date', c), true, c);
  for (const c of ['2023-02-29', '1900-02-29', '2024-13-01', '2024-00-10', '2024-01-00', '0000-01-01', '2024-1-1', '2024-04-31']) {
    assert.equal(t('date', c), false, c);
  }
});

test('validateCsv: min/max, độ dài theo điểm mã, pattern không neo, enum', () => {
  const dr = S({ name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' });
  assert.deepEqual(codes(validateCsv('d\n2024-01-01\n2024-12-31\n2023-12-31\n2025-01-01', dr)), ['4:d:MIN', '5:d:MAX']);
  assert.deepEqual(codes(validateCsv('n\n1\n5\n0\n6', S({ name: 'n', type: 'int', min: 1, max: 5 }))), ['4:n:MIN', '5:n:MAX']);
  assert.deepEqual(codes(validateCsv('n\n0.5\n-2', S({ name: 'n', type: 'number', min: 0 }))), ['3:n:MIN']);
  assert.equal(validateCsv('s\nabc', S({ name: 's', min: 5, max: 1 })).ok, true);
  assert.equal(validateCsv('s\ntrue', S({ name: 's', type: 'bool', min: 5, max: 1 })).ok, true);
  assert.equal(validateCsv('s\n😀😀', S({ name: 's', maxLength: 2, minLength: 2 })).ok, true);
  assert.deepEqual(codes(validateCsv('s\n😀😀😀', S({ name: 's', maxLength: 2 }))), ['2:s:MAX_LENGTH']);
  assert.equal(validateCsv('s\nxxabxx', S({ name: 's', pattern: 'ab' })).ok, true);
  assert.deepEqual(codes(validateCsv('s\nxxabxx', S({ name: 's', pattern: '^ab$' }))), ['2:s:PATTERN']);
  assert.deepEqual(codes(validateCsv('s\n12', S({ name: 's', type: 'int', pattern: '^1$' }))), ['2:s:PATTERN']);
  assert.deepEqual(codes(validateCsv('r\nadmin\nAdmin', S({ name: 'r', enum: ['admin'] }))), ['3:r:ENUM']);
});

test('validateCsv: delimiter tùy chọn', () => {
  const r = validateCsv('a;b\n1;"x;y"', S({ name: 'a', type: 'int' }, { name: 'b', maxLength: 2 }), { delimiter: ';' });
  assert.deepEqual(codes(r), ['2:b:MAX_LENGTH']);
});
