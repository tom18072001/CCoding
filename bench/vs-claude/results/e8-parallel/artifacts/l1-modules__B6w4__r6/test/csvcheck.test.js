import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const thrown = (fn, code) => assert.throws(fn, (e) => e.code === code);
const codes = (r) => r.errors.map((e) => `${e.row}:${e.column}:${e.code}`);

test('parse: ví dụ cơ bản và kết thúc dòng lẫn lộn', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a\rb\nc\r\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
});
test('parse: BOM chỉ bỏ một', () => {
  assert.deepEqual(parseCsv('﻿a;b', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
});
test('parse: dòng trống, dấu cách, "" và rỗng', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a\n\n\r\nb\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});
test('parse: CRLF trong nháy giữ nguyên', () => {
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
});
test('parse: lỗi', () => {
  thrown(() => parseCsv(5), 'CSV_INVALID_INPUT');
  thrown(() => parseCsv('a', { delimiter: '"' }), 'CSV_INVALID_INPUT');
  thrown(() => parseCsv('a', { delimiter: ';;' }), 'CSV_INVALID_INPUT');
  assert.throws(() => parseCsv('a\n"b'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a\n\n"x\ny"\n"ab"c'), (e) => e.row === 3);
});

const S = { columns: [
  { name: 'id', type: 'int', required: true, unique: true, min: 1 },
  { name: 'name', maxLength: 5 },
] };

test('validate: ví dụ đặc tả', () => {
  const r = validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', S);
  assert.deepEqual(r, { ok: false, rowCount: 4, errors: [
    { row: 3, column: 'id', code: 'UNIQUE' },
    { row: 3, column: 'name', code: 'MAX_LENGTH' },
    { row: 4, column: 'id', code: 'TYPE' },
    { row: 5, column: 'id', code: 'REQUIRED' },
  ] });
});
test('validate: schema sai ném trước khi phân tích', () => {
  for (const s of [null, {}, { columns: [] }, { columns: [1] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{}] },
    { columns: [{ name: 'a', type: 'x' }] }, { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] }, { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'date', max: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] }]) {
    thrown(() => validateCsv('"unterminated', s), 'CSV_INVALID_SCHEMA');
  }
  thrown(() => validateCsv(1, S), 'CSV_INVALID_INPUT');
});
test('validate: lỗi phân tích và rỗng', () => {
  assert.deepEqual(validateCsv('id\n1\n"x', S).errors, [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('id\na"b', S).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.equal(validateCsv('id\na"b', S).rowCount, 0);
  assert.deepEqual(validateCsv('', S), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('id,name\n', S), { ok: true, rowCount: 0, errors: [] });
});
test('validate: MISSING_COLUMN, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const r = validateCsv('name,id\nAn,1\nB\nC,2,3\nD,x', {
    columns: [{ name: 'id', type: 'int' }, { name: 'name', minLength: 2 }, { name: 'zz', required: true }] });
  assert.deepEqual(codes(r), ['1:zz:MISSING_COLUMN', '3:null:ROW_LENGTH',
    '4:null:ROW_LENGTH', '5:id:TYPE', '5:name:MIN_LENGTH']);
});
test('validate: ROW_LENGTH không vào tập unique; tên tiêu đề trùng lấy cột đầu', () => {
  const s = { columns: [{ name: 'a', unique: true }] };
  assert.deepEqual(codes(validateCsv('a,b\n1\n1,2\n1,3', s)), ['2:null:ROW_LENGTH', '4:a:UNIQUE']);
  assert.deepEqual(codes(validateCsv('a,a\n1,1\n1,2', s)), ['3:a:UNIQUE']);
  assert.deepEqual(codes(validateCsv(' a,A\n1,1', s)), ['1:a:MISSING_COLUMN']);
});
test('validate: số hàng đếm bản ghi', () => {
  const r = validateCsv('id\n\n"1\n2"\n\nx\n', { columns: [{ name: 'id', type: 'int' }] });
  assert.deepEqual(codes(r), ['2:id:TYPE', '3:id:TYPE']);
  assert.equal(r.rowCount, 2);
});
test('validate: kiểu', () => {
  const t = (type, good, bad) => {
    const s = { columns: [{ name: 'v', type }] };
    for (const g of good) assert.equal(validateCsv('v\n' + g, s).ok, true, `${type} ${g}`);
    for (const b of bad) assert.deepEqual(codes(validateCsv('v\n"' + b + '"', s)), ['2:v:TYPE'], `${type} ${b}`);
  };
  t('int', ['007', '+5', '-0', '12'], ['1.0', '1e3', ' 1', '9007199254740993', 'a']);
  t('number', ['1', '-1.50', '+0.5'], ['5.', '.5', '1e3', 'NaN', 'Infinity', '1,5']);
  t('bool', ['true', 'FALSE', 'True'], ['1', 'yes']);
  t('date', ['2024-02-29', '2000-02-29'], ['2023-02-29', '2024-13-01', '0000-01-01', '1900-02-29', '2024-1-1', '2024-04-31']);
  t('string', ['anything', ' '], []);
});
test('validate: dừng ở TYPE, rỗng bỏ qua ràng buộc', () => {
  const s = { columns: [{ name: 'v', type: 'int', enum: ['1'], min: 5, unique: true }] };
  assert.deepEqual(codes(validateCsv('v\nx\nx', s)), ['2:v:TYPE', '3:v:TYPE']);
  const s2 = { columns: [{ name: 'v', enum: ['a'], pattern: '^z$', minLength: 3, unique: true }] };
  assert.deepEqual(validateCsv('v\n""\n""', s2).errors, []);
});
test('validate: thứ tự kiểm một ô, không dừng nhau', () => {
  const s = { columns: [{ name: 'v', type: 'int', enum: ['1', '2'], pattern: '^9', minLength: 3, min: 100 }] };
  assert.deepEqual(codes(validateCsv('v\n5', s)), ['2:v:ENUM', '2:v:PATTERN', '2:v:MIN_LENGTH', '2:v:MIN']);
  const s3 = { columns: [{ name: 'v', type: 'int', enum: ['1', '2'], pattern: '^9', maxLength: 0, max: -100, unique: true }] };
  assert.deepEqual(codes(validateCsv('v\n5\n5', s3)), ['2:v:ENUM', '2:v:PATTERN', '2:v:MAX_LENGTH', '2:v:MAX',
    '3:v:ENUM', '3:v:PATTERN', '3:v:MAX_LENGTH', '3:v:MAX', '3:v:UNIQUE']);
});
test('validate: enum/pattern/length/min/max/unique chi tiết', () => {
  assert.deepEqual(codes(validateCsv('v\nA\na', { columns: [{ name: 'v', enum: ['a'] }] })), ['2:v:ENUM']);
  assert.deepEqual(codes(validateCsv('v\nxab\nb', { columns: [{ name: 'v', pattern: 'ab' }] })), ['3:v:PATTERN']);
  assert.deepEqual(codes(validateCsv('v\n😀😀\n😀\n😀😀😀', { columns: [{ name: 'v', minLength: 2, maxLength: 2 }] })),
    ['3:v:MIN_LENGTH', '4:v:MAX_LENGTH']);
  const n = { columns: [{ name: 'v', type: 'number', min: 1.5, max: 3 }] };
  assert.deepEqual(codes(validateCsv('v\n1.5\n3\n1.4\n3.1', n)), ['4:v:MIN', '5:v:MAX']);
  const d = { columns: [{ name: 'v', type: 'date', min: '2024-01-01', max: '2024-12-31' }] };
  assert.deepEqual(codes(validateCsv('v\n2024-01-01\n2024-12-31\n2023-12-31\n2025-01-01', d)), ['4:v:MIN', '5:v:MAX']);
  assert.equal(validateCsv('v\nabc', { columns: [{ name: 'v', min: 'z', max: 'a' }] }).ok, true);
  assert.equal(validateCsv('v\ntrue', { columns: [{ name: 'v', type: 'bool', min: 5 }] }).ok, true);
  assert.deepEqual(codes(validateCsv('v\n1\n01\n1', { columns: [{ name: 'v', type: 'int', unique: true }] })), ['4:v:UNIQUE']);
});
test('validate: delimiter được chuyển, required không cắt khoảng trắng', () => {
  assert.equal(validateCsv('a;b\n1;2', { columns: [{ name: 'b', type: 'int' }] }, { delimiter: ';' }).ok, true);
  assert.equal(validateCsv('a\n ', { columns: [{ name: 'a', required: true }] }).ok, true);
});
