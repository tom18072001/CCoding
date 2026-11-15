import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const code = (f) => { try { f(); } catch (e) { return e; } return null; };
const S = (cols) => ({ columns: cols });

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

test('parseCsv: kết thúc dòng lẫn lộn, dòng trống, dòng cuối', () => {
  assert.deepEqual(parseCsv('a\rb\r\nc\n\n\r\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\n'), []);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parseCsv: nháy giữ nguyên CRLF, BOM thứ hai là dữ liệu', () => {
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('"a";"b"', { delimiter: ';' }), [['a', 'b']]);
});

test('parseCsv: lỗi và row', () => {
  let e = code(() => parseCsv('a\n"b\nc'));
  assert.equal(e.code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(e.row, 2);
  e = code(() => parseCsv('a\n\nab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE');
  assert.equal(e.row, 2);
  e = code(() => parseCsv('"ab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE');
  assert.equal(e.row, 1);
  assert.equal(code(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
  for (const d of ['"', '\n', '\r', ';;', '']) {
    assert.equal(code(() => parseCsv('a', { delimiter: d })).code, 'CSV_INVALID_INPUT');
  }
});

test('validateCsv: lược đồ sai ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bad = [
    null, {}, { columns: [] }, S([1]), S([{}]), S([{ name: 'a' }, { name: 'a' }]),
    S([{ name: 'a', type: 'x' }]), S([{ name: 'a', pattern: '(' }]),
    S([{ name: 'a', enum: [] }]), S([{ name: 'a', enum: [1] }]),
    S([{ name: 'a', type: 'int', min: '1' }]), S([{ name: 'a', type: 'date', max: '2023-02-29' }]),
    S([{ name: 'a', minLength: -1 }]), S([{ name: 'a', maxLength: 1.5 }]),
  ];
  for (const s of bad) {
    assert.equal(code(() => validateCsv('a\n1', s)).code, 'CSV_INVALID_SCHEMA');
    assert.equal(code(() => validateCsv(null, s)).code, 'CSV_INVALID_SCHEMA');
  }
  assert.equal(code(() => validateCsv(null, S([{ name: 'a' }]))).code, 'CSV_INVALID_INPUT');
});

test('validateCsv: lỗi phân tích, tệp rỗng, chỉ tiêu đề', () => {
  const s = S([{ name: 'a' }]);
  assert.deepEqual(validateCsv('a\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
});

test('validateCsv: header, MISSING_COLUMN, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const s = S([{ name: 'x', required: true }, { name: 'a', required: true }, { name: 'b', required: true }]);
  const r = validateCsv('a,b,a\n,,1\n1\n1,2,3,4\n"x\ny",,', s);
  assert.deepEqual(r.errors, [
    { row: 1, column: 'x', code: 'MISSING_COLUMN' },
    { row: 2, column: 'a', code: 'REQUIRED' },
    { row: 2, column: 'b', code: 'REQUIRED' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: null, code: 'ROW_LENGTH' },
    { row: 5, column: 'b', code: 'REQUIRED' },
  ]);
  assert.equal(r.rowCount, 4);
  assert.equal(validateCsv(' a\n1', S([{ name: 'a' }])).errors[0].code, 'MISSING_COLUMN');
  assert.equal(validateCsv('A\n1', S([{ name: 'a' }])).errors[0].code, 'MISSING_COLUMN');
  const r2 = validateCsv('b,a\nx,y', S([{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }]));
  assert.deepEqual(r2.errors.map((e) => e.column), ['a', 'b']);
});

test('validateCsv: dòng trống không chiếm số hàng, xuống dòng trong ô là một bản ghi', () => {
  const s = S([{ name: 'a', type: 'int' }]);
  const r = validateCsv('a\n\n"1\n2"\n\nx', s);
  assert.deepEqual(r.errors, [{ row: 2, column: 'a', code: 'TYPE' }, { row: 3, column: 'a', code: 'TYPE' }]);
  assert.equal(r.rowCount, 2);
});

test('validateCsv: kiểu dữ liệu', () => {
  const t = (type, good, badv) => {
    const s = S([{ name: 'a', type }]);
    for (const v of good) assert.equal(validateCsv(`a\n"${v}"`, s).ok, true, `${type} ${v}`);
    for (const v of badv) {
      assert.deepEqual(validateCsv(`a\n"${v}"`, s).errors, [{ row: 2, column: 'a', code: 'TYPE' }], `${type} ${v}`);
    }
  };
  t('int', ['007', '+5', '-0', '12'], ['1.0', '1e3', ' 1', '9007199254740993', 'a']);
  t('number', ['1', '-1.5', '+0.25', '007'], ['5.', '.5', '1e3', 'NaN', 'Infinity', ' 1']);
  t('bool', ['true', 'FALSE', 'True'], ['1', 'yes']);
  t('date', ['2024-02-29', '2023-12-31'], ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-01', '2024-00-10', '2024-04-31']);
  t('string', ['anything', ' '], []);
});

test('validateCsv: ô rỗng không bắt buộc bỏ qua mọi ràng buộc và UNIQUE', () => {
  const s = S([{ name: 'a', type: 'int', min: 5, minLength: 3, unique: true, enum: ['9'], pattern: '^9$' }]);
  assert.deepEqual(validateCsv('a\n""\n""', s).errors, []);
  assert.equal(validateCsv('a,b\n,\n,', S([{ name: 'a', unique: true }])).ok, true);
});

test('validateCsv: ENUM, PATTERN, độ dài, MIN/MAX, thứ tự và không dừng nhau', () => {
  const s = S([{ name: 'a', enum: ['ab'], pattern: '^z', minLength: 3, maxLength: 1 }]);
  assert.deepEqual(validateCsv('a\nxy', s).errors.map((e) => e.code), ['ENUM', 'PATTERN', 'MIN_LENGTH', 'MAX_LENGTH']);
  assert.deepEqual(validateCsv('a\nAB', S([{ name: 'a', enum: ['ab'] }])).errors.map((e) => e.code), ['ENUM']);
  assert.equal(validateCsv('a\nxxabxx', S([{ name: 'a', pattern: 'ab' }])).ok, true);
  assert.equal(validateCsv('a\n😀😀', S([{ name: 'a', maxLength: 2 }])).ok, true);
  assert.equal(validateCsv('a\n😀😀😀', S([{ name: 'a', maxLength: 2 }])).errors[0].code, 'MAX_LENGTH');
  const m = S([{ name: 'a', type: 'int', min: 2, max: 4 }]);
  assert.equal(validateCsv('a\n2\n4', m).ok, true);
  assert.deepEqual(validateCsv('a\n1\n5', m).errors.map((e) => e.code), ['MIN', 'MAX']);
  const d = S([{ name: 'a', type: 'date', min: '2024-01-01', max: '2024-12-31' }]);
  assert.equal(validateCsv('a\n2024-01-01\n2024-12-31', d).ok, true);
  assert.deepEqual(validateCsv('a\n2023-12-31\n2025-01-01', d).errors.map((e) => e.code), ['MIN', 'MAX']);
  assert.equal(validateCsv('a\nabc', S([{ name: 'a', min: 100, max: 1 }])).ok, true);
  assert.equal(validateCsv('a\ntrue', S([{ name: 'a', type: 'bool', min: 100 }])).ok, true);
  assert.deepEqual(validateCsv('a\n12', S([{ name: 'a', type: 'int', enum: ['1'] }])).errors.map((e) => e.code), ['ENUM']);
});

test('validateCsv: sai kiểu thì dừng và không vào tập UNIQUE', () => {
  const s = S([{ name: 'a', type: 'int', min: 5, unique: true, enum: ['q'] }]);
  const r = validateCsv('a\nx\nx\n1', s);
  assert.deepEqual(r.errors.map((e) => [e.row, e.code]), [[2, 'TYPE'], [3, 'TYPE'], [4, 'ENUM'], [4, 'MIN']]);
  const u = S([{ name: 'a', type: 'int', unique: true, max: 5 }]);
  assert.deepEqual(validateCsv('a\n1\n01\n9\n9', u).errors.map((e) => [e.row, e.code]), [[4, 'MAX'], [5, 'MAX'], [5, 'UNIQUE']]);
  const w = S([{ name: 'a', unique: true }]);
  assert.deepEqual(validateCsv('a,b\nx\nx,1', w).errors, [{ row: 2, column: null, code: 'ROW_LENGTH' }]);
});

test('validateCsv: delimiter tùy chọn và lỗi đầu vào', () => {
  const s = S([{ name: 'b', type: 'int' }]);
  assert.equal(validateCsv('a;b\n1;2', s, { delimiter: ';' }).ok, true);
  assert.equal(code(() => validateCsv('a', s, { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
  const e = validateCsv('b\nx', s).errors[0];
  assert.deepEqual(Object.keys(e).sort(), ['code', 'column', 'row']);
});
