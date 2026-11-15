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

const S = (cols) => ({ columns: cols });
const codes = (r) => r.errors.map((e) => `${e.row}:${e.column}:${e.code}`);

test('csvcheck parse: rỗng, dòng trống, \\r đơn, không newline cuối', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\r\n\r'), []);
  assert.deepEqual(parseCsv('a\r\rb\r'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('a,b\n\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('csvcheck parse: nháy giữ CRLF, BOM đúng một lần', () => {
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('"a;b";c', { delimiter: ';' }), [['a;b', 'c']]);
});

test('csvcheck parse: lỗi và row', () => {
  assert.throws(() => parseCsv(5), (e) => e.code === 'CSV_INVALID_INPUT' && e.row === undefined);
  for (const d of ['"', '\n', '\r', ';;', '']) {
    assert.throws(() => parseCsv('a', { delimiter: d }), (e) => e.code === 'CSV_INVALID_INPUT');
  }
  assert.throws(() => parseCsv('a\n"b\n'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('"ab" ,c'), (e) => e.code === 'CSV_BAD_QUOTE');
});

test('csvcheck schema: CSV_INVALID_SCHEMA', () => {
  const bads = [
    null, {}, { columns: [] }, S([1]), S([{}]), S([{ name: 'a' }, { name: 'a' }]),
    S([{ name: 'a', type: 'x' }]), S([{ name: 'a', pattern: '(' }]),
    S([{ name: 'a', enum: [] }]), S([{ name: 'a', enum: [1] }]),
    S([{ name: 'a', type: 'int', min: '1' }]), S([{ name: 'a', type: 'number', max: Infinity }]),
    S([{ name: 'a', type: 'date', min: '2023-02-29' }]),
    S([{ name: 'a', minLength: -1 }]), S([{ name: 'a', maxLength: 1.5 }]),
  ];
  for (const s of bads) {
    assert.throws(() => validateCsv('a\n1', s), (e) => e.code === 'CSV_INVALID_SCHEMA');
  }
  assert.throws(() => validateCsv('"x', {}), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv(1, S([{ name: 'a' }])), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck validate: EMPTY_INPUT, lỗi phân tích, chỉ tiêu đề', () => {
  const s = S([{ name: 'a' }]);
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n1\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nb"c', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.throws(() => validateCsv('a', s, { delimiter: '"' }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck validate: MISSING_COLUMN, ROW_LENGTH, tiêu đề lặp, hoa thường', () => {
  const s = S([{ name: 'x', required: true }, { name: 'a', required: true }, { name: 'Y' }]);
  const r = validateCsv('a,a\n1,2\n1\n,3,4\n', s);
  assert.deepEqual(codes(r), ['1:x:MISSING_COLUMN', '1:Y:MISSING_COLUMN', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH']);
  assert.equal(r.rowCount, 3);
  assert.equal(validateCsv('a\n\n1', S([{ name: 'a' }])).rowCount, 1);
  assert.deepEqual(validateCsv('a,b\n,2', S([{ name: 'a', required: true }])).errors,
    [{ row: 2, column: 'a', code: 'REQUIRED' }]);
  const u = S([{ name: 'a', unique: true }]);
  assert.equal(validateCsv('a,b\n1\n1,2\n', u).errors.length, 1);
});

test('csvcheck validate: số hàng đếm bản ghi, ô nhiều dòng', () => {
  const s = S([{ name: 'a', type: 'int' }]);
  assert.deepEqual(codes(validateCsv('a\n\n"x\ny"\n\nz\n', s)), ['2:a:TYPE', '3:a:TYPE']);
});

test('csvcheck type: int/number/bool/date', () => {
  const t = (type, v) => validateCsv(`a\n"${v}"\n`, S([{ name: 'a', type }])).ok;
  for (const v of ['007', '+5', '-0', '9007199254740991']) assert.equal(t('int', v), true, v);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740992', 'x']) assert.equal(t('int', v), false, v);
  for (const v of ['1', '-1.5', '+0.25']) assert.equal(t('number', v), true, v);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity', '1' + '0'.repeat(400)]) assert.equal(t('number', v), false, v);
  for (const v of ['true', 'FALSE', 'True']) assert.equal(t('bool', v), true, v);
  for (const v of ['1', 'yes']) assert.equal(t('bool', v), false, v);
  for (const v of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.equal(t('date', v), true, v);
  for (const v of ['2023-02-29', '1900-02-29', '2024-13-01', '0000-01-01', '2024-1-1', '2024-04-31']) assert.equal(t('date', v), false, v);
  assert.equal(t('string', 'bất kỳ'), true);
});

test('csvcheck constraints: ENUM, PATTERN, độ dài, MIN/MAX, UNIQUE', () => {
  const v = (cols, body) => codes(validateCsv('a\n' + body, S(cols)));
  assert.deepEqual(v([{ name: 'a', enum: ['x', 'y'] }], 'x\nX\n'), ['3:a:ENUM']);
  assert.deepEqual(v([{ name: 'a', type: 'int', enum: ['1'] }], '01\n'), ['2:a:ENUM']);
  assert.deepEqual(v([{ name: 'a', pattern: 'b' }], 'abc\nxyz\n'), ['3:a:PATTERN']);
  assert.deepEqual(v([{ name: 'a', pattern: '^b$' }], 'abc\n'), ['2:a:PATTERN']);
  assert.deepEqual(v([{ name: 'a', minLength: 2, maxLength: 3 }], 'a\nab\nabc\nabcd\n'), ['2:a:MIN_LENGTH', '5:a:MAX_LENGTH']);
  assert.deepEqual(v([{ name: 'a', maxLength: 1 }], '😀\n😀😀\n'), ['3:a:MAX_LENGTH']);
  assert.deepEqual(v([{ name: 'a', type: 'int', min: 1, max: 3 }], '0\n1\n3\n4\n'), ['2:a:MIN', '5:a:MAX']);
  assert.deepEqual(v([{ name: 'a', type: 'number', min: 0.5 }], '0.4\n0.5\n'), ['2:a:MIN']);
  assert.deepEqual(v([{ name: 'a', type: 'date', min: '2024-01-01', max: '2024-12-31' }], '2023-12-31\n2024-06-01\n2025-01-01\n'), ['2:a:MIN', '4:a:MAX']);
  assert.deepEqual(v([{ name: 'a', min: 'z', max: 'a' }], 'm\n'), []);
  assert.deepEqual(v([{ name: 'a', unique: true }], '1\n01\n1\n1\n'), ['4:a:UNIQUE', '5:a:UNIQUE']);
  assert.deepEqual(v([{ name: 'a', type: 'int', unique: true }], 'x\nx\n1\n1\n'), ['2:a:TYPE', '3:a:TYPE', '5:a:UNIQUE']);
  assert.deepEqual(v([{ name: 'a', unique: true }], '""\n""\n'), []);
});

test('csvcheck order: nhiều lỗi trong một ô và theo thứ tự lược đồ, không theo tệp', () => {
  const s = S([
    { name: 'b', enum: ['x'], pattern: '^q', minLength: 5, maxLength: 0 },
    { name: 'a', type: 'int', min: 10, max: 0, unique: true },
  ]);
  const r = validateCsv('a,b\n5,zz\n5,zz\n', s);
  assert.deepEqual(codes(r), [
    '2:b:ENUM', '2:b:PATTERN', '2:b:MIN_LENGTH', '2:b:MAX_LENGTH', '2:a:MIN', '2:a:MAX',
    '3:b:ENUM', '3:b:PATTERN', '3:b:MIN_LENGTH', '3:b:MAX_LENGTH', '3:a:MIN', '3:a:MAX', '3:a:UNIQUE',
  ]);
});

test('csvcheck: delimiter trong validate, ô rỗng không bắt buộc bỏ qua ràng buộc', () => {
  const s = S([{ name: 'a', type: 'int', min: 5, pattern: '^x' }, { name: 'b', required: true }]);
  assert.deepEqual(validateCsv('a;b\n;1\n', s, { delimiter: ';' }), { ok: true, rowCount: 1, errors: [] });
});
