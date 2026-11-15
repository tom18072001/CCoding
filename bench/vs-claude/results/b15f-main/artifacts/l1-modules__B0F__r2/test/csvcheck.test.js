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

const thrown = (f) => { try { f(); } catch (e) { return e; } return null; };
const S = (...columns) => ({ columns });
const errs = (t, s, o) => validateCsv(t, s, o).errors;
const E = (row, column, code) => ({ row, column, code });

test('parse: kết thúc dòng lẫn lộn, dòng cuối có/không newline, \\r đơn lẻ', () => {
  assert.deepEqual(parseCsv('a\rb\r\nc\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a\n'), [['a']]);
  assert.deepEqual(parseCsv('a\r\n'), [['a']]);
});

test('parse: rỗng, dòng trống bị bỏ, dòng dấu cách và "" được giữ', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\r\n\r'), []);
  assert.deepEqual(parseCsv('a\n\n\nb\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
});

test('parse: delimiter cuối, không cắt khoảng trắng, nháy giữ CRLF', () => {
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a,\nb'), [['a', ''], ['b']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv(',,'), [['', '', '']]);
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv('"a;b";c', { delimiter: ';' }), [['a;b', 'c']]);
  assert.deepEqual(parseCsv('a,b;c', { delimiter: ';' }), [['a,b', 'c']]);
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']]);
});

test('parse: chỉ bỏ đúng một BOM', () => {
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('﻿'), []);
});

test('parse: lỗi ném CSV_* có row theo bản ghi', () => {
  let e = thrown(() => parseCsv('a\n\nb,"x\ny'));
  assert.equal(e.code, 'CSV_UNTERMINATED_QUOTE');
  assert.equal(e.row, 2);
  e = thrown(() => parseCsv('a\nab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE');
  assert.equal(e.row, 2);
  e = thrown(() => parseCsv('"ab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE');
  assert.equal(e.row, 1);
  e = thrown(() => parseCsv('"l1\nl2"\n"a"x'));
  assert.equal(e.row, 2);
  assert.equal(thrown(() => parseCsv('"ab" ,c')).code, 'CSV_BAD_QUOTE');
  assert.deepEqual(parseCsv('"ab"\n"c",'), [['ab'], ['c', '']]);
});

test('parse: CSV_INVALID_INPUT không có row', () => {
  for (const f of [() => parseCsv(5), () => parseCsv(null), () => parseCsv('a', { delimiter: '' }),
    () => parseCsv('a', { delimiter: ',,' }), () => parseCsv('a', { delimiter: '"' }),
    () => parseCsv('a', { delimiter: '\n' }), () => parseCsv('a', { delimiter: '\r' }),
    () => parseCsv('a', { delimiter: 1 })]) {
    const e = thrown(f);
    assert.equal(e.code, 'CSV_INVALID_INPUT');
    assert.equal('row' in e, false);
  }
});

test('validate: lược đồ sai ném CSV_INVALID_SCHEMA', () => {
  const bad = [null, {}, { columns: [] }, { columns: [1] }, { columns: [{}] },
    { columns: [{ name: 'a' }, { name: 'a' }] }, { columns: [{ name: 'a', type: 'x' }] },
    { columns: [{ name: 'a', pattern: '(' }] }, { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1] }] }, { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'number', max: Infinity }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] }];
  for (const s of bad) {
    // văn bản có lỗi nháy: lược đồ vẫn được kiểm trước
    assert.equal(thrown(() => validateCsv('a\n"x', s)).code, 'CSV_INVALID_SCHEMA');
  }
  assert.equal(thrown(() => validateCsv(5, S({ name: 'a' }))).code, 'CSV_INVALID_INPUT');
  assert.equal(thrown(() => validateCsv('a', S({ name: 'a' }), { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
});

test('validate: lỗi parse trả đúng một lỗi, không ném', () => {
  let r = validateCsv('a\n1\n"x', S({ name: 'a', type: 'int' }));
  assert.deepEqual(r, { ok: false, rowCount: 0, errors: [E(3, null, 'UNTERMINATED_QUOTE')] });
  r = validateCsv('a\nx"y', S({ name: 'a' }));
  assert.deepEqual(r.errors, [E(2, null, 'BAD_QUOTE')]);
});

test('validate: EMPTY_INPUT, chỉ tiêu đề, MISSING_COLUMN', () => {
  const s = S({ name: 'a', required: true });
  for (const t of ['', '\n\n', '﻿']) {
    assert.deepEqual(validateCsv(t, s), { ok: false, rowCount: 0, errors: [E(1, null, 'EMPTY_INPUT')] });
  }
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  const r = validateCsv('b\n1\n', S({ name: 'x', required: true }, { name: 'y' }, { name: 'b', type: 'int', max: 0 }));
  assert.deepEqual(r.errors, [E(1, 'x', 'MISSING_COLUMN'), E(1, 'y', 'MISSING_COLUMN'), E(2, 'b', 'MAX')]);
  assert.equal(r.rowCount, 1);
  assert.equal(errs('A\n1', S({ name: 'a' }))[0].code, 'MISSING_COLUMN');
  assert.equal(errs(' a\n1', S({ name: 'a' }))[0].code, 'MISSING_COLUMN');
});

test('validate: tiêu đề lặp lấy cột đầu; cột thừa bị bỏ qua', () => {
  assert.deepEqual(errs('a,a,z\n1,x,y', S({ name: 'a', type: 'int' })), []);
  assert.deepEqual(errs('a,a\nx,1', S({ name: 'a', type: 'int' })), [E(2, 'a', 'TYPE')]);
});

test('validate: ROW_LENGTH đứng một mình, không kiểm ô, không vào UNIQUE; row theo bản ghi', () => {
  const s = S({ name: 'a', type: 'int', required: true, unique: true }, { name: 'b' });
  // hàng 2 có xuống dòng trong ô nên vẫn là một bản ghi; hàng 3 thiếu; hàng 4 thừa; dòng trống không chiếm số
  const r = validateCsv('a,b\n"1\n1",x\n1\n1,2,3\n1,ok\n\n1,dup\n', s);
  assert.deepEqual(r.errors, [E(2, 'a', 'TYPE'), E(3, null, 'ROW_LENGTH'), E(4, null, 'ROW_LENGTH'), E(6, 'a', 'UNIQUE')]);
  assert.equal(r.rowCount, 5);
  // hàng 3 (sai độ dài, giá trị 1) không vào UNIQUE nên hàng 4 là lần đầu
  assert.deepEqual(errs('a,b\n1\n1,x', S({ name: 'a', unique: true })), [E(2, null, 'ROW_LENGTH')]);
});

test('validate: kiểu int', () => {
  const s = S({ name: 'a', type: 'int' });
  for (const v of ['007', '+5', '-0', '0', '-12']) assert.deepEqual(errs(`a\n${v}`, s), [], v);
  for (const v of ['1.0', '1e3', ' 1', '1 ', 'a', '9007199254740993', '--1']) {
    assert.deepEqual(errs(`a\n"${v}"`, s), [E(2, 'a', 'TYPE')], v);
  }
});

test('validate: kiểu number', () => {
  const s = S({ name: 'a', type: 'number' });
  for (const v of ['1', '-1.5', '+0.25', '007.10']) assert.deepEqual(errs(`a\n${v}`, s), [], v);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity', '1,5', '1.2.3']) {
    assert.deepEqual(errs(`a\n"${v}"`, s), [E(2, 'a', 'TYPE')], v);
  }
  assert.deepEqual(errs('a\n1' + '0'.repeat(400), s), [E(2, 'a', 'TYPE')]);
});

test('validate: kiểu bool', () => {
  const s = S({ name: 'a', type: 'bool' });
  for (const v of ['true', 'false', 'TRUE', 'False']) assert.deepEqual(errs(`a\n${v}`, s), [], v);
  for (const v of ['1', 'yes', '0', 'truee', ' true']) {
    assert.deepEqual(errs(`a\n"${v}"`, s), [E(2, 'a', 'TYPE')], v);
  }
});

test('validate: kiểu date', () => {
  const s = S({ name: 'a', type: 'date' });
  for (const v of ['2024-02-29', '2000-02-29', '0001-01-01', '2023-12-31']) assert.deepEqual(errs(`a\n${v}`, s), [], v);
  for (const v of ['2023-02-29', '1900-02-29', '2024-13-01', '2024-00-10', '2024-01-00', '2024-04-31',
    '0000-01-01', '2024-1-1', '2024/01/01', '20240101', '2024-01-01 ']) {
    assert.deepEqual(errs(`a\n"${v}"`, s), [E(2, 'a', 'TYPE')], v);
  }
});

test('validate: required chỉ cho ô rỗng; ô rỗng không bắt buộc bỏ qua mọi ràng buộc', () => {
  const s = S({ name: 'a', type: 'int', required: true }, {
    name: 'b', type: 'int', enum: ['1'], pattern: '^x$', minLength: 3, min: 5, unique: true });
  assert.deepEqual(errs('a,b\n,\n1,\n2,\n', s), [E(2, 'a', 'REQUIRED')]);
  assert.deepEqual(errs('a\n" "', S({ name: 'a', required: true })), []);
  assert.deepEqual(errs('a\n" "', S({ name: 'a', type: 'int', required: true })), [E(2, 'a', 'TYPE')]);
});

test('validate: ENUM nguyên văn, mọi kiểu', () => {
  const s = S({ name: 'a', enum: ['admin', 'user'] }, { name: 'n', type: 'int', enum: ['1'] });
  assert.deepEqual(errs('a,n\nadmin,1\nAdmin,01\nuser ,1', s), [E(3, 'a', 'ENUM'), E(3, 'n', 'ENUM'), E(4, 'a', 'ENUM')]);
});

test('validate: PATTERN không neo, áp cho mọi kiểu', () => {
  const s = S({ name: 'a', pattern: 'ab' }, { name: 'b', pattern: '^ab$' });
  assert.deepEqual(errs('a,b\nxaby,ab\nxx,abc', s), [E(3, 'a', 'PATTERN'), E(3, 'b', 'PATTERN')]);
  assert.deepEqual(errs('a\n12', S({ name: 'a', type: 'int', pattern: '^3' })), [E(2, 'a', 'PATTERN')]);
});

test('validate: độ dài theo điểm mã Unicode, bao gồm biên', () => {
  const s = S({ name: 'a', minLength: 2, maxLength: 3 });
  assert.deepEqual(errs('a\n😀😀\n😀😀😀\nab', s), []);
  assert.deepEqual(errs('a\n😀\n😀😀😀😀\nx', s), [E(2, 'a', 'MIN_LENGTH'), E(3, 'a', 'MAX_LENGTH'), E(4, 'a', 'MIN_LENGTH')]);
  assert.deepEqual(errs('a\n007', S({ name: 'a', type: 'int', maxLength: 2 })), [E(2, 'a', 'MAX_LENGTH')]);
});

test('validate: min/max bao gồm biên; number; date; bỏ qua với string/bool', () => {
  const i = S({ name: 'a', type: 'int', min: 1, max: 3 });
  assert.deepEqual(errs('a\n1\n3\n0\n4', i), [E(4, 'a', 'MIN'), E(5, 'a', 'MAX')]);
  const n = S({ name: 'a', type: 'number', min: 0.5, max: 1.5 });
  assert.deepEqual(errs('a\n0.5\n1.5\n0.49\n1.51', n), [E(4, 'a', 'MIN'), E(5, 'a', 'MAX')]);
  const d = S({ name: 'a', type: 'date', min: '2024-01-01', max: '2024-12-31' });
  assert.deepEqual(errs('a\n2024-01-01\n2024-12-31\n2023-12-31\n2025-01-01', d), [E(4, 'a', 'MIN'), E(5, 'a', 'MAX')]);
  assert.deepEqual(errs('a\n5\nzzz', S({ name: 'a', min: 10, max: 1 })), []);
  assert.deepEqual(errs('a\ntrue', S({ name: 'a', type: 'bool', min: 'x', max: 1 })), []);
});

test('validate: UNIQUE nguyên văn, lần đầu hợp lệ, ô sai kiểu/rỗng không vào tập', () => {
  assert.deepEqual(errs('a\n1\n01\n1\n1', S({ name: 'a', unique: true })), [E(4, 'a', 'UNIQUE'), E(5, 'a', 'UNIQUE')]);
  assert.deepEqual(errs('a\nx\nx\n1\n1', S({ name: 'a', type: 'int', unique: true })),
    [E(2, 'a', 'TYPE'), E(3, 'a', 'TYPE'), E(5, 'a', 'UNIQUE')]);
  assert.deepEqual(errs('a,b\n,1\n,2', S({ name: 'a', unique: true }, { name: 'b' })), []);
  // giá trị vượt max vẫn vào tập UNIQUE
  assert.deepEqual(errs('a\n9\n9', S({ name: 'a', type: 'int', max: 5, unique: true })),
    [E(2, 'a', 'MAX'), E(3, 'a', 'MAX'), E(3, 'a', 'UNIQUE')]);
});

test('validate: thứ tự kiểm trong một ô (ENUM→PATTERN→MIN_LENGTH→MAX_LENGTH→MIN→MAX→UNIQUE)', () => {
  const s = S({ name: 'a', type: 'int', enum: ['x'], pattern: '^9', minLength: 3, maxLength: 0, min: 10, max: 0, unique: true });
  const c = errs('a\n5\n5', s).map((e) => e.code);
  assert.deepEqual(c, ['ENUM', 'PATTERN', 'MIN_LENGTH', 'MAX_LENGTH', 'MIN', 'MAX',
    'ENUM', 'PATTERN', 'MIN_LENGTH', 'MAX_LENGTH', 'MIN', 'MAX', 'UNIQUE']);
});

test('validate: thứ tự lỗi theo hàng rồi theo cột lược đồ, không theo tệp', () => {
  const s = S({ name: 'z', type: 'int' }, { name: 'a', type: 'int' });
  assert.deepEqual(errs('a,z\nx,y\nq,1\n2,w', s),
    [E(2, 'z', 'TYPE'), E(2, 'a', 'TYPE'), E(3, 'a', 'TYPE'), E(4, 'z', 'TYPE')]);
});

test('validate: delimiter tùy chọn, ok/rowCount, đúng 3 khóa', () => {
  const r = validateCsv('a;b\n1;2\n', S({ name: 'a', type: 'int' }, { name: 'b', type: 'int' }), { delimiter: ';' });
  assert.deepEqual(r, { ok: true, rowCount: 1, errors: [] });
  const e = validateCsv('a\nx', S({ name: 'a', type: 'int' })).errors[0];
  assert.deepEqual(Object.keys(e).sort(), ['code', 'column', 'row']);
});
