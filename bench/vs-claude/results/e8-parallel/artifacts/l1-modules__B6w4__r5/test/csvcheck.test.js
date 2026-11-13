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

const codes = (text, col, opts) => validateCsv(text, { columns: [col] }, opts).errors.map((e) => e.code);
const one = (col, v) => codes(`c\n${v}\n`, { name: 'c', ...col });

test('parseCsv: BOM đôi, CR đơn, dòng trống, dòng chỉ dấu cách, ""', () => {
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a\rb\r\nc\n'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a\n\n  \n""\n'), [['a'], ['  '], ['']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parseCsv: lỗi và row', () => {
  const code = (t, o) => { try { parseCsv(t, o); } catch (e) { return [e.code, e.row]; } };
  assert.deepEqual(code('a\n\nb"c'), ['CSV_BAD_QUOTE', 2]);
  assert.deepEqual(code('a\n"ab"c'), ['CSV_BAD_QUOTE', 2]);
  assert.deepEqual(code('a\n"x\ny'), ['CSV_UNTERMINATED_QUOTE', 2]);
  assert.deepEqual(code(5), ['CSV_INVALID_INPUT', undefined]);
  assert.deepEqual(code('a', { delimiter: '"' }), ['CSV_INVALID_INPUT', undefined]);
  assert.deepEqual(code('a', { delimiter: ',,' }), ['CSV_INVALID_INPUT', undefined]);
});

test('validateCsv: lỗi phân tích, rỗng, chỉ tiêu đề', () => {
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('a\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
});

test('validateCsv: schema sai ném CSV_INVALID_SCHEMA', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] }, { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'date', max: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] }];
  for (const s of bad) assert.throws(() => validateCsv('a\n', s), (e) => e.code === 'CSV_INVALID_SCHEMA');
});

test('validateCsv: MISSING_COLUMN, ROW_LENGTH, cột thừa, tiêu đề lặp, thứ tự theo lược đồ', () => {
  const s = { columns: [{ name: 'b', required: true, unique: true }, { name: 'a', type: 'int' }, { name: 'z', required: true }] };
  const r = validateCsv('a,b,a,extra\nx,,1,q\n1,2\n1,1,1,1\n1,1,1,1\n', s);
  assert.deepEqual(r.errors, [
    { row: 1, column: 'z', code: 'MISSING_COLUMN' },
    { row: 2, column: 'b', code: 'REQUIRED' },
    { row: 2, column: 'a', code: 'TYPE' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 5, column: 'b', code: 'UNIQUE' },
  ]);
  assert.equal(r.rowCount, 4);
});

test('validateCsv: hàng sai độ dài không vào UNIQUE; số hàng đếm bản ghi', () => {
  const s = { columns: [{ name: 'a', unique: true }, { name: 'b' }] };
  const r = validateCsv('a,b\n\n"x\ny",1\nx\nx,2\n', s);
  assert.deepEqual(r.errors, [{ row: 3, column: null, code: 'ROW_LENGTH' }]);
  assert.deepEqual(validateCsv('a,b\n"x\ny",1\nx,2\n"x\ny",3', s).errors, [{ row: 4, column: 'a', code: 'UNIQUE' }]);
});

test('validateCsv: kiểu', () => {
  for (const v of ['007', '+5', '-0']) assert.deepEqual(one({ type: 'int' }, v), []);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993']) assert.deepEqual(one({ type: 'int' }, v), ['TYPE']);
  for (const v of ['1', '-1.50', '+0.5']) assert.deepEqual(one({ type: 'number' }, v), []);
  for (const v of ['5.', '.5', 'NaN', 'Infinity', '1e3']) assert.deepEqual(one({ type: 'number' }, v), ['TYPE']);
  for (const v of ['true', 'FALSE', 'True']) assert.deepEqual(one({ type: 'bool' }, v), []);
  for (const v of ['1', 'yes']) assert.deepEqual(one({ type: 'bool' }, v), ['TYPE']);
  for (const v of ['2024-02-29', '2000-02-29']) assert.deepEqual(one({ type: 'date' }, v), []);
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01', '1900-02-29', '2024-1-1']) assert.deepEqual(one({ type: 'date' }, v), ['TYPE']);
});

test('validateCsv: ràng buộc và thứ tự trong ô', () => {
  assert.deepEqual(one({ enum: ['a', 'b'] }, 'A'), ['ENUM']);
  assert.deepEqual(one({ type: 'int', enum: ['1'] }, '2'), ['ENUM']);
  assert.deepEqual(one({ pattern: 'b' }, 'abc'), []);
  assert.deepEqual(one({ pattern: '^b$' }, 'abc'), ['PATTERN']);
  assert.deepEqual(one({ type: 'int', enum: ['x'], min: 5, max: 6 }, '1'), ['ENUM', 'MIN']);
  assert.deepEqual(one({ type: 'int', enum: ['x'], min: 5, max: 6 }, '9'), ['ENUM', 'MAX']);
  assert.deepEqual(one({ minLength: 3, maxLength: 3 }, 'ab'), ['MIN_LENGTH']);
  assert.deepEqual(one({ maxLength: 1 }, '😀'), []);
  assert.deepEqual(one({ maxLength: 2 }, 'abc'), ['MAX_LENGTH']);
  assert.deepEqual(one({ pattern: '^x$', minLength: 5, maxLength: 0 }, 'ab'), ['PATTERN', 'MIN_LENGTH', 'MAX_LENGTH']);
  assert.deepEqual(one({ type: 'int', minLength: 3 }, '007'), []);
  assert.deepEqual(one({ type: 'int', min: 1, max: 3 }, '1'), []);
  assert.deepEqual(one({ type: 'date', min: '2024-01-01', max: '2024-12-31' }, '2023-12-31'), ['MIN']);
  assert.deepEqual(one({ type: 'date', min: '2024-01-01', max: '2024-12-31' }, '2025-01-01'), ['MAX']);
  assert.deepEqual(one({ type: 'string', min: 5 }, 'a'), []);
  assert.deepEqual(one({ type: 'bool', max: 5 }, 'true'), []);
});

test('validateCsv: ô rỗng bỏ qua ràng buộc, UNIQUE nguyên văn, delimiter', () => {
  assert.deepEqual(codes('c\n""\n\n""\n', { name: 'c', unique: true, enum: ['a'], minLength: 3 }), []);
  assert.deepEqual(codes('c\n1\n01\n1\n', { name: 'c', type: 'int', unique: true }), ['UNIQUE']);
  assert.deepEqual(codes('c\nx\nx\n', { name: 'c', type: 'int', unique: true }), ['TYPE', 'TYPE']);
  assert.deepEqual(codes('c;d\n1;2\n', { name: 'd', type: 'int', min: 5 }, { delimiter: ';' }), ['MIN']);
});
