import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e; } return null; };

test('parseCsv cơ bản', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
  assert.deepEqual(parseCsv('﻿a;b', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\rb\r\nc\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a\n\n\nb\n\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv(',\n'), [['', '']]);
  assert.deepEqual(parseCsv('"a",b'), [['a', 'b']]);
});

test('parseCsv lỗi', () => {
  assert.equal(code(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
  for (const d of ['"', '\n', '\r', ';;', '', 1]) {
    assert.equal(code(() => parseCsv('a', { delimiter: d })).code, 'CSV_INVALID_INPUT');
  }
  const u = code(() => parseCsv('a\n\nb\n"x'));
  assert.equal(u.code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(u.row, 3);
  assert.equal(code(() => parseCsv('ab"c')).code, 'CSV_BAD_QUOTE');
  const b = code(() => parseCsv('a\n"ab"c'));
  assert.equal(b.code, 'CSV_BAD_QUOTE');
  assert.equal(b.row, 2);
  assert.equal(code(() => parseCsv('"a""')).code, 'CSV_UNTERMINATED_QUOTE');
});

test('validateCsv ví dụ trong đặc tả', () => {
  const schema = { columns: [
    { name: 'id', type: 'int', required: true, unique: true, min: 1 },
    { name: 'name', maxLength: 5 },
  ] };
  assert.deepEqual(validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema), {
    ok: false,
    rowCount: 4,
    errors: [
      { row: 3, column: 'id', code: 'UNIQUE' },
      { row: 3, column: 'name', code: 'MAX_LENGTH' },
      { row: 4, column: 'id', code: 'TYPE' },
      { row: 5, column: 'id', code: 'REQUIRED' },
    ],
  });
});

test('validateCsv: tệp rỗng, chỉ tiêu đề, lỗi phân tích', () => {
  const schema = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('', schema), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n', schema), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a\n"x', schema), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', schema).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.equal(code(() => validateCsv(1, schema)).code, 'CSV_INVALID_INPUT');
  assert.equal(code(() => validateCsv('a', schema, { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
});

test('validateCsv: cột thiếu, độ dài hàng, thứ tự theo lược đồ', () => {
  const schema = { columns: [
    { name: 'b', required: true },
    { name: 'zz', required: true },
    { name: 'a', type: 'int' },
  ] };
  const r = validateCsv('a,b,c\nx,,1\n1,2\n1,2,3,4\n', schema);
  assert.deepEqual(r.errors, [
    { row: 1, column: 'zz', code: 'MISSING_COLUMN' },
    { row: 2, column: 'b', code: 'REQUIRED' },
    { row: 2, column: 'a', code: 'TYPE' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: null, code: 'ROW_LENGTH' },
  ]);
  assert.equal(r.rowCount, 3);
  assert.deepEqual(Object.keys(r.errors[0]), ['row', 'column', 'code']);
});

test('validateCsv: hàng sai độ dài không vào UNIQUE; ô sai kiểu không vào UNIQUE', () => {
  const schema = { columns: [{ name: 'a', type: 'int', unique: true }, { name: 'b' }] };
  assert.deepEqual(validateCsv('a,b\n1\n1,x\nq,z\n1,y\n', schema).errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: 'a', code: 'TYPE' },
    { row: 5, column: 'a', code: 'UNIQUE' },
  ]);
  assert.deepEqual(validateCsv('a\n1\n01\n', { columns: [{ name: 'a', unique: true }] }).errors, []);
});

test('validateCsv: kiểu', () => {
  const t = (type, cell) => validateCsv(`a\n${cell}\n`, { columns: [{ name: 'a', type }] }).ok;
  for (const v of ['007', '+5', '-0', '9007199254740991']) assert.equal(t('int', v), true, v);
  for (const v of ['1.0', '1e3', '9007199254740992', 'x']) assert.equal(t('int', v), false, v);
  assert.equal(validateCsv('a\n 1\n', { columns: [{ name: 'a', type: 'int' }] }).ok, false);
  for (const v of ['1', '-1.5', '+0.25']) assert.equal(t('number', v), true, v);
  for (const v of ['5.', '.5', 'NaN', 'Infinity', '1e3']) assert.equal(t('number', v), false, v);
  for (const v of ['true', 'FALSE', 'True']) assert.equal(t('bool', v), true, v);
  for (const v of ['1', 'yes']) assert.equal(t('bool', v), false, v);
  for (const v of ['2024-02-29', '0001-01-01']) assert.equal(t('date', v), true, v);
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-1']) assert.equal(t('date', v), false, v);
});

test('validateCsv: ràng buộc và thứ tự trong một ô', () => {
  const schema = { columns: [{
    name: 'v', type: 'int', enum: ['5', '6'], pattern: '^1', minLength: 2, maxLength: 1, min: 10, max: 0, unique: true,
  }] };
  const r = validateCsv('v\n7\n7\n', schema);
  assert.deepEqual(r.errors.slice(0, 7).map((e) => e.code),
    ['ENUM', 'PATTERN', 'MIN_LENGTH', 'MIN', 'MAX', 'ENUM', 'PATTERN']);
  // min/max bỏ qua với string, bool; pattern không neo; độ dài theo điểm mã
  assert.equal(validateCsv('a\nzzz\n', { columns: [{ name: 'a', min: 'x', max: 'a', pattern: 'z' }] }).ok, true);
  assert.deepEqual(validateCsv('a\n😀😀\n', { columns: [{ name: 'a', maxLength: 1 }] }).errors.length, 1);
  assert.equal(validateCsv('a\n😀😀\n', { columns: [{ name: 'a', maxLength: 2 }] }).ok, true);
  assert.deepEqual(validateCsv('d\n2024-01-01\n2025-01-01\n', { columns: [{ name: 'd', type: 'date', min: '2024-06-01', max: '2024-12-31' }] }).errors.map((e) => e.code), ['MIN', 'MAX']);
  // ô rỗng không bắt buộc bỏ qua mọi ràng buộc
  assert.equal(validateCsv('a\n\n\n', { columns: [{ name: 'a', type: 'int', min: 5, enum: ['x'] }] }).ok, true);
  // enum phân biệt hoa thường
  assert.equal(validateCsv('a\nAdmin\n', { columns: [{ name: 'a', enum: ['admin'] }] }).errors[0].code, 'ENUM');
});

test('validateCsv: tiêu đề so khớp chính xác, lấy cột đầu tiên khi lặp', () => {
  assert.equal(validateCsv('A\n1\n', { columns: [{ name: 'a' }] }).errors[0].code, 'MISSING_COLUMN');
  assert.equal(validateCsv(' a\n1\n', { columns: [{ name: 'a' }] }).errors[0].code, 'MISSING_COLUMN');
  const r = validateCsv('a,a\nx,1\n', { columns: [{ name: 'a', type: 'int' }] });
  assert.deepEqual(r.errors, [{ row: 2, column: 'a', code: 'TYPE' }]);
});

test('validateCsv: lược đồ sai', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] }, { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'number', max: NaN }] }, { columns: [{ name: 'a', type: 'date', min: '2023-02-30' }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bad) {
    assert.equal(code(() => validateCsv('a\n1\n', s)).code, 'CSV_INVALID_SCHEMA', JSON.stringify(s));
  }
  // schema kiểm trước khi phân tích
  assert.equal(code(() => validateCsv('"x', {})).code, 'CSV_INVALID_SCHEMA');
});
