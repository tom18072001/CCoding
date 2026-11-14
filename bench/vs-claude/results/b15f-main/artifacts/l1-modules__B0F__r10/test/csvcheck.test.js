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

// ===== Mở rộng =====
const codes = (r) => r.errors.map((e) => `${e.row}:${e.column}:${e.code}`);
const S = (cols) => ({ columns: cols });

test('parse: BOM chỉ bỏ một ký tự', () => {
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
});
test('parse: kết thúc dòng lẫn lộn, dòng cuối, dòng trống bị bỏ', () => {
  assert.deepEqual(parseCsv('a\rb\r\nc\n\n\r\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\n'), []);
});
test('parse: dòng dấu cách và dòng "" không bị bỏ', () => {
  assert.deepEqual(parseCsv('  \n""\n'), [['  '], ['']]);
});
test('parse: không cắt khoảng trắng, dấu phân cách cuối sinh ô rỗng', () => {
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a,\n,'), [['a', ''], ['', '']]);
});
test('parse: CRLF trong nháy giữ nguyên', () => {
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
});
test('parse: BAD_QUOTE và row', () => {
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a\n\n"x'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
});
test('parse: CSV_INVALID_INPUT', () => {
  for (const bad of [[null], [1], ['a', { delimiter: '"' }], ['a', { delimiter: '\n' }], ['a', { delimiter: ',,' }], ['a', { delimiter: '' }]]) {
    assert.throws(() => parseCsv(...bad), (e) => e.code === 'CSV_INVALID_INPUT' && !('row' in e));
  }
});

test('validate: kiểu int/number/bool/date', () => {
  const sc = S([{ name: 'i', type: 'int' }, { name: 'n', type: 'number' }, { name: 'b', type: 'bool' }, { name: 'd', type: 'date' }]);
  const ok = validateCsv('i,n,b,d\n007,-1.5,TRUE,2024-02-29\n+5,0,false,2000-01-01\n-0,+3.25,False,0001-01-01\n', sc);
  assert.deepEqual(ok, { ok: true, rowCount: 3, errors: [] });
  for (const [col, v] of [['i', '1.0'], ['i', '1e3'], ['i', ' 1'], ['i', '9007199254740993'], ['n', '5.'], ['n', '.5'], ['n', '1e3'], ['n', 'NaN'], ['b', '1'], ['b', 'yes'],
    ['d', '2023-02-29'], ['d', '2024-13-01'], ['d', '0000-01-01'], ['d', '2024-1-01'], ['d', '1900-02-29']]) {
    const r = validateCsv(`${col}\n${v}\n`, S([{ name: col, type: sc.columns.find((c) => c.name === col).type }]));
    assert.deepEqual(r.errors, [{ row: 2, column: col, code: 'TYPE' }], `${col}=${v}`);
  }
  assert.equal(validateCsv('d\n2000-02-29\n', S([{ name: 'd', type: 'date' }])).ok, true);
});
test('validate: ENUM phân biệt hoa thường, PATTERN không neo', () => {
  const sc = S([{ name: 'r', enum: ['admin', 'user'], pattern: 'm' }]);
  assert.deepEqual(codes(validateCsv('r\nAdmin\nuser\n', sc)), ['2:r:ENUM', '3:r:PATTERN']);
  assert.equal(validateCsv('r\nadmin\n', sc).ok, true);
});
test('validate: min/max length theo điểm mã, bao gồm biên', () => {
  const sc = S([{ name: 'a', minLength: 2, maxLength: 3 }]);
  assert.deepEqual(codes(validateCsv('a\nx\nxy\nxyz\nxyzw\n😀😀\n😀😀😀😀\n', sc)), ['2:a:MIN_LENGTH', '5:a:MAX_LENGTH', '7:a:MAX_LENGTH']);
});
test('validate: min/max cho int, number, date; bỏ qua với string/bool', () => {
  const sc = S([{ name: 'i', type: 'int', min: 1, max: 5 }, { name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' },
    { name: 's', min: 100 }, { name: 'n', type: 'number', min: 0.5 }]);
  const r = validateCsv('i,d,s,n\n1,2024-01-01,0,0.5\n5,2024-12-31,0,0.5\n0,2023-12-31,0,0.4\n6,2025-01-01,0,1\n', sc);
  assert.deepEqual(codes(r), ['4:i:MIN', '4:d:MIN', '4:n:MIN', '5:i:MAX', '5:d:MAX']);
});
test('validate: UNIQUE – lần đầu hợp lệ, "1" khác "01", ô sai TYPE không vào tập', () => {
  const sc = S([{ name: 'id', type: 'int', unique: true }]);
  assert.deepEqual(codes(validateCsv('id\n1\n01\n1\n\n\n01\n', sc)), ['4:id:UNIQUE', '5:id:UNIQUE']);
  const sc2 = S([{ name: 'id', unique: true, pattern: '^[0-9]$' }]);
  assert.deepEqual(codes(validateCsv('id\nx\nx\n', sc2)), ['2:id:PATTERN', '3:id:PATTERN', '3:id:UNIQUE']);
  const sc3 = S([{ name: 'id', type: 'int', unique: true }]);
  assert.deepEqual(codes(validateCsv('id\nx\nx\n', sc3)), ['2:id:TYPE', '3:id:TYPE']);
});
test('validate: ô rỗng – REQUIRED, ô rỗng không bắt buộc bỏ qua mọi ràng buộc', () => {
  const sc = S([{ name: 'a', type: 'int', required: true }, { name: 'b', type: 'int', minLength: 3, pattern: 'x', enum: ['q'], unique: true }]);
  assert.deepEqual(codes(validateCsv('a,b\n,\n1,\n,\n', sc)), ['2:a:REQUIRED', '4:a:REQUIRED']);
});
test('validate: ROW_LENGTH đứng một mình, không kiểm ô, không vào UNIQUE', () => {
  const sc = S([{ name: 'a', required: true, unique: true }, { name: 'b' }]);
  assert.deepEqual(codes(validateCsv('a,b\n,\nx\nx,1,2\nx,1\n', sc)), ['2:a:REQUIRED', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH']);
});
test('validate: MISSING_COLUMN một lần, cột khác vẫn kiểm, không REQUIRED', () => {
  const sc = S([{ name: 'z', required: true }, { name: 'a', type: 'int' }]);
  assert.deepEqual(codes(validateCsv('a\nx\n', sc)), ['1:z:MISSING_COLUMN', '2:a:TYPE']);
});
test('validate: tên cột so khớp chính xác, tiêu đề lặp lấy cột đầu, cột thừa bỏ qua', () => {
  const sc = S([{ name: 'id', type: 'int' }]);
  assert.deepEqual(codes(validateCsv('ID,id\n1,2\n', sc)), []);
  assert.deepEqual(codes(validateCsv('id,id,extra\nx,1,y\n', sc)), ['2:id:TYPE']);
  assert.deepEqual(codes(validateCsv(' id\n1\n', sc)), ['1:id:MISSING_COLUMN']);
});
test('validate: thứ tự lỗi theo lược đồ, không theo tệp; nhiều lỗi một ô theo thứ tự kiểm', () => {
  const sc = S([{ name: 'b', enum: ['k'], pattern: '^z$', minLength: 5, maxLength: 0 }, { name: 'a', type: 'int', min: 5 }]);
  assert.deepEqual(codes(validateCsv('a,b\n1,q\n', sc)), ['2:b:ENUM', '2:b:PATTERN', '2:b:MIN_LENGTH', '2:b:MAX_LENGTH', '2:a:MIN']);
});
test('validate: hàng tính theo bản ghi (nháy có xuống dòng, dòng trống)', () => {
  const sc = S([{ name: 'a', type: 'int' }]);
  assert.deepEqual(codes(validateCsv('a\n\n"x\ny"\n\n2\nq\n', sc)), ['2:a:TYPE', '4:a:TYPE']);
});
test('validate: lỗi phân tích chỉ một lỗi; EMPTY_INPUT; chỉ tiêu đề', () => {
  const sc = S([{ name: 'a' }]);
  assert.deepEqual(validateCsv('a\nx\n"y', sc), { ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y\n', sc).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.deepEqual(validateCsv('', sc), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('\n\n', sc).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n', sc), { ok: true, rowCount: 0, errors: [] });
  assert.throws(() => validateCsv(5, sc), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => validateCsv('a', sc, { delimiter: '"' }), (e) => e.code === 'CSV_INVALID_INPUT');
});
test('validate: delimiter tùy chọn', () => {
  assert.deepEqual(validateCsv('a;b\n1;2\n', S([{ name: 'b', type: 'int' }]), { delimiter: ';' }), { ok: true, rowCount: 1, errors: [] });
});
test('validate: lỗi có đúng 3 khóa; không giới hạn số lỗi', () => {
  const r = validateCsv('a\n' + 'x\n'.repeat(500), S([{ name: 'a', type: 'int' }]));
  assert.equal(r.errors.length, 500);
  assert.deepEqual(Object.keys(r.errors[0]), ['row', 'column', 'code']);
});
test('validate: CSV_INVALID_SCHEMA, kiểm trước khi phân tích', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [null] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] }, { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] }, { columns: [{ name: 'a', type: 'number', max: Infinity }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] }, { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] }];
  for (const s of bad) {
    assert.throws(() => validateCsv('a\n"', s), (e) => e.code === 'CSV_INVALID_SCHEMA');
    assert.throws(() => validateCsv(5, s), (e) => e.code === 'CSV_INVALID_SCHEMA');
  }
});
