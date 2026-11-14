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

// ---- Test bổ sung ----
const codeOf = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const S = (...columns) => ({ columns });
const errs = (text, schema, o) => validateCsv(text, schema, o).errors;

test('parse: chuỗi rỗng, dòng cuối không kết thúc, dấu phân cách cuối', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a\n'), [['a']]);
  assert.deepEqual(parseCsv('a\n\n\n'), [['a']]);
});

test('parse: kết thúc dòng lẫn lộn CRLF/LF/CR', () => {
  assert.deepEqual(parseCsv('a\r\nb\nc\rd'), [['a'], ['b'], ['c'], ['d']]);
});

test('parse: dòng trống bị bỏ, dòng dấu cách và dòng "" thì không', () => {
  assert.deepEqual(parseCsv('a\n\nb'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('a\n  \nb'), [['a'], ['  '], ['b']]);
  assert.deepEqual(parseCsv('a\n""\nb'), [['a'], [''], ['b']]);
});

test('parse: xuống dòng trong nháy giữ nguyên CRLF, không cắt khoảng trắng', () => {
  assert.deepEqual(parseCsv('"a\r\nb", x ,"c"'), [['a\r\nb', ' x ', 'c']]);
});

test('parse: chỉ bỏ đúng một BOM', () => {
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('﻿'), []);
});

test('parse: lỗi nháy kèm row, và delimiter sai', () => {
  const row = (t) => { try { parseCsv(t); } catch (e) { return [e.code, e.row]; } return null; };
  assert.deepEqual(row('a\n\nb,"x\ny'), ['CSV_UNTERMINATED_QUOTE', 2]);
  assert.deepEqual(row('a\nab"c'), ['CSV_BAD_QUOTE', 2]);
  assert.deepEqual(row('"ab"c'), ['CSV_BAD_QUOTE', 1]);
  assert.equal(codeOf(() => parseCsv(5)), 'CSV_INVALID_INPUT');
  for (const d of ['"', '\r', '\n', '', ';;', 1]) {
    assert.equal(codeOf(() => parseCsv('a', { delimiter: d })), 'CSV_INVALID_INPUT');
  }
});

test('validate: EMPTY_INPUT, chỉ tiêu đề, lỗi phân tích không ném', () => {
  const sc = S({ name: 'a' });
  assert.deepEqual(validateCsv('', sc), { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] });
  assert.deepEqual(validateCsv('a', sc), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a\n"x', sc), { ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'UNTERMINATED_QUOTE' }] });
  assert.deepEqual(errs('a\nx"y', sc), [{ row: 2, column: null, code: 'BAD_QUOTE' }]);
  assert.equal(codeOf(() => validateCsv(1, sc)), 'CSV_INVALID_INPUT');
});

test('validate: MISSING_COLUMN, cột thừa bỏ qua, tên phân biệt hoa thường', () => {
  const sc = S({ name: 'x', required: true }, { name: 'B' }, { name: 'y' });
  assert.deepEqual(errs('y,b,z\n1,2,3', sc), [
    { row: 1, column: 'x', code: 'MISSING_COLUMN' },
    { row: 1, column: 'B', code: 'MISSING_COLUMN' },
  ]);
});

test('validate: ROW_LENGTH đứng một mình, không vào UNIQUE', () => {
  const sc = S({ name: 'a', required: true, unique: true }, { name: 'b' });
  assert.deepEqual(errs('a,b\n1\n1,2,3\n1,2', sc), [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
  ]);
});

test('validate: REQUIRED và ô rỗng không bắt buộc bỏ qua mọi ràng buộc', () => {
  const sc = S({ name: 'a', required: true }, { name: 'b', type: 'int', min: 5, pattern: '^x$', enum: ['q'], minLength: 3, unique: true });
  assert.deepEqual(errs('a,b\n,\n1,\n2,', sc), [{ row: 2, column: 'a', code: 'REQUIRED' }]);
});

test('validate: TYPE cho từng kiểu', () => {
  const t = (type, good, bad) => {
    const sc = S({ name: 'v', type });
    for (const g of good) assert.deepEqual(errs(`v\n"${g}"`, sc), [], `${type} ${g}`);
    for (const b of bad) assert.deepEqual(errs(`v\n"${b}"`, sc), [{ row: 2, column: 'v', code: 'TYPE' }], `${type} ${b}`);
  };
  t('int', ['007', '+5', '-0', '9007199254740991'], ['1.0', '1e3', ' 1', '9007199254740993', '-']);
  t('number', ['1', '-1.50', '+0.5'], ['5.', '.5', '1e3', 'NaN', 'Infinity', '1' + '0'.repeat(400)]);
  t('bool', ['true', 'FALSE', 'True'], ['1', 'yes', 'tru']);
  t('date', ['2024-02-29', '0001-01-01', '2000-02-29'], ['2023-02-29', '2024-13-01', '0000-01-01', '2024-1-01', '1900-02-29', '2024-04-31']);
});

test('validate: TYPE dừng, không kiểm tiếp và không vào UNIQUE', () => {
  const sc = S({ name: 'a', type: 'int', min: 1, enum: ['q'], pattern: '^z$', unique: true });
  assert.deepEqual(errs('a\nx\nx', sc), [{ row: 2, column: 'a', code: 'TYPE' }, { row: 3, column: 'a', code: 'TYPE' }]);
});

test('validate: ENUM nguyên văn', () => {
  const sc = S({ name: 'r', enum: ['admin', 'user'] });
  assert.deepEqual(errs('r\nadmin\nAdmin', sc), [{ row: 3, column: 'r', code: 'ENUM' }]);
});

test('validate: PATTERN không neo', () => {
  assert.deepEqual(errs('p\nxaby\nxy', S({ name: 'p', pattern: 'ab' })), [{ row: 3, column: 'p', code: 'PATTERN' }]);
  assert.deepEqual(errs('p\nxaby', S({ name: 'p', pattern: '^ab$' })), [{ row: 2, column: 'p', code: 'PATTERN' }]);
});

test('validate: MIN_LENGTH/MAX_LENGTH theo điểm mã, bao gồm biên', () => {
  const sc = S({ name: 's', minLength: 2, maxLength: 3 });
  assert.deepEqual(errs('s\na\nab\nabc\nabcd\n😀😀😀\n😀😀😀😀', sc), [
    { row: 2, column: 's', code: 'MIN_LENGTH' },
    { row: 5, column: 's', code: 'MAX_LENGTH' },
    { row: 7, column: 's', code: 'MAX_LENGTH' },
  ]);
});

test('validate: MIN/MAX bao gồm biên; số, ngày; bỏ qua với string', () => {
  assert.deepEqual(errs('n\n0\n1\n5\n6', S({ name: 'n', type: 'int', min: 1, max: 5 })), [
    { row: 2, column: 'n', code: 'MIN' }, { row: 5, column: 'n', code: 'MAX' }]);
  assert.deepEqual(errs('n\n1.4\n1.5\n2.5\n2.6', S({ name: 'n', type: 'number', min: 1.5, max: 2.5 })), [
    { row: 2, column: 'n', code: 'MIN' }, { row: 5, column: 'n', code: 'MAX' }]);
  assert.deepEqual(errs('d\n2024-01-01\n2024-01-02\n2024-01-03\n2024-01-04', S({ name: 'd', type: 'date', min: '2024-01-02', max: '2024-01-03' })), [
    { row: 2, column: 'd', code: 'MIN' }, { row: 5, column: 'd', code: 'MAX' }]);
  assert.deepEqual(errs('s\n0\nz', S({ name: 's', min: 5, max: 1 })), []);
});

test('validate: UNIQUE nguyên văn, lần đầu hợp lệ', () => {
  const sc = S({ name: 'u', unique: true });
  assert.deepEqual(errs('u\n1\n01\n1\n1', sc), [{ row: 4, column: 'u', code: 'UNIQUE' }, { row: 5, column: 'u', code: 'UNIQUE' }]);
});

test('validate: thứ tự lỗi trong ô ENUM→PATTERN→MIN_LENGTH→MAX_LENGTH→MIN→MAX→UNIQUE', () => {
  const sc = S({ name: 'a', type: 'int', enum: ['5'], pattern: '^9$', minLength: 5, unique: true, min: 100 });
  const r = errs('a\n1\n1', sc).map((e) => `${e.row}:${e.code}`);
  assert.deepEqual(r, ['2:ENUM', '2:PATTERN', '2:MIN_LENGTH', '2:MIN', '3:ENUM', '3:PATTERN', '3:MIN_LENGTH', '3:MIN', '3:UNIQUE']);
  const sc2 = S({ name: 'a', type: 'int', maxLength: 1, max: 5 });
  assert.deepEqual(errs('a\n99', sc2).map((e) => e.code), ['MAX_LENGTH', 'MAX']);
});

test('validate: thứ tự errors theo hàng, rồi theo cột lược đồ (không theo tệp)', () => {
  const sc = S({ name: 'b', type: 'int' }, { name: 'a', type: 'int' });
  assert.deepEqual(errs('a,b\nx,y\nz,2', sc), [
    { row: 2, column: 'b', code: 'TYPE' },
    { row: 2, column: 'a', code: 'TYPE' },
    { row: 3, column: 'a', code: 'TYPE' },
  ]);
  const sc2 = S({ name: 'q', required: true }, { name: 'a', type: 'int' });
  assert.deepEqual(errs('a,b\nx,y', sc2).map((e) => e.code), ['MISSING_COLUMN', 'TYPE']);
});

test('validate: số hàng đếm bản ghi, không đếm dòng', () => {
  const sc = S({ name: 'a', type: 'int' });
  const text = 'a\n\n"x\ny"\n\n1\nz';
  assert.deepEqual(errs(text, sc), [
    { row: 2, column: 'a', code: 'TYPE' },
    { row: 4, column: 'a', code: 'TYPE' },
  ]);
  assert.equal(validateCsv(text, sc).rowCount, 3);
});

test('validate: delimiter qua options, cột trùng tên tiêu đề lấy cột đầu', () => {
  const sc = S({ name: 'a', type: 'int' });
  assert.deepEqual(errs('a;a\n1;x', sc, { delimiter: ';' }), []);
  assert.deepEqual(errs('a;a\nx;1', sc, { delimiter: ';' }), [{ row: 2, column: 'a', code: 'TYPE' }]);
});

test('validate: CSV_INVALID_SCHEMA, kiểm trước khi phân tích văn bản', () => {
  const bad = [
    null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    S({ name: 'a' }, { name: 'a' }), S({ name: 'a', type: 'x' }),
    S({ name: 'a', pattern: '(' }), S({ name: 'a', enum: [] }), S({ name: 'a', enum: [1] }),
    S({ name: 'a', type: 'int', min: '1' }), S({ name: 'a', type: 'number', max: NaN }),
    S({ name: 'a', type: 'date', min: '2023-02-30' }),
    S({ name: 'a', minLength: -1 }), S({ name: 'a', maxLength: 1.5 }),
  ];
  for (const b of bad) assert.equal(codeOf(() => validateCsv(5, b)), 'CSV_INVALID_SCHEMA', JSON.stringify(b));
});
