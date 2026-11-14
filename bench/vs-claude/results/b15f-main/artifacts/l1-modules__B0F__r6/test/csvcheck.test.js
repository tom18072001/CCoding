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

const errs = (text, columns, opts) => validateCsv(text, { columns }, opts).errors;

test('csvcheck: parse — quoting, dòng trống, kết thúc dòng', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\n\n\nb'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('a\rb\r\nc\n'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('"x,y",z'), [['x,y', 'z']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
});

test('csvcheck: parse — lỗi và row', () => {
  assert.throws(() => parseCsv(5), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a', { delimiter: '"' }), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a', { delimiter: ';;' }), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a\n\nb\n"x\ny'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 3);
});

test('csvcheck: validate — lỗi parse, rỗng, chỉ tiêu đề', () => {
  const cols = [{ name: 'a' }];
  assert.deepEqual(validateCsv('a\n"x', { columns: cols }), {
    ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(errs('a\nx"y', cols), [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('', { columns: cols }), {
    ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n', { columns: cols }), { ok: true, rowCount: 0, errors: [] });
  assert.throws(() => validateCsv(1, { columns: cols }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck: validate — CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: [1] },
    { columns: [{}] }, { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: 'x' }] },
    { columns: [{ name: 'a', type: 'date', max: '2023-02-30' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bad) {
    assert.throws(() => validateCsv('"không đóng', s), (e) => e.code === 'CSV_INVALID_SCHEMA');
  }
});

test('csvcheck: từng mã lỗi', () => {
  assert.deepEqual(errs('a\n1', [{ name: 'a' }, { name: 'b' }, { name: 'c', required: true }]), [
    { row: 1, column: 'b', code: 'MISSING_COLUMN' },
    { row: 1, column: 'c', code: 'MISSING_COLUMN' },
  ]);
  assert.deepEqual(errs('a,b\n1\n1,2,3\n\n', [{ name: 'a', required: true }]), [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
  ]);
  assert.deepEqual(errs('a\n""', [{ name: 'a', required: true }]), [{ row: 2, column: 'a', code: 'REQUIRED' }]);
  assert.deepEqual(errs('a\nq', [{ name: 'a', enum: ['x', 'y'] }]), [{ row: 2, column: 'a', code: 'ENUM' }]);
  assert.deepEqual(errs('a\nX', [{ name: 'a', enum: ['x'] }]), [{ row: 2, column: 'a', code: 'ENUM' }]);
  assert.deepEqual(errs('a\nxyz\nb', [{ name: 'a', pattern: '^b$' }]), [{ row: 2, column: 'a', code: 'PATTERN' }]);
  assert.deepEqual(errs('a\nxbz', [{ name: 'a', pattern: 'b' }]), []);
  assert.deepEqual(errs('a\nab\nabcd\nÀ😀', [{ name: 'a', minLength: 2, maxLength: 3 }]), [
    { row: 3, column: 'a', code: 'MAX_LENGTH' }]);
  assert.deepEqual(errs('a\nx', [{ name: 'a', minLength: 2 }]), [{ row: 2, column: 'a', code: 'MIN_LENGTH' }]);
  assert.deepEqual(errs('a\n0\n11', [{ name: 'a', type: 'int', min: 1, max: 10 }]), [
    { row: 2, column: 'a', code: 'MIN' }, { row: 3, column: 'a', code: 'MAX' }]);
  assert.deepEqual(errs('a\n2024-01-01\n2025-01-01', [{ name: 'a', type: 'date', min: '2024-06-01', max: '2024-12-31' }]), [
    { row: 2, column: 'a', code: 'MIN' }, { row: 3, column: 'a', code: 'MAX' }]);
  assert.deepEqual(errs('a\n1\n01\n1', [{ name: 'a', unique: true }]), [
    { row: 4, column: 'a', code: 'UNIQUE' }]);
});

test('csvcheck: ROW_LENGTH đứng một mình, không ghi vào UNIQUE', () => {
  const cols = [{ name: 'a', unique: true, required: true }];
  assert.deepEqual(errs('a,b\n5\n5,1\n5,2', cols), [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: 'a', code: 'UNIQUE' }]);
});

test('csvcheck: kiểu dữ liệu', () => {
  const t = (type, ok, bad) => {
    for (const v of ok) assert.deepEqual(errs('a\n' + v, [{ name: 'a', type }]), [], type + ' ' + v);
    for (const v of bad) {
      assert.deepEqual(errs('a\n' + v, [{ name: 'a', type }]),
        [{ row: 2, column: 'a', code: 'TYPE' }], type + ' ' + v);
    }
  };
  t('int', ['007', '+5', '-0', '-12'], ['1.0', '1e3', ' 1', 'abc', '9007199254740993']);
  t('number', ['1', '-1.5', '+0.25'], ['5.', '.5', '1e3', 'NaN', 'Infinity']);
  t('bool', ['true', 'FALSE', 'True'], ['1', 'yes']);
  t('date', ['2024-02-29', '2000-02-29'], ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-01', '1900-02-29']);
});

test('csvcheck: TYPE dừng ô, không vào UNIQUE; min/max bỏ qua cho string; ô rỗng bỏ qua ràng buộc', () => {
  assert.deepEqual(errs('a\nx\nx', [{ name: 'a', type: 'int', unique: true, min: 5, enum: ['1'] }]), [
    { row: 2, column: 'a', code: 'TYPE' }, { row: 3, column: 'a', code: 'TYPE' }]);
  assert.deepEqual(errs('a\nz', [{ name: 'a', min: 'zzz', max: 1 }]), []);
  assert.deepEqual(errs('a,b\n,x\n,y', [{ name: 'a', pattern: 'x', enum: ['q'], minLength: 3, unique: true }]), []);
});

test('csvcheck: nhiều lỗi một ô theo thứ tự kiểm', () => {
  assert.deepEqual(errs('a\nabcdef', [{ name: 'a', enum: ['q'], pattern: '^z', minLength: 10, maxLength: 3 }]), [
    { row: 2, column: 'a', code: 'ENUM' }, { row: 2, column: 'a', code: 'PATTERN' },
    { row: 2, column: 'a', code: 'MIN_LENGTH' }, { row: 2, column: 'a', code: 'MAX_LENGTH' }]);
  assert.deepEqual(errs('a\n5\n5', [{ name: 'a', type: 'int', enum: ['9'], min: 6, max: 4, unique: true }]), [
    { row: 2, column: 'a', code: 'ENUM' }, { row: 2, column: 'a', code: 'MIN' }, { row: 2, column: 'a', code: 'MAX' },
    { row: 3, column: 'a', code: 'ENUM' }, { row: 3, column: 'a', code: 'MIN' }, { row: 3, column: 'a', code: 'MAX' },
    { row: 3, column: 'a', code: 'UNIQUE' }]);
});

test('csvcheck: thứ tự cột theo lược đồ, nhiều hàng, tiêu đề lặp, cột thừa', () => {
  const cols = [{ name: 'x', type: 'int' }, { name: 'y', type: 'int' }];
  assert.deepEqual(errs('y,junk,x\nb,1,a\n1,1,1\nb,1,a', cols), [
    { row: 2, column: 'x', code: 'TYPE' }, { row: 2, column: 'y', code: 'TYPE' },
    { row: 4, column: 'x', code: 'TYPE' }, { row: 4, column: 'y', code: 'TYPE' }]);
  assert.deepEqual(errs('x,x\n1,a', [{ name: 'x', type: 'int' }]), []);
  assert.deepEqual(errs('x,X\na,1', [{ name: 'X', type: 'int' }]), []);
  assert.deepEqual(errs('x, x\na,1', [{ name: 'x', type: 'int' }]), [{ row: 2, column: 'x', code: 'TYPE' }]);
});

test('csvcheck: ô nhiều dòng và dòng trống không làm lệch số hàng', () => {
  const r = validateCsv('a\n"l1\nl2"\n\n\nx\n', { columns: [{ name: 'a', maxLength: 1 }] });
  assert.equal(r.rowCount, 2);
  assert.deepEqual(r.errors, [{ row: 2, column: 'a', code: 'MAX_LENGTH' }]);
  const r2 = validateCsv('a,b\n"p\nq",1\n\nz,k', { columns: [{ name: 'b', type: 'int' }] });
  assert.deepEqual(r2.errors, [{ row: 3, column: 'b', code: 'TYPE' }]);
});

test('csvcheck: delimiter chuyển cho parse; mỗi lỗi đúng 3 khóa', () => {
  const r = validateCsv('a;b\n1;x', { columns: [{ name: 'b', type: 'int' }] }, { delimiter: ';' });
  assert.deepEqual(Object.keys(r.errors[0]), ['row', 'column', 'code']);
  assert.equal(r.errors.length, 1);
});
