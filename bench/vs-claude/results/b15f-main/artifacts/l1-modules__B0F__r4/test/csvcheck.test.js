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

const thrown = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const V = (text, cols, opt) => validateCsv(text, { columns: cols }, opt);

test('parseCsv: ca biên', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,\n'), [['a', '']]);
  assert.deepEqual(parseCsv('a\n\n\nb'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('a\rb\r\nc\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('"a"",b",c'), [['a",b', 'c']]);
  assert.deepEqual(parseCsv('a,b', { delimiter: '\t' }), [['a,b']]);
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
});

test('parseCsv: mã lỗi ném và row', () => {
  assert.equal(thrown(() => parseCsv(5)).code, 'CSV_INVALID_INPUT');
  for (const d of ['', ',,', '"', '\n', '\r', 1]) {
    assert.equal(thrown(() => parseCsv('a', { delimiter: d })).code, 'CSV_INVALID_INPUT');
  }
  let e = thrown(() => parseCsv('a\n"b\nc'));
  assert.equal(e.code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(e.row, 2);
  e = thrown(() => parseCsv('ab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE');
  assert.equal(e.row, 1);
  e = thrown(() => parseCsv('a\n"ab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE');
  assert.equal(e.row, 2);
});

test('validateCsv: CSV_INVALID_SCHEMA và CSV_INVALID_INPUT', () => {
  const bads = [
    null, {}, { columns: [] }, { columns: 'x' }, { columns: [1] },
    { columns: [{}] }, { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'number', max: Infinity }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bads) {
    assert.equal(thrown(() => validateCsv('a\n1', s)).code, 'CSV_INVALID_SCHEMA');
  }
  assert.equal(thrown(() => validateCsv('"x', null)).code, 'CSV_INVALID_SCHEMA');
  assert.equal(thrown(() => validateCsv(5, { columns: [{ name: 'a' }] })).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => V('a', [{ name: 'a' }], { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
});

test('validateCsv: lỗi phân tích và tệp rỗng trả về, không ném', () => {
  const c = [{ name: 'a' }];
  assert.deepEqual(V('', c), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(V('\n\n', c).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(V('a\n"x', c), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(V('a\nx"y', c).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(V('a', c), { ok: true, rowCount: 0, errors: [] });
});

test('validateCsv: MISSING_COLUMN, ROW_LENGTH, cột thừa, tiêu đề lặp', () => {
  const r = V('b,a\n1,2\n3\n4,5,6\n', [{ name: 'a', required: true }, { name: 'zz', required: true }, { name: 'A' }]);
  assert.deepEqual(r.errors, [
    { row: 1, column: 'zz', code: 'MISSING_COLUMN' },
    { row: 1, column: 'A', code: 'MISSING_COLUMN' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 4, column: null, code: 'ROW_LENGTH' },
  ]);
  assert.equal(r.rowCount, 3);
  const u = V('a,a\n1,x\n1\n1,y\n', [{ name: 'a', unique: true }]);
  assert.deepEqual(u.errors, [{ row: 3, column: null, code: 'ROW_LENGTH' }, { row: 4, column: 'a', code: 'UNIQUE' }]);
});

test('validateCsv: thứ tự lỗi theo lược đồ, nhiều lỗi trong một ô', () => {
  const cols = [
    { name: 'y', enum: ['ok'], pattern: '^\\d$', minLength: 3, maxLength: 1 },
    { name: 'x', type: 'int', min: 5, max: 1, unique: true },
  ];
  const r = V('x,y\n3,zz\n3,ok\n', cols);
  assert.deepEqual(r.errors.map((e) => `${e.row}:${e.column}:${e.code}`), [
    '2:y:ENUM', '2:y:PATTERN', '2:y:MIN_LENGTH', '2:y:MAX_LENGTH',
    '2:x:MIN', '2:x:MAX',
    '3:y:PATTERN', '3:y:MIN_LENGTH', '3:y:MAX_LENGTH',
    '3:x:MIN', '3:x:MAX', '3:x:UNIQUE',
  ]);
});

test('validateCsv: MAX_LENGTH đứng trước MIN khi cùng ô', () => {
  const r = V('c\nabc\n', [{ name: 'c', maxLength: 1, pattern: 'z' }]);
  assert.deepEqual(r.errors.map((e) => e.code), ['PATTERN', 'MAX_LENGTH']);
});

test('validateCsv: row đếm bản ghi, không đếm dòng', () => {
  const r = V('a,b\n"l1\nl2",1\n\n\nx,2\n', [{ name: 'b', type: 'int', max: 1 }]);
  assert.deepEqual(r.errors, [{ row: 3, column: 'b', code: 'MAX' }]);
  assert.equal(r.rowCount, 2);
});

test('validateCsv: ô sai kiểu dừng và không vào UNIQUE', () => {
  const r = V('n\nx\nx\n1\n1\n', [{ name: 'n', type: 'int', unique: true, enum: ['1'], min: 5 }]);
  assert.deepEqual(r.errors.map((e) => `${e.row}:${e.code}`), ['2:TYPE', '3:TYPE', '4:MIN', '5:MIN', '5:UNIQUE']);
});

test('validateCsv: các kiểu', () => {
  const ok = (type, v) => V(`c\n${v}\n`, [{ name: 'c', type }]).ok;
  for (const v of ['007', '+5', '-0', '12']) assert.ok(ok('int', v), v);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993', 'a']) assert.ok(!ok('int', v), v);
  for (const v of ['1', '-1.5', '+0.25']) assert.ok(ok('number', v), v);
  for (const v of ['5.', '.5', 'NaN', 'Infinity', '1e3', '1,5']) assert.ok(!ok('number', v), v);
  for (const v of ['true', 'FALSE', 'True']) assert.ok(ok('bool', v), v);
  for (const v of ['1', 'yes']) assert.ok(!ok('bool', v), v);
  for (const v of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.ok(ok('date', v), v);
  for (const v of ['2023-02-29', '1900-02-29', '2024-13-01', '0000-01-01', '2024-1-1', '2024-04-31', '2024-00-10']) assert.ok(!ok('date', v), v);
  assert.ok(ok('string', 'bất kỳ'));
});

test('validateCsv: dễ hiểu nhầm', () => {
  assert.ok(V('c\nxabcx\n', [{ name: 'c', pattern: 'abc' }]).ok);
  assert.equal(V('c\nxabcx\n', [{ name: 'c', pattern: '^abc$' }]).errors[0].code, 'PATTERN');
  assert.ok(V('c\nzzz\n', [{ name: 'c', min: 1, max: 2 }]).ok);
  assert.ok(V('c\ntrue\n', [{ name: 'c', type: 'bool', min: 1, max: 2 }]).ok);
  assert.ok(V('c\n5\n', [{ name: 'c', type: 'int', min: 5, max: 5 }]).ok);
  const d = V('c\n2024-01-01\n2024-06-01\n2024-12-31\n', [{ name: 'c', type: 'date', min: '2024-01-01', max: '2024-06-01' }]);
  assert.deepEqual(d.errors, [{ row: 4, column: 'c', code: 'MAX' }]);
  const e = V('a,b\n,1\n,2\n', [{ name: 'a', type: 'int', enum: ['q'], pattern: 'x', minLength: 3, unique: true }]);
  assert.ok(e.ok);
  assert.deepEqual(V('a,b\n,1\n', [{ name: 'a', required: true }]).errors, [{ row: 2, column: 'a', code: 'REQUIRED' }]);
  assert.ok(V('a,b\n ,1\n', [{ name: 'a', required: true }]).ok);
  assert.equal(V('c\nAdmin\n', [{ name: 'c', enum: ['admin'] }]).errors[0].code, 'ENUM');
  assert.ok(V('c\n1\n01\n', [{ name: 'c', unique: true }]).ok);
  assert.ok(V('c\n😀😀\n', [{ name: 'c', maxLength: 2, minLength: 2 }]).ok);
  assert.equal(V('A \n1\n', [{ name: 'A' }]).errors[0].code, 'MISSING_COLUMN');
  const m = V('a;b\n1;x\n', [{ name: 'b', type: 'int' }], { delimiter: ';' });
  assert.deepEqual(Object.keys(m.errors[0]), ['row', 'column', 'code']);
  assert.deepEqual(m.errors[0], { row: 2, column: 'b', code: 'TYPE' });
});
