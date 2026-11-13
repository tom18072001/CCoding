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

test('parse: dòng trống, CR đơn, CRLF trong nháy, dòng "" và dấu cách', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a\r\r\n\nb\rc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a,\n'), [['a', '']]);
  assert.deepEqual(parseCsv('""\n  \n'), [[''], ['  ']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parse: lỗi và row', () => {
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a\n"x\ny'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv(5), (e) => e.code === 'CSV_INVALID_INPUT');
  for (const d of ['"', '\n', ',,', '']) {
    assert.throws(() => parseCsv('a', { delimiter: d }), (e) => e.code === 'CSV_INVALID_INPUT');
  }
});

test('validate: lược đồ sai', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] }, { columns: [{ name: 'a', type: 'date', max: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] }];
  for (const s of bad) assert.throws(() => validateCsv('a\n1', s), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv(1, { columns: [{ name: 'a' }] }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('validate: tệp rỗng, lỗi phân tích, chỉ tiêu đề', () => {
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
});

test('validate: MISSING_COLUMN, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const s = { columns: [
    { name: 'b', required: true }, { name: 'zz', required: true }, { name: 'a', type: 'int', required: true },
  ] };
  const r = validateCsv('a,b,a\n,,5\n1,2\n1,2,3,4\n,x,\n', s);
  assert.deepEqual(codes(r), ['1:zz:MISSING_COLUMN', '2:b:REQUIRED', '2:a:REQUIRED', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH', '5:a:REQUIRED']);
  assert.equal(r.rowCount, 4);
  const r2 = validateCsv('a,b\n,\n', { columns: [{ name: 'b', required: true }, { name: 'a', required: true }] });
  assert.deepEqual(codes(r2), ['2:b:REQUIRED', '2:a:REQUIRED']);
});

test('validate: kiểu', () => {
  const t = (type, v) => validateCsv(`c\n${v}`, { columns: [{ name: 'c', type }] }).ok;
  for (const v of ['007', '+5', '-0']) assert.equal(t('int', v), true);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993']) assert.equal(t('int', v), false);
  for (const v of ['1.5', '-2', '+0.25']) assert.equal(t('number', v), true);
  for (const v of ['5.', '.5', 'NaN', 'Infinity', '1e3']) assert.equal(t('number', v), false);
  for (const v of ['true', 'TRUE', 'False']) assert.equal(t('bool', v), true);
  for (const v of ['1', 'yes']) assert.equal(t('bool', v), false);
  for (const v of ['2024-02-29', '2000-02-29']) assert.equal(t('date', v), true);
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01', '1900-02-29', '2024-1-1', '2024-04-31']) assert.equal(t('date', v), false);
});

test('validate: ràng buộc, thứ tự kiểm, TYPE dừng, ô rỗng', () => {
  const s = { columns: [{ name: 'c', enum: ['ab', 'abcdef'], pattern: '^x', minLength: 3, maxLength: 4 }] };
  assert.deepEqual(validateCsv('c\nab\nabcdef', s).errors.map((e) => e.code),
    ['PATTERN', 'MIN_LENGTH', 'PATTERN', 'MAX_LENGTH']);
  const s2 = { columns: [{ name: 'c', enum: ['x'], pattern: '^x', minLength: 3, maxLength: 4 }] };
  assert.deepEqual(validateCsv('c\nab\nabcdef', s2).errors.map((e) => e.code),
    ['ENUM', 'PATTERN', 'MIN_LENGTH', 'ENUM', 'PATTERN', 'MAX_LENGTH']);
  const n = { columns: [{ name: 'c', type: 'int', min: 5, max: 10, enum: ['1'], unique: true }] };
  assert.deepEqual(codes(validateCsv('c\n1\n1\nx\n20\n', n)),
    ['2:c:MIN', '3:c:MIN', '3:c:UNIQUE', '4:c:TYPE', '5:c:ENUM', '5:c:MAX']);
  const u = { columns: [{ name: 'c', type: 'int', unique: true, pattern: 'zzz' }] };
  assert.deepEqual(codes(validateCsv('c\nx\nx\n\n""\n', u)), ['2:c:TYPE', '3:c:TYPE']);
  assert.equal(validateCsv('c\nabc', { columns: [{ name: 'c', min: 'b', max: 'a' }] }).ok, true);
  const d = { columns: [{ name: 'c', type: 'date', min: '2024-01-01', max: '2024-12-31' }] };
  assert.deepEqual(codes(validateCsv('c\n2023-12-31\n2024-01-01\n2024-12-31\n2025-01-01', d)), ['2:c:MIN', '5:c:MAX']);
  const l = { columns: [{ name: 'c', maxLength: 1, unique: true }] };
  assert.deepEqual(codes(validateCsv('c\n😀\n😀\n', l)), ['3:c:UNIQUE']);
  assert.equal(validateCsv('c\n1\n01', { columns: [{ name: 'c', type: 'int', unique: true }] }).ok, true);
});

test('validate: hàng sai độ dài không vào unique; số hàng đếm bản ghi', () => {
  const s = { columns: [{ name: 'a', unique: true }, { name: 'b' }] };
  const r = validateCsv('a,b\n"x\ny",1\nq\nq,1\nq,2\n', s);
  assert.deepEqual(codes(r), ['3:null:ROW_LENGTH', '5:a:UNIQUE']);
  assert.equal(r.rowCount, 4);
});
