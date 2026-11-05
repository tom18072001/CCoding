import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const code = (c) => (e) => e.code === c;

test('parseCsv: kết thúc dòng, dòng trống, BOM', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\r\n\r'), []);
  assert.deepEqual(parseCsv('a\rb\nc\r\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a\n\n\nb\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('a\n  \nb'), [['a'], ['  '], ['b']]);
  assert.deepEqual(parseCsv('a\n""\nb'), [['a'], [''], ['b']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(','), [['', '']]);
  assert.deepEqual(parseCsv(',\n,'), [['', ''], ['', '']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('﻿'), []);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parseCsv: ô có nháy', () => {
  assert.deepEqual(parseCsv('"a\r\nb","c"'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('"a""b"'), [['a"b']]);
  assert.deepEqual(parseCsv('""""'), [['"']]);
  assert.deepEqual(parseCsv('"a",\n"b"\r\n'), [['a', ''], ['b']]);
  assert.deepEqual(parseCsv('a|"b|c"', { delimiter: '|' }), [['a', 'b|c']]);
  assert.deepEqual(parseCsv('a,b;c', { delimiter: ';' }), [['a,b', 'c']]);
});

test('parseCsv: lỗi', () => {
  assert.throws(() => parseCsv(5), code('CSV_INVALID_INPUT'));
  for (const d of ['', 'ab', '"', '\n', '\r', 1]) assert.throws(() => parseCsv('a', { delimiter: d }), code('CSV_INVALID_INPUT'));
  assert.throws(() => parseCsv('a\n"b\nc'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('a\n\n"b'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('a,b"'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('"ab"c'), code('CSV_BAD_QUOTE'));
  assert.throws(() => parseCsv('"ab" ,c'), code('CSV_BAD_QUOTE'));
  assert.throws(() => parseCsv('"a\nb"\n"x"y'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
});

const SCHEMA = { columns: [
  { name: 'id', type: 'int', required: true, unique: true, min: 1 },
  { name: 'name', maxLength: 5 },
] };

test('validateCsv: ví dụ spec', () => {
  const r = validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', SCHEMA);
  assert.deepEqual(r, { ok: false, rowCount: 4, errors: [
    { row: 3, column: 'id', code: 'UNIQUE' },
    { row: 3, column: 'name', code: 'MAX_LENGTH' },
    { row: 4, column: 'id', code: 'TYPE' },
    { row: 5, column: 'id', code: 'REQUIRED' },
  ] });
});

test('validateCsv: lỗi cấp tệp', () => {
  assert.deepEqual(validateCsv('', SCHEMA), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('\n\n', SCHEMA).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('id,name\n', SCHEMA), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('id,name\n1,"x', SCHEMA), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('id,name\n1,x"y', SCHEMA).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.throws(() => validateCsv(1, SCHEMA), code('CSV_INVALID_INPUT'));
  assert.throws(() => validateCsv('a', SCHEMA, { delimiter: 'ab' }), code('CSV_INVALID_INPUT'));
});

test('validateCsv: tiêu đề, cột thiếu, độ dài hàng', () => {
  const r = validateCsv('name,extra,id\nA,x,1\nB,2\nC,x,2,y\n\nD,x,3', SCHEMA);
  assert.deepEqual(r.errors, [
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: null, code: 'ROW_LENGTH' },
  ]);
  assert.equal(r.rowCount, 4);
  const m = validateCsv('id\n1\n', { columns: [{ name: 'id' }, { name: 'zz', required: true }, { name: 'ab' }] });
  assert.deepEqual(m.errors, [
    { row: 1, column: 'zz', code: 'MISSING_COLUMN' },
    { row: 1, column: 'ab', code: 'MISSING_COLUMN' },
  ]);
  // tên chính xác, phân biệt hoa thường, không cắt khoảng trắng
  assert.equal(validateCsv('ID,name\n', SCHEMA).errors[0].code, 'MISSING_COLUMN');
  assert.equal(validateCsv(' id,name\n', SCHEMA).errors[0].code, 'MISSING_COLUMN');
  // tiêu đề lặp: lấy cột đầu tiên
  const dup = validateCsv('id,id,name\n1,abc,x\n', SCHEMA);
  assert.equal(dup.ok, true);
  // thứ tự lỗi theo lược đồ, không theo tệp
  const ord = validateCsv('name,id\ntoolong,x\n', SCHEMA);
  assert.deepEqual(ord.errors.map((e) => e.column), ['id', 'name']);
  // ROW_LENGTH không ghi vào UNIQUE
  const u = validateCsv('id,name\n1\n1,a\n', SCHEMA);
  assert.deepEqual(u.errors, [{ row: 2, column: null, code: 'ROW_LENGTH' }]);
  // đếm bản ghi, không đếm dòng
  const rows = validateCsv('id,name\n1,"a\nb"\n\nx,y', SCHEMA);
  assert.deepEqual(rows.errors, [{ row: 3, column: 'id', code: 'TYPE' }]);
});

test('validateCsv: kiểu', () => {
  const t = (type, good, bad) => {
    const s = { columns: [{ name: 'v', type }] };
    for (const g of good) assert.equal(validateCsv(`v\n"${g}"`, s).ok, true, `${type} ${g}`);
    for (const b of bad) assert.deepEqual(validateCsv(`v\n"${b}"`, s).errors, [{ row: 2, column: 'v', code: 'TYPE' }], `${type} ${b}`);
  };
  t('int', ['007', '+5', '-0', '9007199254740991'], ['1.0', '1e3', ' 1', '', 'a', '9007199254740992'].filter(Boolean));
  t('number', ['1', '1.5', '-0.5', '+3'], ['5.', '.5', 'NaN', 'Infinity', '1e3', '1,5', '1' + '0'.repeat(400)]);
  t('bool', ['true', 'false', 'TRUE', 'False'], ['1', 'yes', '0', 'truee']);
  t('date', ['2024-02-29', '2000-02-29', '0001-01-01'], ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-1', '1900-02-29', '2024-04-31']);
  assert.equal(validateCsv('v\n\n', { columns: [{ name: 'v', type: 'int' }] }).ok, true);
});

test('validateCsv: ràng buộc', () => {
  const run = (col, cells) => validateCsv('v\n' + cells.map((c) => `"${c}"`).join('\n'), { columns: [{ name: 'v', ...col }] }).errors.map((e) => `${e.row}:${e.code}`);
  assert.deepEqual(run({ enum: ['a', 'b'] }, ['a', 'A', 'c']), ['3:ENUM', '4:ENUM']);
  assert.deepEqual(run({ type: 'int', enum: ['1'] }, ['1', '01']), ['3:ENUM']);
  assert.deepEqual(run({ pattern: '^a' }, ['abc', 'bab']), ['3:PATTERN']);
  assert.deepEqual(run({ pattern: 'a' }, ['bab', 'xyz']), ['3:PATTERN']);
  assert.deepEqual(run({ minLength: 2, maxLength: 3 }, ['a', 'ab', 'abc', 'abcd']), ['2:MIN_LENGTH', '5:MAX_LENGTH']);
  assert.deepEqual(run({ maxLength: 1 }, ['😀', 'ab']), ['3:MAX_LENGTH']);
  assert.deepEqual(run({ type: 'int', min: 1, max: 3 }, ['0', '1', '3', '4']), ['2:MIN', '5:MAX']);
  assert.deepEqual(run({ type: 'number', min: 0.5 }, ['0.4', '0.5']), ['2:MIN']);
  assert.deepEqual(run({ type: 'date', min: '2024-01-01', max: '2024-12-31' }, ['2023-12-31', '2024-01-01', '2025-01-01']), ['2:MIN', '4:MAX']);
  assert.deepEqual(run({ min: 5, max: 1 }, ['0', '9']), []); // bỏ qua với string
  assert.deepEqual(run({ type: 'bool', min: 5 }, ['true']), []);
  assert.deepEqual(run({ unique: true }, ['1', '01', '1', '1']), ['4:UNIQUE', '5:UNIQUE']);
  assert.deepEqual(run({ type: 'int', unique: true }, ['x', 'x', '1', '1']), ['2:TYPE', '3:TYPE', '5:UNIQUE']);
  // nhiều lỗi theo thứ tự cố định; ô sai kiểu thì dừng
  assert.deepEqual(run({ type: 'int', enum: ['5'], pattern: '^9', minLength: 3, maxLength: 0, min: 10, max: 0, unique: true }, ['1', '1', 'z']),
    ['2:ENUM', '2:PATTERN', '2:MIN_LENGTH', '2:MAX_LENGTH', '2:MIN', '2:MAX', '3:ENUM', '3:PATTERN', '3:MIN_LENGTH', '3:MAX_LENGTH', '3:MIN', '3:MAX', '3:UNIQUE', '4:TYPE']);
  // ô rỗng: không bắt buộc thì bỏ qua mọi ràng buộc, không vào UNIQUE
  const e2 = validateCsv('v,w\n,1\n,2\n', { columns: [{ name: 'v', unique: true, minLength: 3, enum: ['x'] }] });
  assert.equal(e2.ok, true);
  const e3 = validateCsv('v,w\n,1\n', { columns: [{ name: 'v', required: true }] });
  assert.deepEqual(e3.errors, [{ row: 2, column: 'v', code: 'REQUIRED' }]);
  // cột thiếu không sinh REQUIRED ở hàng dữ liệu
  const e4 = validateCsv('w\n1\n', { columns: [{ name: 'v', required: true }] });
  assert.deepEqual(e4.errors, [{ row: 1, column: 'v', code: 'MISSING_COLUMN' }]);
});

test('validateCsv: lược đồ sai ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bad = [
    undefined, null, {}, { columns: [] }, { columns: 'x' }, { columns: [1] }, { columns: [null] },
    { columns: [{}] }, { columns: [{ name: 1 }] }, { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'foo' }] }, { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', pattern: 1 }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] }, { columns: [{ name: 'a', enum: 'x' }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] }, { columns: [{ name: 'a', type: 'number', max: NaN }] },
    { columns: [{ name: 'a', type: 'int', max: Infinity }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] }, { columns: [{ name: 'a', type: 'date', max: 5 }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] }, { columns: [{ name: 'a', minLength: '1' }] },
  ];
  for (const s of bad) {
    assert.throws(() => validateCsv('"unterminated', s), code('CSV_INVALID_SCHEMA'), JSON.stringify(s));
    assert.throws(() => validateCsv(5, s), code('CSV_INVALID_SCHEMA'));
  }
  assert.equal(validateCsv('a\n1', { columns: [{ name: 'a', type: 'date', min: '2024-02-29' }] }).errors[0].code, 'TYPE');
});

test('validateCsv: ô "" (nháy rỗng) là ô rỗng, không vào UNIQUE', () => {
  const s = { columns: [{ name: 'v', unique: true }, { name: 'w' }] };
  assert.equal(validateCsv('v,w\n"",a\n"",b\n', s).ok, true);
  assert.equal(validateCsv('v,w\n""\n', s).errors[0].code, 'ROW_LENGTH');
});
