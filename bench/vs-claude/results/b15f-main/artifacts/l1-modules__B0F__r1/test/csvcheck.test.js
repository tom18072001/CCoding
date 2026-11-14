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
const S = (cols) => ({ columns: cols });

test('parse: BOM chỉ bỏ một ký tự', () => {
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
});

test('parse: CRLF/LF/CR lẫn lộn, dòng cuối có/không newline', () => {
  assert.deepEqual(parseCsv('a\rb\nc\r\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a,b\n'), parseCsv('a,b'));
});

test('parse: dòng trống bị bỏ; dòng dấu cách và "" thì không', () => {
  assert.deepEqual(parseCsv('a\n\n\r\nb\n\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\n'), []);
});

test('parse: ô nháy giữ nguyên CRLF, dấu phân cách; không cắt khoảng trắng', () => {
  assert.deepEqual(parseCsv('"a\r\nb","c,d"\n'), [['a\r\nb', 'c,d']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(',\n'), [['', '']]);
  assert.deepEqual(parseCsv('"a"",""b"'), [['a","b']]);
});

test('parse: delimiter tùy chọn và không hợp lệ', () => {
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
  for (const d of ['"', '\r', '\n', '', ';;', 5]) {
    assert.equal(thrown(() => parseCsv('a', { delimiter: d })).code, 'CSV_INVALID_INPUT');
  }
  assert.equal(thrown(() => parseCsv(null)).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
});

test('parse: BAD_QUOTE và UNTERMINATED_QUOTE kèm row', () => {
  let e = thrown(() => parseCsv('a\nab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE'); assert.equal(e.row, 2);
  e = thrown(() => parseCsv('"ab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE'); assert.equal(e.row, 1);
  e = thrown(() => parseCsv('a\n\n"b\nc'));
  assert.equal(e.code, 'CSV_UNTERMINATED_QUOTE'); assert.equal(e.row, 2);
  assert.equal(thrown(() => parseCsv('"a""')).code, 'CSV_UNTERMINATED_QUOTE');
  assert.deepEqual(parseCsv('"ab"'), [['ab']]);
});

test('validate: EMPTY_INPUT, chỉ tiêu đề, lỗi phân tích', () => {
  const s = S([{ name: 'a' }]);
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('\n', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.equal(thrown(() => validateCsv(5, s)).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => validateCsv('a', s, { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
});

test('validate: ô nhiều dòng làm lệch số dòng nhưng không lệch số hàng', () => {
  const s = S([{ name: 'a' }, { name: 'n', type: 'int' }]);
  const r = validateCsv('a,n\n"x\ny\nz",1\nq,zz\n', s);
  assert.equal(r.rowCount, 2);
  assert.deepEqual(r.errors, [{ row: 3, column: 'n', code: 'TYPE' }]);
});

test('validate: MISSING_COLUMN, cột thừa, tên chính xác, tiêu đề lặp', () => {
  const s = S([{ name: 'x', required: true }, { name: 'a', required: true }]);
  const r = validateCsv('a,extra\n,1\n', s);
  assert.deepEqual(r.errors, [
    { row: 1, column: 'x', code: 'MISSING_COLUMN' },
    { row: 2, column: 'a', code: 'REQUIRED' },
  ]);
  assert.equal(validateCsv('A\n1', S([{ name: 'a' }])).errors[0].code, 'MISSING_COLUMN');
  assert.equal(validateCsv(' a\n1', S([{ name: 'a' }])).errors[0].code, 'MISSING_COLUMN');
  assert.deepEqual(validateCsv('a,a\n1,x', S([{ name: 'a', type: 'int' }])).errors, []);
});

test('validate: ROW_LENGTH đứng một mình, không vào UNIQUE', () => {
  const s = S([{ name: 'a', unique: true, required: true }, { name: 'b', required: true }]);
  const r = validateCsv('a,b\n1\n1,2,3\n1,\n1,x\n', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: 'b', code: 'REQUIRED' },
    { row: 5, column: 'a', code: 'UNIQUE' },
  ]);
});

test('validate: thứ tự lỗi theo lược đồ, không theo tệp', () => {
  const s = S([{ name: 'b', type: 'int' }, { name: 'a', type: 'int' }]);
  const r = validateCsv('a,b\nx,y\n', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: 'b', code: 'TYPE' },
    { row: 2, column: 'a', code: 'TYPE' },
  ]);
});

test('validate: nhiều lỗi trong một ô theo thứ tự cố định', () => {
  const s = S([{ name: 'v', enum: ['zzzzzz'], pattern: '^\\d$', minLength: 8, maxLength: 3, unique: true }]);
  const r = validateCsv('v\nabcde\nabcde', s);
  assert.deepEqual(r.errors.map((e) => e.code), [
    'ENUM', 'PATTERN', 'MIN_LENGTH', 'MAX_LENGTH',
    'ENUM', 'PATTERN', 'MIN_LENGTH', 'MAX_LENGTH', 'UNIQUE',
  ]);
  const s2 = S([{ name: 'n', type: 'int', min: 10, max: 5, unique: true }]);
  assert.deepEqual(validateCsv('n\n7\n7', s2).errors.map((e) => e.code), ['MIN', 'MAX', 'MIN', 'MAX', 'UNIQUE']);
});

test('validate: TYPE dừng và không vào tập UNIQUE', () => {
  const s = S([{ name: 'n', type: 'int', min: 5, unique: true, enum: ['1'] }]);
  const r = validateCsv('n\n1.0\n1.0\n', s);
  assert.deepEqual(r.errors.map((e) => e.code), ['TYPE', 'TYPE']);
});

test('validate: ô rỗng không bắt buộc bỏ qua mọi ràng buộc và UNIQUE', () => {
  const s = S([{ name: 'v', type: 'int', min: 5, enum: ['9'], pattern: 'x', minLength: 3, unique: true }]);
  assert.deepEqual(validateCsv('v\n\n""\n', s).errors, []);
  assert.deepEqual(validateCsv('v,w\n,1\n', S([{ name: 'v', required: true }])).errors, [{ row: 2, column: 'v', code: 'REQUIRED' }]);
  assert.equal(validateCsv('v\n" "', S([{ name: 'v', required: true, type: 'int' }])).errors[0].code, 'TYPE');
});

test('validate: kiểu int/number/bool/date', () => {
  const ok = (type, v) => validateCsv(`v\n${v}\n`, S([{ name: 'v', type }])).ok;
  for (const v of ['007', '+5', '-0', '9007199254740991']) assert.equal(ok('int', v), true, v);
  for (const v of ['1.0', '1e3', '9007199254740992', 'x']) assert.equal(ok('int', v), false, v);
  assert.equal(validateCsv('v\n" 1"', S([{ name: 'v', type: 'int' }])).ok, false);
  for (const v of ['1', '-1.50', '+0.5']) assert.equal(ok('number', v), true, v);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity']) assert.equal(ok('number', v), false, v);
  for (const v of ['true', 'FALSE', 'True']) assert.equal(ok('bool', v), true, v);
  for (const v of ['1', 'yes']) assert.equal(ok('bool', v), false, v);
  for (const v of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.equal(ok('date', v), true, v);
  for (const v of ['2023-02-29', '1900-02-29', '2024-13-01', '0000-01-01', '2024-1-1', '2024-04-31']) assert.equal(ok('date', v), false, v);
});

test('validate: min/max, minLength/maxLength theo ngữ cảnh kiểu', () => {
  const s = S([
    { name: 'n', type: 'number', min: 1.5, max: 2.5 },
    { name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' },
    { name: 's', min: 100, maxLength: 2, minLength: 2 },
  ]);
  const r = validateCsv('n,d,s\n1.5,2024-01-01,ab\n2.5,2024-12-31,ab\n1.4,2023-12-31,\u{1F600}\u{1F600}\n2.6,2025-01-01,a\n', s);
  assert.deepEqual(r.errors, [
    { row: 4, column: 'n', code: 'MIN' },
    { row: 4, column: 'd', code: 'MIN' },
    { row: 5, column: 'n', code: 'MAX' },
    { row: 5, column: 'd', code: 'MAX' },
    { row: 5, column: 's', code: 'MIN_LENGTH' },
  ]);
});

test('validate: enum phân biệt hoa thường; pattern không neo; unique nguyên văn', () => {
  const s = S([{ name: 'r', enum: ['admin'] }, { name: 'p', pattern: 'ab' }, { name: 'u', type: 'int', unique: true }]);
  const r = validateCsv('r,p,u\nAdmin,xaby,1\nadmin,zz,01\nadmin,ab,1\n', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: 'r', code: 'ENUM' },
    { row: 3, column: 'p', code: 'PATTERN' },
    { row: 4, column: 'u', code: 'UNIQUE' },
  ]);
});

test('validate: delimiter được chuyển cho parser', () => {
  const r = validateCsv('a;b\n1;2\n', S([{ name: 'b', type: 'int' }]), { delimiter: ';' });
  assert.deepEqual(r, { ok: true, rowCount: 1, errors: [] });
});

test('validate: lược đồ sai ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'number', max: NaN }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bad) {
    assert.equal(thrown(() => validateCsv('"unterminated', s)).code, 'CSV_INVALID_SCHEMA', JSON.stringify(s));
  }
});

test('validate: mỗi lỗi có đúng 3 khóa', () => {
  const r = validateCsv('a\n1,2\n', S([{ name: 'a' }, { name: 'z' }]));
  assert.ok(r.errors.length >= 2);
  for (const e of r.errors) assert.deepEqual(Object.keys(e).sort(), ['code', 'column', 'row']);
});
