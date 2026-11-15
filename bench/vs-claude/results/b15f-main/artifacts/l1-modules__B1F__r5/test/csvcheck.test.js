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

const codes = (r) => r.errors.map((e) => `${e.row}:${e.column}:${e.code}`);
const v = (text, columns, o) => validateCsv(text, { columns }, o);

test('parse: biên', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\r\n\r\n\n\rb'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('a\rb\r\nc\n'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('"a";"b"', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('a,b\n'), parseCsv('a,b'));
});

test('parse: lỗi và row', () => {
  const code = (t, o) => { try { parseCsv(t, o); } catch (e) { return [e.code, e.row]; } };
  assert.deepEqual(code('a\n\nb,"x'), ['CSV_UNTERMINATED_QUOTE', 2]);
  assert.deepEqual(code('a\nab"c'), ['CSV_BAD_QUOTE', 2]);
  assert.deepEqual(code('"ab"c'), ['CSV_BAD_QUOTE', 1]);
  assert.deepEqual(code(5), ['CSV_INVALID_INPUT', undefined]);
  for (const d of ['', ',,', '"', '\n', '\r', 1]) {
    assert.deepEqual(code('a', { delimiter: d }), ['CSV_INVALID_INPUT', undefined]);
  }
});

test('validate: EMPTY_INPUT, lỗi phân tích, chỉ tiêu đề', () => {
  const c = [{ name: 'a' }];
  assert.deepEqual(v('', c), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.equal(v('\n\n', c).errors[0].code, 'EMPTY_INPUT');
  assert.deepEqual(v('a\n1\n"x', c), { ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(v('a\nx"y', c).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(v('a\n', c), { ok: true, rowCount: 0, errors: [] });
  assert.throws(() => validateCsv(1, { columns: c }), { code: 'CSV_INVALID_INPUT' });
});

test('validate: lược đồ sai', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] }, { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'number', max: Infinity }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bad) assert.throws(() => validateCsv(5, s), { code: 'CSV_INVALID_SCHEMA' });
});

test('validate: MISSING_COLUMN, ROW_LENGTH, cột lặp/thừa, thứ tự theo lược đồ', () => {
  const r = v('b,a,a,z\n1,2,3,4\n1,2\n1,2,3,4,5\n', [
    { name: 'a', type: 'int' }, { name: 'b', type: 'int', max: 0 }, { name: 'q', required: true },
  ]);
  assert.deepEqual(codes(r), ['1:q:MISSING_COLUMN', '2:b:MAX', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH']);
  assert.equal(r.rowCount, 3);
  assert.equal(v('B\n1', [{ name: 'b' }]).errors[0].code, 'MISSING_COLUMN');
  assert.equal(v(' b\n1', [{ name: 'b' }]).errors[0].code, 'MISSING_COLUMN');
  assert.deepEqual(codes(v('b,a\nx,y', [{ name: 'a', enum: ['q'] }, { name: 'b', enum: ['q'] }])), ['2:a:ENUM', '2:b:ENUM']);
});

test('validate: kiểu cột', () => {
  const ok = (type, s) => v('c\n' + s, [{ name: 'c', type }]).ok;
  for (const s of ['007', '+5', '-0', '12']) assert.ok(ok('int', s), s);
  for (const s of ['1.0', '1e3', ' 1', '9007199254740993', 'a']) assert.ok(!ok('int', s), s);
  for (const s of ['1', '-1.50', '+0.5']) assert.ok(ok('number', s), s);
  for (const s of ['5.', '.5', '1e3', 'NaN', 'Infinity', '1.2.3']) assert.ok(!ok('number', s), s);
  for (const s of ['true', 'FALSE', 'True']) assert.ok(ok('bool', s), s);
  for (const s of ['1', 'yes', 'tru']) assert.ok(!ok('bool', s), s);
  for (const s of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.ok(ok('date', s), s);
  for (const s of ['2023-02-29', '1900-02-29', '2024-13-01', '0000-01-01', '2024-1-1', '2024-04-31']) assert.ok(!ok('date', s), s);
  assert.ok(ok('string', 'bất kỳ gì'));
});

test('validate: REQUIRED, ô rỗng bỏ qua ràng buộc và UNIQUE', () => {
  const c = [
    { name: 'a', type: 'int', unique: true, min: 5, minLength: 3, pattern: '^x$', enum: ['9'] },
    { name: 'b', required: true },
  ];
  assert.deepEqual(codes(v('a,b\n,\n,x\n,x', c)), ['2:b:REQUIRED']);
});

test('validate: ENUM, PATTERN, độ dài (điểm mã), MIN/MAX, thứ tự trong ô', () => {
  assert.deepEqual(codes(v('a\nAdmin', [{ name: 'a', enum: ['admin'] }])), ['2:a:ENUM']);
  assert.deepEqual(codes(v('a\nabc', [{ name: 'a', pattern: 'b' }])), []);
  assert.deepEqual(codes(v('a\nabc', [{ name: 'a', pattern: '^b$' }])), ['2:a:PATTERN']);
  assert.deepEqual(codes(v('a\n😀😀', [{ name: 'a', minLength: 3 }])), ['2:a:MIN_LENGTH']);
  assert.deepEqual(codes(v('a\n😀😀', [{ name: 'a', maxLength: 2, minLength: 2 }])), []);
  assert.deepEqual(codes(v('a\n12345', [{ name: 'a', type: 'int', maxLength: 3 }])), ['2:a:MAX_LENGTH']);
  assert.deepEqual(codes(v('a\n5\n1\n10\n11', [{ name: 'a', type: 'int', min: 5, max: 10 }])), ['3:a:MIN', '5:a:MAX']);
  assert.deepEqual(codes(v('a\n2.5\n2.6', [{ name: 'a', type: 'number', max: 2.5 }])), ['3:a:MAX']);
  assert.deepEqual(
    codes(v('a\n2024-01-01\n2024-06-01\n2025-01-01', [{ name: 'a', type: 'date', min: '2024-01-01', max: '2024-12-31' }])),
    ['4:a:MAX'],
  );
  // min/max bị bỏ qua với string, bool
  assert.ok(v('a\nabc', [{ name: 'a', min: 5, max: 1 }]).ok);
  assert.deepEqual(
    codes(v('a\nzz', [{ name: 'a', enum: ['q'], pattern: '^a', minLength: 5, maxLength: 1 }])),
    ['2:a:ENUM', '2:a:PATTERN', '2:a:MIN_LENGTH', '2:a:MAX_LENGTH'],
  );
  assert.deepEqual(
    codes(v('a\n1\n1', [{ name: 'a', type: 'int', enum: ['2'], min: 5, max: 0, unique: true }])),
    ['2:a:ENUM', '2:a:MIN', '2:a:MAX', '3:a:ENUM', '3:a:MIN', '3:a:MAX', '3:a:UNIQUE'],
  );
});

test('validate: TYPE dừng và không vào UNIQUE; UNIQUE nguyên văn; hàng sai độ dài không vào UNIQUE', () => {
  const c = [{ name: 'a', type: 'int', unique: true, enum: ['q'] }];
  assert.deepEqual(codes(v('a\nx\nx\n1\n01\n1', c)), ['2:a:TYPE', '3:a:TYPE', '4:a:ENUM', '5:a:ENUM', '6:a:ENUM', '6:a:UNIQUE']);
  assert.deepEqual(codes(v('a,b\n7,1,2\n7,1', [{ name: 'a', unique: true }])), ['2:null:ROW_LENGTH']);
});

test('validate: số hàng đếm theo bản ghi, bỏ dòng trống', () => {
  const r = v('a\n\n"x\ny"\n\nz\n', [{ name: 'a', type: 'int' }]);
  assert.deepEqual(codes(r), ['2:a:TYPE', '3:a:TYPE']);
  assert.equal(r.rowCount, 2);
  assert.deepEqual(Object.keys(r.errors[0]), ['row', 'column', 'code']);
});

test('validate: delimiter chuyển cho parser', () => {
  assert.ok(v('a;b\n1;2', [{ name: 'b', type: 'int' }], { delimiter: ';' }).ok);
});
