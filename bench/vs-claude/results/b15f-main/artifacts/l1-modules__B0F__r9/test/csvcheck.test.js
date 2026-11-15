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
const S = (cols) => ({ columns: cols });
const codes = (r) => r.errors.map((e) => `${e.row}:${e.column}:${e.code}`);

test('parseCsv: dòng trống, dòng "", dòng dấu cách, CR đơn, không newline cuối', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\r\n'), []);
  assert.deepEqual(parseCsv('a\n\n\nb'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('a\r\r\nb\r'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('a,\n'), [['a', '']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parseCsv: lỗi có code và row', () => {
  assert.throws(() => parseCsv('a\n\n"b\nc'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('a\nab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv(5), (e) => e.code === 'CSV_INVALID_INPUT' && !('row' in e));
  for (const d of ['""', '"', '\n', '\r', '', 1]) {
    assert.throws(() => parseCsv('a', { delimiter: d }), (e) => e.code === 'CSV_INVALID_INPUT');
  }
});

test('validateCsv: EMPTY_INPUT, chỉ tiêu đề, lỗi phân tích trả đúng 1 lỗi', () => {
  const s = S([{ name: 'a' }]);
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('\n\n', s).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a\n1\n"x', s), { ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.throws(() => validateCsv(1, s), (e) => e.code === 'CSV_INVALID_INPUT');
  assert.throws(() => validateCsv('a', s, { delimiter: '"' }), (e) => e.code === 'CSV_INVALID_INPUT');
});

test('validateCsv: CSV_INVALID_SCHEMA', () => {
  const bad = [null, {}, { columns: [] }, S([1]), S([{}]), S([{ name: 'a' }, { name: 'a' }]),
    S([{ name: 'a', type: 'x' }]), S([{ name: 'a', pattern: '(' }]), S([{ name: 'a', enum: [] }]),
    S([{ name: 'a', enum: [1] }]), S([{ name: 'a', type: 'int', min: '1' }]),
    S([{ name: 'a', type: 'date', min: '2023-02-29' }]), S([{ name: 'a', maxLength: -1 }]),
    S([{ name: 'a', minLength: 1.5 }])];
  for (const b of bad) assert.throws(() => validateCsv('a\n1', b), (e) => e.code === 'CSV_INVALID_SCHEMA');
  assert.throws(() => validateCsv('"x', null), (e) => e.code === 'CSV_INVALID_SCHEMA');
});

test('validateCsv: MISSING_COLUMN và ROW_LENGTH', () => {
  const s = S([{ name: 'a', required: true }, { name: 'b', required: true }, { name: 'c' }]);
  const r = validateCsv('a,c\n,x\n1\n1,2,3\n', s);
  assert.deepEqual(codes(r), ['1:b:MISSING_COLUMN', '2:a:REQUIRED', '3:null:ROW_LENGTH', '4:null:ROW_LENGTH']);
  assert.equal(r.rowCount, 3);
  assert.deepEqual(codes(validateCsv('A, a\n1,2', S([{ name: 'a', type: 'int', min: 5 }]))), ['1:a:MISSING_COLUMN']);
  assert.deepEqual(codes(validateCsv('A, a,a\n1,2,3', S([{ name: 'a', type: 'int', min: 5 }]))), ['2:a:MIN']);
  assert.deepEqual(codes(validateCsv('a,a\nx,5', S([{ name: 'a', type: 'int' }]))), ['2:a:TYPE']);
});

test('validateCsv: ROW_LENGTH không vào tập UNIQUE và đứng một mình', () => {
  const s = S([{ name: 'a', unique: true, required: true }, { name: 'b', required: true }]);
  assert.deepEqual(codes(validateCsv('a,b\n1\n1,x\n1,y,z\n1,x', s)), ['2:null:ROW_LENGTH', '4:null:ROW_LENGTH', '5:a:UNIQUE']);
});

test('validateCsv: mỗi mã lỗi ô một test', () => {
  const one = (col, cell) => codes(validateCsv('a\n' + cell + '\n', S([{ name: 'a', ...col }])));
  assert.deepEqual(one({ required: true }, '""'), ['2:a:REQUIRED']);
  assert.deepEqual(one({ type: 'int' }, '1.0'), ['2:a:TYPE']);
  assert.deepEqual(one({ enum: ['x'] }, 'X'), ['2:a:ENUM']);
  assert.deepEqual(one({ pattern: '^a' }, 'ba'), ['2:a:PATTERN']);
  assert.deepEqual(one({ pattern: 'a' }, 'ba'), []);
  assert.deepEqual(one({ minLength: 2 }, 'a'), ['2:a:MIN_LENGTH']);
  assert.deepEqual(one({ maxLength: 1 }, '😀😀'), ['2:a:MAX_LENGTH']);
  assert.deepEqual(one({ type: 'number', min: 1.5 }, '1.4'), ['2:a:MIN']);
  assert.deepEqual(one({ type: 'number', max: 1.5 }, '1.6'), ['2:a:MAX']);
  assert.deepEqual(one({ type: 'date', min: '2024-01-01' }, '2023-12-31'), ['2:a:MIN']);
  assert.deepEqual(one({ type: 'date', max: '2024-01-01' }, '2024-01-02'), ['2:a:MAX']);
  assert.deepEqual(one({ min: 5, max: 1 }, 'zz'), []);
  assert.deepEqual(one({ type: 'int', min: 1, max: 1 }, '1'), []);
  const u = validateCsv('a\n1\n01\n1\n', S([{ name: 'a', unique: true }]));
  assert.deepEqual(codes(u), ['4:a:UNIQUE']);
});

test('validateCsv: kiểu dữ liệu', () => {
  const t = (type, cell) => validateCsv('a\n' + cell + '\n', S([{ name: 'a', type }])).ok;
  for (const v of ['007', '+5', '-0']) assert.equal(t('int', v), true);
  for (const v of ['1.0', '1e3', ' 1', '9007199254740993']) assert.equal(t('int', v), false);
  assert.equal(t('number', '-1.50'), true);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity']) assert.equal(t('number', v), false);
  assert.equal(t('bool', 'TRUE'), true);
  for (const v of ['1', 'yes']) assert.equal(t('bool', v), false);
  assert.equal(t('date', '2024-02-29'), true);
  for (const v of ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-1']) assert.equal(t('date', v), false);
});

test('validateCsv: TYPE dừng, nhiều lỗi một ô theo thứ tự kiểm, ô rỗng bỏ qua ràng buộc', () => {
  const s = S([{ name: 'a', type: 'int', enum: ['5'], unique: true, min: 1 }]);
  assert.deepEqual(codes(validateCsv('a\nx\nx\n', s)), ['2:a:TYPE', '3:a:TYPE']);
  const m = S([{ name: 'a', enum: ['q'], pattern: '^z', minLength: 5, maxLength: 1, unique: true }]);
  assert.deepEqual(codes(validateCsv('a\nab\nab\n', m)),
    ['2:a:ENUM', '2:a:PATTERN', '2:a:MIN_LENGTH', '2:a:MAX_LENGTH',
     '3:a:ENUM', '3:a:PATTERN', '3:a:MIN_LENGTH', '3:a:MAX_LENGTH', '3:a:UNIQUE']);
  const n = S([{ name: 'a', type: 'int', enum: ['5'], min: 1, unique: true }]);
  assert.deepEqual(codes(validateCsv('a\n\n\n', n)), []);
  const mm = S([{ name: 'a', type: 'int', min: 5, max: 1 }]);
  assert.deepEqual(codes(validateCsv('a\n3\n', mm)), ['2:a:MIN', '2:a:MAX']);
});

test('validateCsv: thứ tự lỗi theo lược đồ, không theo thứ tự cột trong tệp', () => {
  const s = S([{ name: 'x', type: 'int' }, { name: 'y', type: 'int' }, { name: 'z', type: 'int' }]);
  const r = validateCsv('z,x,y\nq,q,q\n', s);
  assert.deepEqual(r.errors, [
    { row: 2, column: 'x', code: 'TYPE' },
    { row: 2, column: 'y', code: 'TYPE' },
    { row: 2, column: 'z', code: 'TYPE' },
  ]);
  assert.deepEqual(Object.keys(r.errors[0]), ['row', 'column', 'code']);
});

test('validateCsv: bản ghi nhiều dòng và số hàng khi có dòng trống', () => {
  const s = S([{ name: 'a', type: 'int' }, { name: 'b', maxLength: 2 }]);
  const r = validateCsv('a,b\n\n1,"x\ny\nz"\n\r\n\nq,ok\n', s);
  assert.equal(r.rowCount, 2);
  assert.deepEqual(codes(r), ['2:b:MAX_LENGTH', '3:a:TYPE']);
});

test('validateCsv: delimiter tùy chọn', () => {
  const r = validateCsv('a;b\n1;x', S([{ name: 'a', type: 'int' }, { name: 'b' }]), { delimiter: ';' });
  assert.deepEqual(r, { ok: true, rowCount: 1, errors: [] });
});
