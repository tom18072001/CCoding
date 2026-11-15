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

test('csvcheck: parse — dòng trống, BOM, CRLF trong nháy, kết thúc lẫn lộn', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\r\n\r'), []);
  assert.deepEqual(parseCsv('a\n\n  \n""\r'), [['a'], ['  '], ['']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('"a\r\nb",c\rd'), [['a\r\nb', 'c'], ['d']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('csvcheck: parse — lỗi và row', () => {
  const code = (f) => { try { f(); } catch (e) { return [e.code, e.row]; } };
  assert.deepEqual(code(() => parseCsv('a\nb"c')), ['CSV_BAD_QUOTE', 2]);
  assert.deepEqual(code(() => parseCsv('"ab"c')), ['CSV_BAD_QUOTE', 1]);
  assert.deepEqual(code(() => parseCsv('a\n\n"x\ny')), ['CSV_UNTERMINATED_QUOTE', 2]);
  assert.deepEqual(code(() => parseCsv(5)), ['CSV_INVALID_INPUT', undefined]);
  for (const d of ['"', '\n', '\r', ',,', '']) {
    assert.equal(code(() => parseCsv('a', { delimiter: d }))[0], 'CSV_INVALID_INPUT');
  }
});

test('csvcheck: lược đồ sai ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bads = [
    null, {}, { columns: [] }, S([1]), S([{}]), S([{ name: 'a' }, { name: 'a' }]),
    S([{ name: 'a', type: 'x' }]), S([{ name: 'a', pattern: '(' }]),
    S([{ name: 'a', enum: [] }]), S([{ name: 'a', enum: [1] }]),
    S([{ name: 'a', type: 'int', min: 'x' }]), S([{ name: 'a', type: 'date', max: '2023-02-29' }]),
    S([{ name: 'a', minLength: -1 }]), S([{ name: 'a', maxLength: 1.5 }]),
  ];
  for (const s of bads) {
    assert.throws(() => validateCsv('a,"', s), (e) => e.code === 'CSV_INVALID_SCHEMA');
  }
});

test('csvcheck: lỗi phân tích và tệp rỗng không ném', () => {
  const s = S([{ name: 'a' }]);
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a\nb\n"x', s).errors, [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }]);
  assert.deepEqual(validateCsv('a\nb"', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.throws(() => validateCsv(null, s), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('csvcheck: MISSING_COLUMN, ROW_LENGTH, thứ tự theo lược đồ', () => {
  const s = S([{ name: 'b', required: true }, { name: 'zz', required: true }, { name: 'a', required: true }]);
  const r = validateCsv('a,b\n,\n1\n1,2,3\n', s);
  assert.deepEqual(codes(r), [
    '1:zz:MISSING_COLUMN', '2:b:REQUIRED', '2:a:REQUIRED', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH',
  ]);
  assert.equal(r.rowCount, 3);
});

test('csvcheck: hàng sai độ dài không vào UNIQUE; số hàng đếm bản ghi', () => {
  const s = S([{ name: 'a', unique: true }, { name: 'b' }]);
  const r = validateCsv('a,b\n\n"x\ny",1\nx\n"x\ny",2\n', s);
  assert.deepEqual(codes(r), ['3:null:ROW_LENGTH', '4:a:UNIQUE']);
});

test('csvcheck: kiểu', () => {
  const t = (type, ok, bad) => {
    const s = S([{ name: 'v', type }]);
    for (const v of ok) assert.equal(validateCsv(`v\n${v}\n`, s).ok, true, `${type} ${v}`);
    for (const v of bad) assert.deepEqual(codes(validateCsv(`v\n"${v}"\n`, s)), ['2:v:TYPE'], `${type} ${v}`);
  };
  t('int', ['007', '+5', '-0', '9007199254740991'], ['1.0', '1e3', ' 1', '9007199254740993', 'x']);
  t('number', ['1', '-1.50', '+0.5'], ['5.', '.5', 'NaN', 'Infinity', '1e3']);
  t('bool', ['true', 'FALSE', 'True'], ['1', 'yes']);
  t('date', ['2024-02-29', '2000-02-29', '0001-01-01'], ['2023-02-29', '2024-13-01', '1900-02-29', '0000-01-01', '2024-1-01', '2024-04-31']);
  t('string', ['abc'], []);
});

test('csvcheck: thứ tự kiểm một ô và TYPE dừng', () => {
  const s = S([{ name: 'v', enum: ['abc'], pattern: '^x', minLength: 5, maxLength: 1, unique: true }]);
  assert.deepEqual(codes(validateCsv('v\nab\nab\n', s)), [
    '2:v:ENUM', '2:v:PATTERN', '2:v:MIN_LENGTH', '2:v:MAX_LENGTH',
    '3:v:ENUM', '3:v:PATTERN', '3:v:MIN_LENGTH', '3:v:MAX_LENGTH', '3:v:UNIQUE',
  ]);
  const s2 = S([{ name: 'n', type: 'int', min: 5, max: 1, unique: true, enum: ['9'] }]);
  // x: TYPE (dừng); 9: ENUM ok, MAX; 0: ENUM, MIN; 9 lần 2: MAX + UNIQUE
  assert.deepEqual(codes(validateCsv('n\nx\nx\n9\n0\n9\n', s2)), [
    '2:n:TYPE', '3:n:TYPE', '4:n:MAX', '5:n:ENUM', '5:n:MIN', '6:n:MAX', '6:n:UNIQUE',
  ]);
});

test('csvcheck: ràng buộc — rỗng, độ dài Unicode, min/max, pattern không neo, unique nguyên văn', () => {
  const s = S([
    { name: 'a', pattern: 'b', minLength: 2, maxLength: 2 },
    { name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' },
    { name: 's', min: 'zzz', unique: true },
    { name: 'e', enum: ['A'], unique: true },
  ]);
  const r = validateCsv('a,d,s,e\n😀😀,2023-12-31,01,\nabc,2025-01-01,1,a\n,,,A\n,,,\n,,,A\n,,01,\n', s);
  assert.deepEqual(codes(r), [
    '2:a:PATTERN', '2:d:MIN',
    '3:a:MAX_LENGTH', '3:d:MAX', '3:e:ENUM',
    '6:e:UNIQUE', '7:s:UNIQUE',
  ]);
  assert.equal(Object.keys(r.errors[0]).join(), 'row,column,code');
});

test('csvcheck: tên cột chính xác, lặp tiêu đề lấy cột đầu, cột thừa bị bỏ', () => {
  const s = S([{ name: 'id', type: 'int' }]);
  assert.deepEqual(codes(validateCsv('ID,x\n1,2\n', s)), ['1:id:MISSING_COLUMN']);
  assert.deepEqual(codes(validateCsv('id,id\n1,zz\n', s)), []);
  assert.deepEqual(codes(validateCsv('id,id\nzz,1\n', s)), ['2:id:TYPE']);
});
