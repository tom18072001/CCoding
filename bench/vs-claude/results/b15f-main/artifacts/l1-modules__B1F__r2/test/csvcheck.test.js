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
const S = (...columns) => ({ columns });

test('parseCsv: biên của parser', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\r\n'), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(',\n'), [['', '']]);
  assert.deepEqual(parseCsv('a\rb\r\nc\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a\n\n\nb\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('"a"\n'), [['a']]);
  assert.deepEqual(parseCsv('"a"'), [['a']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('a,b;c', { delimiter: ';' }), [['a,b', 'c']]);
});

test('parseCsv: lỗi và row', () => {
  const code = (c, row) => (e) => e.code === c && e.row === row;
  assert.throws(() => parseCsv('ab"c'), code('CSV_BAD_QUOTE', 1));
  assert.throws(() => parseCsv('a\n\n"ab"c'), code('CSV_BAD_QUOTE', 2));
  assert.throws(() => parseCsv('a\n"b\nc'), code('CSV_UNTERMINATED_QUOTE', 2));
  assert.throws(() => parseCsv(5), (e) => e.code === 'CSV_INVALID_INPUT' && !('row' in e));
  for (const d of ['"', '\n', '\r', ',,', '']) {
    assert.throws(() => parseCsv('a', { delimiter: d }), (e) => e.code === 'CSV_INVALID_INPUT');
  }
});

test('validateCsv: lỗi phân tích, rỗng, chỉ tiêu đề', () => {
  const s = S({ name: 'a' });
  assert.deepEqual(validateCsv('a\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.throws(() => validateCsv(1, s), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('validateCsv: lược đồ sai', () => {
  const bad = [null, {}, { columns: [] }, S(1), S({}), S({ name: 'a' }, { name: 'a' }),
    S({ name: 'a', type: 'x' }), S({ name: 'a', pattern: '(' }), S({ name: 'a', enum: [] }),
    S({ name: 'a', enum: [1] }), S({ name: 'a', type: 'int', min: '1' }),
    S({ name: 'a', type: 'date', min: '2023-02-29' }), S({ name: 'a', minLength: -1 }),
    S({ name: 'a', maxLength: 1.5 })];
  for (const b of bad) assert.throws(() => validateCsv('', b), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv('"x', S({})), (e) => e.code === 'CSV_INVALID_SCHEMA');
});

test('validateCsv: MISSING_COLUMN, ROW_LENGTH, cột lặp, cột thừa', () => {
  const s = S({ name: 'a', required: true }, { name: 'b', required: true });
  const r = validateCsv('a,x\n1,2\n1\n1,2,3\n', s);
  assert.deepEqual(codes(r), ['1:b:MISSING_COLUMN', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH']);
  assert.equal(r.rowCount, 3);
  assert.deepEqual(codes(validateCsv('a,a\n,1\n', S({ name: 'a', required: true }))), ['2:a:REQUIRED']);
  assert.deepEqual(codes(validateCsv('A\n1\n', S({ name: 'a' }))), ['1:a:MISSING_COLUMN']);
});

test('validateCsv: ROW_LENGTH không ghi vào UNIQUE', () => {
  const s = S({ name: 'a', unique: true });
  assert.deepEqual(codes(validateCsv('a,b\n1\n1,x\n', s)), ['2:null:ROW_LENGTH']);
});

test('validateCsv: kiểu', () => {
  const t = (type, v) => validateCsv(`c\n"${v}"\n`, S({ name: 'c', type })).ok;
  for (const v of ['007', '+5', '-0', '9007199254740991']) assert.ok(t('int', v), v);
  for (const v of ['1.0', '1e3', ' 1', 'a', '9007199254740993']) assert.ok(!t('int', v), v);
  for (const v of ['1', '-1.50', '+0.5']) assert.ok(t('number', v), v);
  for (const v of ['5.', '.5', 'NaN', 'Infinity', '1e3']) assert.ok(!t('number', v), v);
  for (const v of ['true', 'FALSE', 'True']) assert.ok(t('bool', v), v);
  for (const v of ['1', 'yes']) assert.ok(!t('bool', v), v);
  for (const v of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.ok(t('date', v), v);
  for (const v of ['2023-02-29', '2024-13-01', '1900-02-29', '0000-01-01', '2024-1-1', '2024-04-31']) assert.ok(!t('date', v), v);
});

test('validateCsv: ràng buộc và thứ tự trong một ô', () => {
  const s = S({ name: 'v', enum: ['abc', 'x'], pattern: '^z', minLength: 5, maxLength: 1 });
  assert.deepEqual(codes(validateCsv('v\nabc\n', s)), ['2:v:PATTERN', '2:v:MIN_LENGTH', '2:v:MAX_LENGTH']);
  const s2 = S({ name: 'v', enum: ['x'], pattern: '^z', minLength: 5, maxLength: 1 });
  assert.deepEqual(codes(validateCsv('v\nabc\n', s2)), ['2:v:ENUM', '2:v:PATTERN', '2:v:MIN_LENGTH', '2:v:MAX_LENGTH']);
  const n = S({ name: 'n', type: 'int', min: 5, max: 3 });
  assert.deepEqual(codes(validateCsv('n\n4\n5\n3\n', n)), ['2:n:MIN', '2:n:MAX', '3:n:MAX', '4:n:MIN']);
  const d = S({ name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' });
  assert.deepEqual(codes(validateCsv('d\n2023-12-31\n2024-01-01\n2024-12-31\n2025-01-01\n', d)), ['2:d:MIN', '5:d:MAX']);
});

test('validateCsv: min/max bỏ qua với string/bool; pattern không neo; độ dài theo code point', () => {
  assert.ok(validateCsv('s\nzzz\n', S({ name: 's', min: 5, max: 1 })).ok);
  assert.ok(validateCsv('s\ntrue\n', S({ name: 's', type: 'bool', min: 5 })).ok);
  assert.ok(validateCsv('s\nxxabxx\n', S({ name: 's', pattern: 'ab' })).ok);
  assert.ok(validateCsv('s\n😀😀\n', S({ name: 's', maxLength: 2 })).ok);
  assert.deepEqual(codes(validateCsv('s\n 1\n', S({ name: 's', type: 'int' }))), ['2:s:TYPE']);
});

test('validateCsv: ô sai kiểu dừng, ô rỗng bỏ qua ràng buộc và UNIQUE', () => {
  const s = S({ name: 'a', type: 'int', min: 5, unique: true, enum: ['9'] });
  assert.deepEqual(codes(validateCsv('a\nx\nx\n', s)), ['2:a:TYPE', '3:a:TYPE']);
  assert.deepEqual(codes(validateCsv('a\n9\n9\n', s)), ['3:a:UNIQUE']);
  assert.ok(validateCsv('a,b\n,1\n,2\n"",3\n', S({ name: 'a', unique: true, minLength: 3 })).ok);
  assert.deepEqual(codes(validateCsv('a\n1\n01\n1\n', S({ name: 'a', unique: true }))), ['4:a:UNIQUE']);
});

test('validateCsv: thứ tự theo lược đồ, row đếm bản ghi', () => {
  const s = S({ name: 'b', required: true }, { name: 'a', required: true });
  assert.deepEqual(codes(validateCsv('a,b\n,\n', s)), ['2:b:REQUIRED', '2:a:REQUIRED']);
  const r = validateCsv('a\n"x\ny"\n\n\n', S({ name: 'a', maxLength: 1 }));
  assert.deepEqual(codes(r), ['2:a:MAX_LENGTH']);
  assert.equal(r.rowCount, 1);
  assert.deepEqual(codes(validateCsv('a\n"x\ny"\nok\n', S({ name: 'a', enum: ['ok'] }))), ['2:a:ENUM']);
  assert.deepEqual(validateCsv('a;b\n1;x\n', S({ name: 'b', type: 'int' }), { delimiter: ';' }).errors, [{ row: 2, column: 'b', code: 'TYPE' }]);
});
