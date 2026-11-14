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

test('parseCsv: dòng trống, dòng cách, "" và kết thúc hỗn hợp', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a\n\n\r\nb\rc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('  \n""\n'), [['  '], ['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parseCsv: lỗi và row', () => {
  const code = (t, o) => { try { parseCsv(t, o); } catch (e) { return [e.code, e.row]; } };
  assert.deepEqual(code('a\nb"c'), ['CSV_BAD_QUOTE', 2]);
  assert.deepEqual(code('"ab"c'), ['CSV_BAD_QUOTE', 1]);
  assert.deepEqual(code('h\n"x\ny'), ['CSV_UNTERMINATED_QUOTE', 2]);
  assert.deepEqual(code(5), ['CSV_INVALID_INPUT', undefined]);
  assert.deepEqual(code('a', { delimiter: '"' }), ['CSV_INVALID_INPUT', undefined]);
  assert.deepEqual(code('a', { delimiter: ',,' }), ['CSV_INVALID_INPUT', undefined]);
});

test('validateCsv: lỗi phân tích, rỗng, chỉ tiêu đề', () => {
  const s = S({ name: 'a' });
  assert.deepEqual(validateCsv('a\n"x', s).errors, [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.equal(validateCsv('a\n"x', s).rowCount, 0);
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.throws(() => validateCsv(1, s), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('validateCsv: số cột lệch bỏ qua kiểm ô và unique', () => {
  const s = S({ name: 'a', unique: true }, { name: 'b', required: true });
  const r = validateCsv('a,b\n1\n1,2,3\n1,\n1,x\n', s);
  assert.deepEqual(codes(r), ['2:null:ROW_LENGTH', '3:null:ROW_LENGTH', '4:b:REQUIRED', '5:a:UNIQUE']);
});

test('validateCsv: header thiếu, thừa, trùng, phân biệt hoa thường', () => {
  const s = S({ name: 'x', required: true }, { name: 'y', type: 'int' });
  assert.deepEqual(codes(validateCsv('y,z\n1,q\n', s)), ['1:x:MISSING_COLUMN']);
  assert.deepEqual(codes(validateCsv('X,y\n1,1\n', s)), ['1:x:MISSING_COLUMN']);
  assert.deepEqual(codes(validateCsv(' y,x\n1,1\n', s)), ['1:y:MISSING_COLUMN']);
  assert.deepEqual(codes(validateCsv('y,x,y\n1,a,zz\n', s)), []);
});

test('validateCsv: các kiểu', () => {
  const ok = (type, v) => validateCsv(`c\n${v}\n`, S({ name: 'c', type })).ok;
  for (const v of ['007', '+5', '-0', '12']) assert.ok(ok('int', v), v);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993', 'a']) assert.ok(!ok('int', v), v);
  for (const v of ['1', '-1.50', '+0.5']) assert.ok(ok('number', v), v);
  for (const v of ['5.', '.5', 'NaN', 'Infinity', '1e3']) assert.ok(!ok('number', v), v);
  for (const v of ['true', 'FALSE', 'True']) assert.ok(ok('bool', v), v);
  for (const v of ['1', 'yes']) assert.ok(!ok('bool', v), v);
  for (const v of ['2024-02-29', '2023-12-31', '2000-02-29']) assert.ok(ok('date', v), v);
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-1', '1900-02-29', '2024-04-31']) {
    assert.ok(!ok('date', v), v);
  }
});

test('validateCsv: thứ tự kiểm một ô', () => {
  const s = S({ name: 'c', enum: ['ab', 'abcdef'], pattern: '^x', minLength: 3, maxLength: 4, unique: true });
  assert.deepEqual(codes(validateCsv('c\nab\n', s)), ['2:c:PATTERN', '2:c:MIN_LENGTH']);
  assert.deepEqual(codes(validateCsv('c\nabcdef\n', s)), ['2:c:PATTERN', '2:c:MAX_LENGTH']);
  assert.deepEqual(codes(validateCsv('c\nq\nq\n', S({ name: 'c', enum: ['a'], minLength: 2, unique: true }))),
    ['2:c:ENUM', '2:c:MIN_LENGTH', '3:c:ENUM', '3:c:MIN_LENGTH', '3:c:UNIQUE']);
});

test('validateCsv: min/max, độ dài theo điểm mã', () => {
  const n = S({ name: 'n', type: 'int', min: 2, max: 5 });
  assert.deepEqual(codes(validateCsv('n\n1\n2\n5\n6\n', n)), ['2:n:MIN', '5:n:MAX']);
  const d = S({ name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' });
  assert.deepEqual(codes(validateCsv('d\n2023-12-31\n2024-01-01\n2025-01-01\n', d)), ['2:d:MIN', '4:d:MAX']);
  assert.ok(validateCsv('s\nzzz\n', S({ name: 's', min: 'a', max: 'b' })).ok);
  assert.ok(validateCsv('s\ntrue\n', S({ name: 's', type: 'bool', min: 1, max: 2 })).ok);
  assert.ok(validateCsv('s\n😀😀\n', S({ name: 's', maxLength: 2 })).ok);
  assert.deepEqual(codes(validateCsv('s\n😀😀😀\n', S({ name: 's', maxLength: 2 }))), ['2:s:MAX_LENGTH']);
});

test('validateCsv: TYPE dừng, không vào unique; ô rỗng bỏ qua ràng buộc', () => {
  const s = S({ name: 'n', type: 'int', min: 5, unique: true, pattern: '^9' });
  assert.deepEqual(codes(validateCsv('n\nx\nx\n\n""\n', s)), ['2:n:TYPE', '3:n:TYPE']);
  const u = S({ name: 'n', unique: true });
  assert.deepEqual(codes(validateCsv('n,m\n1,a\n01,a\n,a\n,a\n1,a\n', u)), ['6:n:UNIQUE']);
});

test('validateCsv: thứ tự theo lược đồ, row tính bản ghi', () => {
  const s = S({ name: 'b', type: 'int' }, { name: 'a', type: 'int' });
  const r = validateCsv('a,b\n\nx,y\n"l1\nl2",1\n', s);
  assert.deepEqual(codes(r), ['2:b:TYPE', '2:a:TYPE', '3:a:TYPE']);
  assert.equal(r.rowCount, 2);
  for (const e of r.errors) assert.deepEqual(Object.keys(e), ['row', 'column', 'code']);
});

test('validateCsv: MISSING_COLUMN không sinh REQUIRED; delimiter', () => {
  const s = S({ name: 'x', required: true }, { name: 'a' });
  assert.deepEqual(codes(validateCsv('a;b\n1;2\n', s, { delimiter: ';' })), ['1:x:MISSING_COLUMN']);
});

test('validateCsv: lược đồ sai ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: [1] }, S({}), S({ name: 'a' }, { name: 'a' }),
    S({ name: 'a', type: 'x' }), S({ name: 'a', pattern: '(' }), S({ name: 'a', enum: [] }),
    S({ name: 'a', enum: [1] }), S({ name: 'a', type: 'int', min: '1' }),
    S({ name: 'a', type: 'number', max: Infinity }), S({ name: 'a', type: 'date', min: '2023-02-30' }),
    S({ name: 'a', minLength: -1 }), S({ name: 'a', maxLength: 1.5 }),
  ];
  for (const sc of bad) {
    assert.throws(() => validateCsv('a"b', sc), (e) => e.code === 'CSV_INVALID_SCHEMA', JSON.stringify(sc));
  }
});
