import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const code = (c) => (e) => e.code === c;

test('parseCsv: ví dụ và quy tắc', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
  assert.deepEqual(parseCsv('﻿a;b', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\rb\r\nc\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a\n\n\r\nb'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('a\n  \n'), [['a'], ['  ']]);
  assert.deepEqual(parseCsv('a\n""\n'), [['a'], ['']]);
  assert.deepEqual(parseCsv('"a\r\nb"'), [['a\r\nb']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv(',\n'), [['', '']]);
  assert.deepEqual(parseCsv('\n\n'), []);
});

test('parseCsv: lỗi', () => {
  assert.throws(() => parseCsv(5), code('CSV_INVALID_INPUT'));
  for (const d of ['"', '\n', '\r', 'ab', '', 5]) assert.throws(() => parseCsv('a', { delimiter: d }), code('CSV_INVALID_INPUT'));
  assert.throws(() => parseCsv('a\n"b'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('a\n\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a,"b" '), code('CSV_BAD_QUOTE'));
});

const schema = {
  columns: [
    { name: 'id', type: 'int', required: true, unique: true, min: 1 },
    { name: 'name', maxLength: 5 },
  ],
};

test('validateCsv: ví dụ đặc tả', () => {
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

test('validateCsv: tệp rỗng, lỗi phân tích, tiêu đề', () => {
  assert.deepEqual(validateCsv('', schema), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('id,name', schema), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('id,name\n1,"a', schema), {
    ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }],
  });
  assert.deepEqual(validateCsv('id,name\nx"y,1', schema).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.throws(() => validateCsv(5, schema), code('CSV_INVALID_INPUT'));
  assert.throws(() => validateCsv('a', schema, { delimiter: 'ab' }), code('CSV_INVALID_INPUT'));
  // cột thiếu: một MISSING_COLUMN, không REQUIRED
  assert.deepEqual(validateCsv('name\nAn\n', schema).errors, [{ row: 1, column: 'id', code: 'MISSING_COLUMN' }]);
  // tiêu đề phân biệt hoa thường, lặp thì lấy cột đầu
  assert.deepEqual(validateCsv('ID,name\n1,a', schema).errors, [{ row: 1, column: 'id', code: 'MISSING_COLUMN' }]);
  assert.deepEqual(validateCsv('id,id,name\n1,x,a', schema).errors, []);
});

test('validateCsv: ROW_LENGTH và thứ tự theo lược đồ', () => {
  const r = validateCsv('name,id\nab,1\nonly\nx,y,z\n"a\nb",0\n', schema);
  assert.deepEqual(r.errors, [
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: null, code: 'ROW_LENGTH' },
    { row: 5, column: 'id', code: 'MIN' },
  ]);
  assert.equal(r.rowCount, 4);
  // dòng sai độ dài không vào UNIQUE
  const u = validateCsv('id,name\n1\n1,a\n', schema);
  assert.deepEqual(u.errors, [{ row: 2, column: null, code: 'ROW_LENGTH' }]);
  // thứ tự cột theo lược đồ, không theo tệp
  const s2 = { columns: [{ name: 'b', type: 'int' }, { name: 'a', type: 'int' }] };
  assert.deepEqual(validateCsv('a,b\nx,y', s2).errors, [
    { row: 2, column: 'b', code: 'TYPE' },
    { row: 2, column: 'a', code: 'TYPE' },
  ]);
});

test('validateCsv: kiểu', () => {
  const t = (type, v) => validateCsv(`c\n${v}`, { columns: [{ name: 'c', type }] }).errors.length === 0;
  for (const v of ['007', '+5', '-0', '12']) assert.ok(t('int', v), v);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993', 'a']) assert.ok(!t('int', v), v);
  for (const v of ['1', '-1.5', '+0.25']) assert.ok(t('number', v), v);
  for (const v of ['5.', '.5', 'NaN', 'Infinity', '1e3']) assert.ok(!t('number', v), v);
  for (const v of ['true', 'FALSE', 'True']) assert.ok(t('bool', v), v);
  for (const v of ['1', 'yes']) assert.ok(!t('bool', v), v);
  for (const v of ['2024-02-29', '2000-02-29']) assert.ok(t('date', v), v);
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-1', '1900-02-29']) assert.ok(!t('date', v), v);
});

test('validateCsv: ràng buộc và thứ tự trong ô', () => {
  const s = { columns: [{ name: 'c', type: 'int', enum: ['5', '6'], pattern: '^1', minLength: 3, maxLength: 1, min: 100, max: 0, unique: true }] };
  assert.deepEqual(validateCsv('c\n7', s).errors.map((e) => e.code), ['ENUM', 'PATTERN', 'MIN_LENGTH', 'MIN', 'MAX']);
  assert.deepEqual(validateCsv('c\n77\n77', s).errors.filter((e) => e.code === 'UNIQUE').length, 1);
  // TYPE dừng, không vào unique
  const u = { columns: [{ name: 'c', type: 'int', unique: true, enum: ['x'] }] };
  assert.deepEqual(validateCsv('c\nx\nx', u).errors.map((e) => e.code), ['TYPE', 'TYPE']);
  // 1 và 01 khác nhau; rỗng không tính
  assert.deepEqual(validateCsv('c\n1\n01\n\"\"\n\"\"', { columns: [{ name: 'c', unique: true }] }).errors, []);
  // min/max bỏ qua cho string, so sánh cho date
  assert.equal(validateCsv('c\nabc', { columns: [{ name: 'c', min: 5 }] }).ok, true);
  const d = { columns: [{ name: 'c', type: 'date', min: '2020-01-01', max: '2020-12-31' }] };
  assert.deepEqual(validateCsv('c\n2019-12-31\n2020-06-01\n2021-01-01', d).errors.map((e) => e.code), ['MIN', 'MAX']);
  // độ dài theo điểm mã
  assert.equal(validateCsv('c\n😀😀', { columns: [{ name: 'c', maxLength: 2 }] }).ok, true);
  // pattern không neo
  assert.equal(validateCsv('c\nxabcx', { columns: [{ name: 'c', pattern: 'abc' }] }).ok, true);
  // ô rỗng không bắt buộc bỏ qua mọi ràng buộc
  assert.equal(validateCsv('c,d\n,1', { columns: [{ name: 'c', type: 'int', min: 5, minLength: 3, enum: ['a'] }] }).ok, true);
  // delimiter
  assert.equal(validateCsv('c;d\n1;2', { columns: [{ name: 'd', type: 'int' }] }, { delimiter: ';' }).ok, true);
});

test('validateCsv: lược đồ sai', () => {
  const bad = (s) => assert.throws(() => validateCsv('a', s), code('CSV_INVALID_SCHEMA'), JSON.stringify(s));
  bad(null);
  bad({});
  bad({ columns: [] });
  bad({ columns: ['a'] });
  bad({ columns: [{}] });
  bad({ columns: [{ name: 'a' }, { name: 'a' }] });
  bad({ columns: [{ name: 'a', type: 'x' }] });
  bad({ columns: [{ name: 'a', pattern: '(' }] });
  bad({ columns: [{ name: 'a', enum: [] }] });
  bad({ columns: [{ name: 'a', enum: [1] }] });
  bad({ columns: [{ name: 'a', type: 'int', min: '1' }] });
  bad({ columns: [{ name: 'a', type: 'number', max: NaN }] });
  bad({ columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] });
  bad({ columns: [{ name: 'a', minLength: -1 }] });
  bad({ columns: [{ name: 'a', maxLength: 1.5 }] });
  // lược đồ kiểm trước văn bản
  assert.throws(() => validateCsv(5, {}), code('CSV_INVALID_SCHEMA'));
});
