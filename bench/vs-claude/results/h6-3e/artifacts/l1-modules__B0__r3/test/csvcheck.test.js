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

const thrown = (f) => { try { f(); } catch (e) { return e; } return null; };

test('csvcheck: dòng trống, dòng cuối, CR đơn, ô rỗng cuối', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\r\n'), []);
  assert.deepEqual(parseCsv('a,\n\nb\r"c"\r\n'), [['a', ''], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
});

test('csvcheck: lỗi phân tích và đầu vào', () => {
  assert.equal(thrown(() => parseCsv('a\nb"c')).code, 'CSV_BAD_QUOTE');
  assert.equal(thrown(() => parseCsv('a\nb"c')).row, 2);
  assert.equal(thrown(() => parseCsv('"ab"c')).code, 'CSV_BAD_QUOTE');
  assert.equal(thrown(() => parseCsv('a\n"b\nc')).row, 2);
  assert.equal(thrown(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv('a', { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv('a', { delimiter: ';;' })).code, 'CSV_INVALID_INPUT');
});

test('csvcheck: lược đồ sai và tệp đặc biệt', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'date', max: '2023-02-30' }] },
    { columns: [{ name: 'a', maxLength: -1 }] }];
  for (const s of bad) assert.equal(thrown(() => validateCsv('a\n1', s)).code, 'CSV_INVALID_SCHEMA');
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a\n"x', s).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('a\nx"', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
});

test('csvcheck: cột thiếu, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const s = { columns: [{ name: 'b', required: true }, { name: 'zz', required: true }, { name: 'a', required: true }] };
  const r = validateCsv('a,b\n,\n1\n,x,y\n', s);
  assert.deepEqual(r.errors, [
    { row: 1, column: 'zz', code: 'MISSING_COLUMN' },
    { row: 2, column: 'b', code: 'REQUIRED' },
    { row: 2, column: 'a', code: 'REQUIRED' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: null, code: 'ROW_LENGTH' },
  ]);
});

test('csvcheck: kiểu dữ liệu', () => {
  const types = (type, ok, bad) => {
    const sc = { columns: [{ name: 'v', type }] };
    for (const v of ok) assert.equal(validateCsv(`v\n${v}`, sc).ok, true, `${type} ${v}`);
    for (const v of bad) assert.equal(validateCsv(`v\n"${v}"`, sc).errors[0]?.code, 'TYPE', `${type} ${v}`);
  };
  types('int', ['007', '+5', '-0'], ['1.0', '1e3', ' 1', '99999999999999999999']);
  types('number', ['1.5', '-2', '+0.1'], ['5.', '.5', '1e3', 'NaN']);
  types('bool', ['TRUE', 'false'], ['1', 'yes']);
  types('date', ['2024-02-29'], ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-01']);
});

test('csvcheck: ràng buộc, nhiều lỗi một ô, unique', () => {
  const s = { columns: [{ name: 'v', enum: ['abc', 'abcdef'], pattern: '^z', minLength: 4, maxLength: 5, unique: true }] };
  assert.deepEqual(validateCsv('v\nabc\nabcdef\nabc', s).errors.map((e) => `${e.row}${e.code}`),
    ['2PATTERN', '2MIN_LENGTH', '3PATTERN', '3MAX_LENGTH', '4PATTERN', '4MIN_LENGTH', '4UNIQUE']);
  const d = { columns: [{ name: 'v', type: 'date', min: '2024-01-01', max: '2024-12-31' }, { name: 'w', min: 5 }] };
  assert.deepEqual(validateCsv('v,w\n2023-12-31,a\n2025-01-01,b', d).errors.map((e) => e.code), ['MIN', 'MAX']);
  const u = { columns: [{ name: 'v', type: 'int', unique: true }] };
  assert.deepEqual(validateCsv('v\n1\n01\nx\nx\n1', u).errors.map((e) => `${e.row}${e.code}`), ['4TYPE', '5TYPE', '6UNIQUE']);
});
