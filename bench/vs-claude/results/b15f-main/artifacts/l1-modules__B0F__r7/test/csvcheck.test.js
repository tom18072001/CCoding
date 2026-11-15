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

const codeOf = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const S = (...columns) => ({ columns });
const errs = (text, schema, o) => validateCsv(text, schema, o).errors;

test('parse: kết thúc dòng lẫn lộn, \\r đơn lẻ, dòng cuối có/không xuống dòng', () => {
  assert.deepEqual(parseCsv('a\rb\r\nc\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a\n'), [['a']]);
  assert.deepEqual(parseCsv('a'), [['a']]);
});

test('parse: rỗng, BOM, BOM thứ hai là dữ liệu', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('﻿'), []);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
});

test('parse: dòng trống bỏ qua, dòng dấu cách và "" thì giữ', () => {
  assert.deepEqual(parseCsv('a\n\n\r\nb\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
});

test('parse: CRLF trong nháy giữ nguyên, không cắt khoảng trắng, delimiter cuối', () => {
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a,\nb'), [['a', ''], ['b']]);
  assert.deepEqual(parseCsv('"a",\n'), [['a', '']]);
});

test('parse: lỗi nháy và row', () => {
  assert.equal(codeOf(() => parseCsv('ab"c')), 'CSV_BAD_QUOTE');
  assert.equal(codeOf(() => parseCsv('"ab"c')), 'CSV_BAD_QUOTE');
  assert.equal(codeOf(() => parseCsv('a\n\n"b')), 'CSV_UNTERMINATED_QUOTE');
  assert.throws(() => parseCsv('a\n\nb,x"y'), (e) => e.row === 2);
  assert.throws(() => parseCsv('h\n"x\ny'), (e) => e.row === 2);
});

test('parse: delimiter và text không hợp lệ', () => {
  for (const d of ['', ',,', '"', '\r', '\n', 5]) {
    assert.equal(codeOf(() => parseCsv('a', { delimiter: d })), 'CSV_INVALID_INPUT');
  }
  assert.equal(codeOf(() => parseCsv(null)), 'CSV_INVALID_INPUT');
  assert.equal(codeOf(() => validateCsv(5, S({ name: 'a' }))), 'CSV_INVALID_INPUT');
  assert.equal(codeOf(() => validateCsv('a', S({ name: 'a' }), { delimiter: '"' })), 'CSV_INVALID_INPUT');
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
});

test('validate: lỗi phân tích trả một lỗi, bỏ tiền tố', () => {
  const s = S({ name: 'a' });
  assert.deepEqual(validateCsv('a\n1\n"x', s), {
    ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }],
  });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
});

test('validate: rỗng và chỉ tiêu đề', () => {
  const s = S({ name: 'a' });
  assert.deepEqual(validateCsv('', s), {
    ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }],
  });
  assert.deepEqual(validateCsv('\n\n', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
});

test('validate: MISSING_COLUMN, cột thừa, phân biệt hoa thường, tiêu đề lặp', () => {
  const s = S({ name: 'a', required: true }, { name: 'b', required: true });
  assert.deepEqual(errs('a,extra\n,x\n', s), [
    { row: 1, column: 'b', code: 'MISSING_COLUMN' },
    { row: 2, column: 'a', code: 'REQUIRED' },
  ]);
  assert.deepEqual(errs('A\n1\n', S({ name: 'a' })), [{ row: 1, column: 'a', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(errs('a,a\n,5\n', S({ name: 'a', required: true })), [{ row: 2, column: 'a', code: 'REQUIRED' }]);
});

test('validate: ROW_LENGTH đứng một mình, không vào UNIQUE', () => {
  const s = S({ name: 'a', unique: true }, { name: 'b', required: true });
  assert.deepEqual(errs('a,b\n1\n1,x,y\n1,z\n1,\n', s), [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 5, column: 'a', code: 'UNIQUE' },
    { row: 5, column: 'b', code: 'REQUIRED' },
  ]);
});

test('validate: các kiểu', () => {
  const t = (type, v) => errs(`a\n${v}\n`, S({ name: 'a', type })).length === 0;
  for (const v of ['007', '+5', '-0', '12']) assert.ok(t('int', v), v);
  for (const v of ['1.0', '1e3', ' 1', 'x', '9007199254740993']) assert.ok(!t('int', v), v);
  for (const v of ['1', '-1.50', '+0.5']) assert.ok(t('number', v), v);
  for (const v of ['5.', '.5', 'NaN', 'Infinity', '1e2', '1' + '0'.repeat(400)]) assert.ok(!t('number', v), v);
  for (const v of ['true', 'FALSE', 'True']) assert.ok(t('bool', v), v);
  for (const v of ['1', 'yes']) assert.ok(!t('bool', v), v);
  for (const v of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.ok(t('date', v), v);
  for (const v of ['2023-02-29', '1900-02-29', '2024-13-01', '0000-01-01', '2024-1-1', '2024-04-31']) {
    assert.ok(!t('date', v), v);
  }
});

test('validate: TYPE dừng, không vào UNIQUE', () => {
  const s = S({ name: 'a', type: 'int', min: 5, enum: ['x'], unique: true });
  assert.deepEqual(errs('a\nx\nx\n', s), [
    { row: 2, column: 'a', code: 'TYPE' },
    { row: 3, column: 'a', code: 'TYPE' },
  ]);
});

test('validate: enum, pattern không neo, độ dài theo code point, min/max', () => {
  assert.deepEqual(errs('a\nB\n', S({ name: 'a', enum: ['b'] })), [{ row: 2, column: 'a', code: 'ENUM' }]);
  assert.deepEqual(errs('a\nxabx\nzzz\n', S({ name: 'a', pattern: 'ab' })), [{ row: 3, column: 'a', code: 'PATTERN' }]);
  assert.deepEqual(errs('a\n😀😀\n😀\n', S({ name: 'a', minLength: 2, maxLength: 2 })), [
    { row: 3, column: 'a', code: 'MIN_LENGTH' },
  ]);
  assert.deepEqual(errs('a\nabc\n', S({ name: 'a', maxLength: 2 })), [{ row: 2, column: 'a', code: 'MAX_LENGTH' }]);
  const n = S({ name: 'a', type: 'number', min: 1, max: 3 });
  assert.deepEqual(errs('a\n1\n3\n0.5\n3.1\n', n), [
    { row: 4, column: 'a', code: 'MIN' }, { row: 5, column: 'a', code: 'MAX' },
  ]);
  const d = S({ name: 'a', type: 'date', min: '2024-01-01', max: '2024-12-31' });
  assert.deepEqual(errs('a\n2023-12-31\n2025-01-01\n2024-01-01\n', d), [
    { row: 2, column: 'a', code: 'MIN' }, { row: 3, column: 'a', code: 'MAX' },
  ]);
  // min/max bị bỏ qua với string
  assert.deepEqual(errs('a\nzzz\n', S({ name: 'a', min: 'b', max: 'c' })), []);
});

test('validate: ô rỗng bỏ qua mọi ràng buộc; unique nguyên văn', () => {
  const s = S({ name: 'a', type: 'int', unique: true, min: 5, pattern: '^9', minLength: 3 });
  assert.deepEqual(errs('a\n\n\n""\n', s), []);
  assert.deepEqual(errs('a\n1\n01\n1\n', S({ name: 'a', unique: true })), [
    { row: 4, column: 'a', code: 'UNIQUE' },
  ]);
});

test('validate: nhiều lỗi cùng lúc — thứ tự theo hàng, cột lược đồ, thứ tự kiểm', () => {
  const s = S(
    { name: 'z', enum: ['q'], pattern: '^1', minLength: 5, maxLength: 1, unique: true },
    { name: 'a', required: true },
  );
  // cột a đứng trước z trong tệp; ô có xuống dòng chỉ là một bản ghi; dòng trống không chiếm hàng
  const text = 'a,z\n\n"l1\nl2",ok\n\n,ok\n';
  assert.deepEqual(errs(text, s), [
    { row: 2, column: 'z', code: 'ENUM' },
    { row: 2, column: 'z', code: 'PATTERN' },
    { row: 2, column: 'z', code: 'MIN_LENGTH' },
    { row: 2, column: 'z', code: 'MAX_LENGTH' },
    { row: 3, column: 'z', code: 'ENUM' },
    { row: 3, column: 'z', code: 'PATTERN' },
    { row: 3, column: 'z', code: 'MIN_LENGTH' },
    { row: 3, column: 'z', code: 'MAX_LENGTH' },
    { row: 3, column: 'z', code: 'UNIQUE' },
    { row: 3, column: 'a', code: 'REQUIRED' },
  ]);
});

test('validate: schema sai ném CSV_INVALID_SCHEMA trước khi parse', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: 'x' }] },
    { columns: [{ name: 'a', type: 'number', max: Infinity }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bad) assert.equal(codeOf(() => validateCsv('"unterminated', s)), 'CSV_INVALID_SCHEMA');
});

test('validate: mỗi lỗi có đúng 3 khóa', () => {
  const e = errs('a,b\n,x\n', S({ name: 'a', required: true }))[0];
  assert.deepEqual(Object.keys(e).sort(), ['code', 'column', 'row']);
});
