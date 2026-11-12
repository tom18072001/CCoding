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

const catchErr = (f) => { try { f(); } catch (e) { return e; } return null; };
const S = (...columns) => ({ columns });
const errs = (t, s, o) => validateCsv(t, s, o).errors;

test('parseCsv: kết thúc dòng lẫn lộn, dòng cuối, dòng trống', () => {
  assert.deepEqual(parseCsv('a\rb\r\nc\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a\n\n\r\nb\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(',\n'), [['', '']]);
});

test('parseCsv: giữ CRLF trong nháy, không cắt khoảng trắng, BOM thứ hai là dữ liệu', () => {
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
});

test('parseCsv: lỗi và row', () => {
  assert.equal(catchErr(() => parseCsv(1)).code, 'CSV_INVALID_INPUT');
  for (const d of ['"', '\n', '\r', ';;', '']) {
    assert.equal(catchErr(() => parseCsv('a', { delimiter: d })).code, 'CSV_INVALID_INPUT');
  }
  let e = catchErr(() => parseCsv('a\n\nb,"c'));
  assert.equal(e.code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(e.row, 2);
  e = catchErr(() => parseCsv('a\nab"c'));
  assert.equal([e.code, e.row].join(), 'CSV_BAD_QUOTE,2');
  e = catchErr(() => parseCsv('"ab"c'));
  assert.equal([e.code, e.row].join(), 'CSV_BAD_QUOTE,1');
});

test('validateCsv: lược đồ sai ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bad = [
    null, {}, { columns: [] }, S(1), S({}), S({ name: 'a' }, { name: 'a' }),
    S({ name: 'a', type: 'x' }), S({ name: 'a', pattern: '(' }),
    S({ name: 'a', enum: [] }), S({ name: 'a', enum: [1] }),
    S({ name: 'a', type: 'int', min: '1' }), S({ name: 'a', type: 'number', max: NaN }),
    S({ name: 'a', type: 'date', min: '2023-02-29' }),
    S({ name: 'a', minLength: -1 }), S({ name: 'a', maxLength: 1.5 }),
  ];
  for (const s of bad) assert.equal(catchErr(() => validateCsv(5, s)).code, 'CSV_INVALID_SCHEMA');
  assert.equal(catchErr(() => validateCsv(5, S({ name: 'a' }))).code, 'CSV_INVALID_INPUT');
  assert.equal(catchErr(() => validateCsv('a', S({ name: 'a' }), { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
});

test('validateCsv: lỗi phân tích, tệp rỗng, chỉ tiêu đề', () => {
  const s = S({ name: 'a' });
  assert.deepEqual(validateCsv('a\n1\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(errs('a\nx"y', s), [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('\n\n', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
});

test('validateCsv: MISSING_COLUMN, tên chính xác, cột lặp, cột thừa', () => {
  const s = S({ name: 'a', required: true }, { name: 'b', required: true }, { name: 'c', type: 'int' });
  assert.deepEqual(errs('a,c,zz\n1,x,9\n', s), [
    { row: 1, column: 'b', code: 'MISSING_COLUMN' },
    { row: 2, column: 'c', code: 'TYPE' },
  ]);
  assert.deepEqual(errs('A\n1', S({ name: 'a' })), [{ row: 1, column: 'a', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(errs(' a\n1', S({ name: 'a' })), [{ row: 1, column: 'a', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(errs('a,a\nx,5', S({ name: 'a', type: 'int' })), [{ row: 2, column: 'a', code: 'TYPE' }]);
});

test('validateCsv: ROW_LENGTH đứng một mình, không vào UNIQUE; số hàng đếm bản ghi', () => {
  const s = S({ name: 'a', unique: true, required: true }, { name: 'b', required: true });
  const r = validateCsv('a,b\n\n1\n1,2,3\n"x\ny",\n1,z\n1,z\n', s);
  assert.equal(r.rowCount, 5);
  assert.deepEqual(r.errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: 'b', code: 'REQUIRED' },
    { row: 6, column: 'a', code: 'UNIQUE' },
  ]);
});

test('validateCsv: thứ tự lỗi theo lược đồ, không theo tệp', () => {
  const s = S({ name: 'x', required: true }, { name: 'y', required: true });
  assert.deepEqual(errs('y,x\n,\n', s), [
    { row: 2, column: 'x', code: 'REQUIRED' },
    { row: 2, column: 'y', code: 'REQUIRED' },
  ]);
});

test('validateCsv: ô rỗng không bắt buộc bỏ qua mọi ràng buộc, không vào UNIQUE', () => {
  const s = S({ name: 'a', type: 'int', unique: true, min: 5, enum: ['9'], pattern: '^9$', minLength: 3 });
  assert.deepEqual(errs('a\n""\n""\n', s), []);
  assert.deepEqual(errs('a\n""\n""\n9\n', S({ name: 'a', unique: true })), []);
});

test('validateCsv: TYPE dừng, các bước 3–9 không dừng nhau, đúng thứ tự', () => {
  const s = S({ name: 'a', type: 'int', enum: ['5'], pattern: '^9', minLength: 2, maxLength: 0, min: 10, max: 1, unique: true });
  assert.deepEqual(errs('a\nx\n', s), [{ row: 2, column: 'a', code: 'TYPE' }]);
  assert.deepEqual(errs('a\n5\n5\n', s).map((e) => e.row + e.code), [
    '2PATTERN', '2MIN_LENGTH', '2MAX_LENGTH', '2MIN', '2MAX',
    '3PATTERN', '3MIN_LENGTH', '3MAX_LENGTH', '3MIN', '3MAX', '3UNIQUE',
  ]);
  assert.deepEqual(errs('a\n7\n', S({ name: 'a', enum: ['1'] })), [{ row: 2, column: 'a', code: 'ENUM' }]);
  assert.deepEqual(errs('a\nx\nx\n', S({ name: 'a', type: 'int', unique: true })).map((e) => e.code), ['TYPE', 'TYPE']);
});

test('validateCsv: kiểu int/number/bool/date', () => {
  const ok = (type, v) => errs(`a\n${v}\n`, S({ name: 'a', type })).length === 0;
  for (const v of ['007', '+5', '-0', '12']) assert.ok(ok('int', v), v);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993', 'a']) assert.ok(!ok('int', v), v);
  for (const v of ['1', '-1.5', '+0.25', '007.5']) assert.ok(ok('number', v), v);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity', '1,5', '1' + '0'.repeat(400)]) assert.ok(!ok('number', v), v);
  for (const v of ['true', 'FALSE', 'True']) assert.ok(ok('bool', v), v);
  for (const v of ['1', 'yes', 'truee']) assert.ok(!ok('bool', v), v);
  for (const v of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.ok(ok('date', v), v);
  for (const v of ['2023-02-29', '1900-02-29', '2024-13-01', '2024-00-10', '2024-04-31', '0000-01-01', '2024-1-1', '2024/01/01']) {
    assert.ok(!ok('date', v), v);
  }
  assert.ok(ok('string', ' anything q '));
});

test('validateCsv: min/max bao gồm biên; date so chuỗi; string/bool bỏ qua', () => {
  const s = S({ name: 'n', type: 'number', min: 1, max: 2.5 }, { name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' });
  assert.deepEqual(errs('n,d\n1,2024-01-01\n2.5,2024-12-31\n0.9,2023-12-31\n2.6,2025-01-01\n', s), [
    { row: 4, column: 'n', code: 'MIN' }, { row: 4, column: 'd', code: 'MIN' },
    { row: 5, column: 'n', code: 'MAX' }, { row: 5, column: 'd', code: 'MAX' },
  ]);
  assert.deepEqual(errs('a,b\nzzz,true\n', S({ name: 'a', min: 5, max: 'x' }, { name: 'b', type: 'bool', min: 1, max: 0 })), []);
});

test('validateCsv: pattern không neo, enum phân biệt hoa thường, mọi kiểu', () => {
  assert.deepEqual(errs('a\nxabx\n', S({ name: 'a', pattern: 'ab' })), []);
  assert.deepEqual(errs('a\nxabx\n', S({ name: 'a', pattern: '^ab$' })), [{ row: 2, column: 'a', code: 'PATTERN' }]);
  assert.deepEqual(errs('a\nAdmin\n', S({ name: 'a', enum: ['admin'] })), [{ row: 2, column: 'a', code: 'ENUM' }]);
  assert.deepEqual(errs('a\n007\n', S({ name: 'a', type: 'int', enum: ['7'] })), [{ row: 2, column: 'a', code: 'ENUM' }]);
  assert.deepEqual(errs('a\n5\n', S({ name: 'a', type: 'int', pattern: '^6' })), [{ row: 2, column: 'a', code: 'PATTERN' }]);
});

test('validateCsv: độ dài theo điểm mã, không cắt khoảng trắng', () => {
  assert.deepEqual(errs('a\n😀😀😀\n', S({ name: 'a', maxLength: 3, minLength: 3 })), []);
  assert.deepEqual(errs('a\n😀\n', S({ name: 'a', minLength: 2 })), [{ row: 2, column: 'a', code: 'MIN_LENGTH' }]);
  assert.deepEqual(errs('a\n007\n', S({ name: 'a', type: 'int', maxLength: 2 })), [{ row: 2, column: 'a', code: 'MAX_LENGTH' }]);
  assert.deepEqual(errs('a\n" "\n', S({ name: 'a', required: true, type: 'int' })), [{ row: 2, column: 'a', code: 'TYPE' }]);
});

test('validateCsv: UNIQUE nguyên văn; ô có xuống dòng là một hàng; delimiter; khóa lỗi', () => {
  assert.deepEqual(errs('a\n1\n01\n1\n1\n', S({ name: 'a', unique: true })), [
    { row: 4, column: 'a', code: 'UNIQUE' }, { row: 5, column: 'a', code: 'UNIQUE' },
  ]);
  assert.deepEqual(errs('a;b\n"x\ny";q\n1;2\n', S({ name: 'b', type: 'int' }), { delimiter: ';' }), [
    { row: 2, column: 'b', code: 'TYPE' },
  ]);
  assert.deepEqual(Object.keys(validateCsv('a\nx', S({ name: 'a', type: 'int' })).errors[0]), ['row', 'column', 'code']);
  assert.equal(validateCsv('a\n1\n', S({ name: 'a' })).ok, true);
});
