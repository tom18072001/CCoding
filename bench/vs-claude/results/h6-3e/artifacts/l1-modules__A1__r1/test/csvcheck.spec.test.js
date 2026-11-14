import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const code = (c) => (e) => e.code === c;

test('parseCsv: cơ bản', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\r\n\r\n\nb\rc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv(',\n'), [['', '']]);
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a,b'), [['a', 'b']]);
});

test('parseCsv: lỗi', () => {
  assert.throws(() => parseCsv(5), code('CSV_INVALID_INPUT'));
  for (const d of ['"', '\n', '\r', '', ',,', 5]) {
    assert.throws(() => parseCsv('a', { delimiter: d }), code('CSV_INVALID_INPUT'));
  }
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), code('CSV_BAD_QUOTE'));
  assert.throws(() => parseCsv('a\n\n"b\n,c'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
});

const schema = { columns: [
  { name: 'id', type: 'int', required: true, unique: true, min: 1 },
  { name: 'name', maxLength: 5 },
] };

test('validateCsv: ví dụ SPEC và đếm hàng theo bản ghi', () => {
  const r = validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema);
  assert.equal(r.rowCount, 4);
  assert.equal(r.errors.length, 4);
  const r2 = validateCsv('id,name\n"1","a\nb"\n\nx,y', schema);
  assert.deepEqual(r2.errors, [{ row: 3, column: 'id', code: 'TYPE' }]);
  assert.equal(r2.rowCount, 2);
});

test('validateCsv: lỗi phân tích, rỗng, chỉ tiêu đề, thiếu cột', () => {
  assert.deepEqual(validateCsv('', schema), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('\n\n', schema).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('id,name\n1,"x', schema), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('id,na"me', schema).errors, [{ row: 1, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('id,name\n', schema), { ok: true, rowCount: 0, errors: [] });
  assert.throws(() => validateCsv(1, schema), code('CSV_INVALID_INPUT'));
  const r = validateCsv('name\nab\n', schema);
  assert.deepEqual(r.errors, [{ row: 1, column: 'id', code: 'MISSING_COLUMN' }]);
  assert.equal(r.rowCount, 1);
});

test('validateCsv: ROW_LENGTH không kiểm ô, không vào UNIQUE', () => {
  const r = validateCsv('id,name\n1\n1,a,b\n1,a\n1,b\n', schema);
  assert.deepEqual(r.errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 5, column: 'id', code: 'UNIQUE' },
  ]);
});

test('validateCsv: thứ tự lỗi theo lược đồ, nhiều lỗi trong một ô', () => {
  const s = { columns: [
    { name: 'b', enum: ['x'], pattern: '^q', minLength: 3, maxLength: 1 },
    { name: 'a', type: 'int', min: 5, max: 3 },
  ] };
  const r = validateCsv('a,b\n4,zz\n', s);
  assert.deepEqual(r.errors.map((e) => `${e.column}:${e.code}`), ['b:ENUM', 'b:PATTERN', 'b:MIN_LENGTH', 'b:MAX_LENGTH', 'a:MIN', 'a:MAX']);
});

test('validateCsv: kiểu dữ liệu', () => {
  const t = (type, v) => validateCsv(`c\n${v}\n`, { columns: [{ name: 'c', type }] }).ok;
  for (const v of ['007', '+5', '-0', '9007199254740991']) assert.equal(t('int', v), true, v);
  for (const v of ['1.0', '1e3', '9007199254740993', 'a', '-']) assert.equal(t('int', v), false, v);
  for (const v of ['1', '-1.5', '+0.25']) assert.equal(t('number', v), true, v);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity', '1' + '0'.repeat(400)]) assert.equal(t('number', v), false, v);
  for (const v of ['true', 'FALSE', 'True']) assert.equal(t('bool', v), true, v);
  for (const v of ['1', 'yes', 'truee']) assert.equal(t('bool', v), false, v);
  for (const v of ['2024-02-29', '0001-01-01']) assert.equal(t('date', v), true, v);
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-01', '1900-02-29']) assert.equal(t('date', v), false, v);
});

test('validateCsv: ràng buộc', () => {
  const run = (col, text) => validateCsv(text, { columns: [{ name: 'c', ...col }] }).errors.map((e) => e.code);
  assert.deepEqual(run({ type: 'int', unique: true }, 'c\n1\n01\n1\n'), ['UNIQUE']);
  assert.deepEqual(run({ unique: true }, 'c\n\n\n'), []);
  assert.deepEqual(run({ type: 'int', unique: true }, 'c\nx\nx\n'), ['TYPE', 'TYPE']);
  assert.deepEqual(run({ required: true }, 'c\n""\n'), ['REQUIRED']);
  assert.deepEqual(run({ required: true }, 'c\n \n'), []); // dấu cách không phải rỗng
  assert.deepEqual(run({ type: 'bool', min: 5 }, 'c\ntrue\n'), []);
  assert.deepEqual(run({ min: 5, enum: ['a'] }, 'c\nb\n'), ['ENUM']);
  assert.deepEqual(run({ pattern: 'ab' }, 'c\nxabx\n'), []);
  assert.deepEqual(run({ type: 'date', min: '2024-01-01', max: '2024-12-31' }, 'c\n2023-12-31\n2025-01-01\n2024-06-01\n'), ['MIN', 'MAX']);
  assert.deepEqual(run({ type: 'int', min: 1, max: 3 }, 'c\n1\n3\n0\n4\n'), ['MIN', 'MAX']);
  assert.deepEqual(run({ maxLength: 1 }, 'c\n😀\n'), []); // điểm mã
  assert.deepEqual(run({ minLength: 2 }, 'c\n😀\n'), ['MIN_LENGTH']);
  assert.deepEqual(run({ enum: ['A'] }, 'c\na\n'), ['ENUM']);
  assert.deepEqual(run({ enum: ['x'], unique: true }, 'c\ny\ny\n'), ['ENUM', 'ENUM', 'UNIQUE']);
});

test('validateCsv: tiêu đề khớp chính xác, tên lặp, cột thừa, delimiter', () => {
  assert.deepEqual(validateCsv('ID\n1\n', { columns: [{ name: 'id' }] }).errors, [{ row: 1, column: 'id', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(validateCsv('c,c\nx,1\n', { columns: [{ name: 'c', type: 'int' }] }).errors, [{ row: 2, column: 'c', code: 'TYPE' }]);
  assert.equal(validateCsv('x,c\n1,2\n', { columns: [{ name: 'c', type: 'int' }] }).ok, true);
  assert.equal(validateCsv('c;d\n1;2\n', { columns: [{ name: 'd', type: 'int' }] }, { delimiter: ';' }).ok, true);
});

test('validateCsv: lược đồ sai', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: 'x' }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'float' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'number', max: NaN }] },
    { columns: [{ name: 'a', type: 'date', min: '2024-02-30' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bad) assert.throws(() => validateCsv('a\n1', s), code('CSV_INVALID_SCHEMA'));
  // lược đồ được kiểm trước khi phân tích
  assert.throws(() => validateCsv('"x', { columns: [] }), code('CSV_INVALID_SCHEMA'));
});
