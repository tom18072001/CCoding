import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const E = (row, column, code) => ({ row, column, code });
const codeOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };

// ---------- parseCsv ----------
test('parse: tách bản ghi, CRLF và ô có nháy (ví dụ SPEC)', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
});

test('parse: BOM bỏ đúng một ký tự, delimiter tùy chọn', () => {
  assert.deepEqual(parseCsv('﻿a;b', { delimiter: ';' }), [['a', 'b']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
});

test('parse: kết thúc dòng lẫn lộn, \\r đơn, dòng cuối có/không kết thúc', () => {
  assert.deepEqual(parseCsv('a\rb\r\nc\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a\n'), [['a']]);
  assert.deepEqual(parseCsv('a\r\n'), [['a']]);
});

test('parse: dòng trống bị bỏ, dòng dấu cách và "" thì không', () => {
  assert.deepEqual(parseCsv('a\n\n\r\nb'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
});

test('parse: giữ CRLF trong nháy, không cắt khoảng trắng, dấu phân cách cuối', () => {
  assert.deepEqual(parseCsv('"a\r\nb",c'), [['a\r\nb', 'c']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('﻿'), []);
});

test('parse: lỗi cú pháp kèm code và row', () => {
  let e = codeOf(() => parseCsv('a\nb,"c'));
  assert.equal(e.code, 'CSV_UNTERMINATED_QUOTE'); assert.equal(e.row, 2);
  e = codeOf(() => parseCsv('a\n\nab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE'); assert.equal(e.row, 2); // dòng trống không chiếm số hàng
  e = codeOf(() => parseCsv('"ab"c'));
  assert.equal(e.code, 'CSV_BAD_QUOTE'); assert.equal(e.row, 1);
  e = codeOf(() => parseCsv('"l1\nl2"x'));
  assert.equal(e.row, 1); // ô nhiều dòng vẫn một bản ghi
});

test('parse: CSV_INVALID_INPUT cho text/delimiter sai, không có row', () => {
  for (const f of [() => parseCsv(5), () => parseCsv('a', { delimiter: '' }),
    () => parseCsv('a', { delimiter: ',,' }), () => parseCsv('a', { delimiter: '"' }),
    () => parseCsv('a', { delimiter: '\n' }), () => parseCsv('a', { delimiter: '\r' })]) {
    const e = codeOf(f);
    assert.equal(e.code, 'CSV_INVALID_INPUT');
    assert.equal('row' in e, false);
  }
});

// ---------- validateCsv ----------
test('validate: ví dụ trong SPEC', () => {
  const schema = { columns: [
    { name: 'id', type: 'int', required: true, unique: true, min: 1 },
    { name: 'name', maxLength: 5 },
  ] };
  const r = validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema);
  assert.equal(r.ok, false);
  assert.equal(r.rowCount, 4);
  assert.deepEqual(r.errors, [E(3, 'id', 'UNIQUE'), E(3, 'name', 'MAX_LENGTH'),
    E(4, 'id', 'TYPE'), E(5, 'id', 'REQUIRED')]);
});

test('validate: một ô sinh nhiều lỗi theo thứ tự ENUM→PATTERN→MIN_LENGTH→MAX_LENGTH→MIN→MAX→UNIQUE', () => {
  const s = { columns: [{ name: 'a', enum: ['zz'], pattern: '^q', minLength: 5, unique: true }] };
  assert.deepEqual(validateCsv('a\nab\nab', s).errors, [
    E(2, 'a', 'ENUM'), E(2, 'a', 'PATTERN'), E(2, 'a', 'MIN_LENGTH'),
    E(3, 'a', 'ENUM'), E(3, 'a', 'PATTERN'), E(3, 'a', 'MIN_LENGTH'), E(3, 'a', 'UNIQUE')]);
  // MAX_LENGTH rồi UNIQUE
  const s2 = { columns: [{ name: 'a', maxLength: 1, unique: true }] };
  assert.deepEqual(validateCsv('a\nxx\nxx', s2).errors,
    [E(2, 'a', 'MAX_LENGTH'), E(3, 'a', 'MAX_LENGTH'), E(3, 'a', 'UNIQUE')]);
  // MIN và MAX cùng ô (min > max)
  const s3 = { columns: [{ name: 'n', type: 'int', min: 10, max: 5 }] };
  assert.deepEqual(validateCsv('n\n7', s3).errors, [E(2, 'n', 'MIN'), E(2, 'n', 'MAX')]);
});

test('validate: thứ tự cột theo lược đồ, không theo tệp; cột lạ bị bỏ qua', () => {
  const s = { columns: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }] };
  const r = validateCsv('extra,b,a\nq,x,y\n', s);
  assert.deepEqual(r.errors, [E(2, 'a', 'TYPE'), E(2, 'b', 'TYPE')]);
});

test('validate: ô sai kiểu dừng, không vào tập UNIQUE', () => {
  const s = { columns: [{ name: 'a', type: 'int', unique: true, enum: ['1'], min: 5 }] };
  assert.deepEqual(validateCsv('a\nx\nx', s).errors, [E(2, 'a', 'TYPE'), E(3, 'a', 'TYPE')]);
  const s2 = { columns: [{ name: 'a', type: 'int', unique: true }] };
  assert.deepEqual(validateCsv('a\n1\n01\n1', s2).errors, [E(4, 'a', 'UNIQUE')]);
});

test('validate: ô rỗng không bắt buộc bỏ qua mọi ràng buộc, không vào UNIQUE', () => {
  const s = { columns: [{ name: 'a', type: 'int', unique: true, enum: ['1'], pattern: 'x', minLength: 3 }, { name: 'b' }] };
  assert.deepEqual(validateCsv('a,b\n,1\n,2', s).errors, []);
  const s2 = { columns: [{ name: 'a', required: true }] };
  assert.deepEqual(validateCsv('a\n""\n ', s2).errors, [E(2, 'a', 'REQUIRED')]); // " " không rỗng
});

test('validate: ROW_LENGTH đứng một mình, không kiểm ô, không ghi UNIQUE', () => {
  const s = { columns: [{ name: 'a', type: 'int', required: true, unique: true }, { name: 'b' }] };
  const r = validateCsv('a,b\n1\nx,y,z\n1,q\n', s);
  assert.deepEqual(r.errors, [E(2, null, 'ROW_LENGTH'), E(3, null, 'ROW_LENGTH')]);
  assert.equal(r.rowCount, 3);
});

test('validate: MISSING_COLUMN một lần ở hàng 1, không sinh REQUIRED; tiêu đề lặp lấy cột đầu', () => {
  const s = { columns: [{ name: 'x', required: true }, { name: 'a', type: 'int' }] };
  assert.deepEqual(validateCsv('a\nq\n\"\"', s).errors,
    [E(1, 'x', 'MISSING_COLUMN'), E(2, 'a', 'TYPE')].concat([]));
  const s2 = { columns: [{ name: 'a', type: 'int' }] };
  assert.deepEqual(validateCsv('a,a\n1,x\nx,1', s2).errors, [E(3, 'a', 'TYPE')]);
  // tên phân biệt hoa thường, không cắt khoảng trắng
  assert.deepEqual(validateCsv('A, a\n1,2', s2).errors, [E(1, 'a', 'MISSING_COLUMN')]);
});

test('validate: EMPTY_INPUT, chỉ tiêu đề, lỗi phân tích không ném', () => {
  const s = { columns: [{ name: 'a' }] };
  assert.deepEqual(validateCsv('', s), { ok: false, rowCount: 0, errors: [E(1, null, 'EMPTY_INPUT')] });
  assert.deepEqual(validateCsv('\n\n', s).errors, [E(1, null, 'EMPTY_INPUT')]);
  assert.deepEqual(validateCsv('a\n', s), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('a\nx\n"y', s),
    { ok: false, rowCount: 0, errors: [E(3, null, 'UNTERMINATED_QUOTE')] });
  assert.deepEqual(validateCsv('a\nx"y', s).errors, [E(2, null, 'BAD_QUOTE')]);
  assert.equal(codeOf(() => validateCsv(1, s)).code, 'CSV_INVALID_INPUT');
  assert.equal(codeOf(() => validateCsv('a', s, { delimiter: '"' })).code, 'CSV_INVALID_INPUT');
});

test('validate: số hàng đếm bản ghi, không đếm dòng', () => {
  const s = { columns: [{ name: 'a', type: 'int' }] };
  assert.deepEqual(validateCsv('a\n\n"1\n2"\n\nx', s).errors, [E(2, 'a', 'TYPE'), E(3, 'a', 'TYPE')]);
});

test('validate: delimiter được chuyển cho parse', () => {
  const s = { columns: [{ name: 'b', type: 'int' }] };
  assert.deepEqual(validateCsv('a;b\n1;x', s, { delimiter: ';' }).errors, [E(2, 'b', 'TYPE')]);
});

test('validate: kiểu int / number', () => {
  const s = { columns: [{ name: 'i', type: 'int' }, { name: 'n', type: 'number' }] };
  const ok = (i, n) => validateCsv(`i,n\n${i},${n}`, s).errors;
  assert.deepEqual(ok('007', '+5.50'), []);
  assert.deepEqual(ok('+5', '-0'), []);
  assert.deepEqual(ok('-0', '10'), []);
  assert.deepEqual(ok('1.0', '1e3'), [E(2, 'i', 'TYPE'), E(2, 'n', 'TYPE')]);
  assert.deepEqual(ok(' 1', '5.'), [E(2, 'i', 'TYPE'), E(2, 'n', 'TYPE')]);
  assert.deepEqual(ok('9007199254740993', '.5'), [E(2, 'i', 'TYPE'), E(2, 'n', 'TYPE')]);
  assert.deepEqual(ok('9007199254740991', 'NaN'), [E(2, 'n', 'TYPE')]);
  assert.deepEqual(ok('1', 'Infinity'), [E(2, 'n', 'TYPE')]);
  assert.deepEqual(ok('1', '1' + '0'.repeat(400)), [E(2, 'n', 'TYPE')]); // không hữu hạn
});

test('validate: kiểu bool và date', () => {
  const s = { columns: [{ name: 'b', type: 'bool' }, { name: 'd', type: 'date' }] };
  const v = (b, d) => validateCsv(`b,d\n${b},${d}`, s).errors;
  assert.deepEqual(v('TRUE', '2024-02-29'), []);
  assert.deepEqual(v('False', '2000-02-29'), []);
  assert.deepEqual(v('1', '2023-02-29'), [E(2, 'b', 'TYPE'), E(2, 'd', 'TYPE')]);
  assert.deepEqual(v('yes', '2024-13-01'), [E(2, 'b', 'TYPE'), E(2, 'd', 'TYPE')]);
  assert.deepEqual(v('true', '0000-01-01'), [E(2, 'd', 'TYPE')]);
  assert.deepEqual(v('true', '1900-02-29'), [E(2, 'd', 'TYPE')]);
  assert.deepEqual(v('true', '2024-1-01'), [E(2, 'd', 'TYPE')]);
  assert.deepEqual(v('true', '2024-04-31'), [E(2, 'd', 'TYPE')]);
});

test('validate: enum nguyên văn, pattern không neo, độ dài theo điểm mã', () => {
  const s = { columns: [{ name: 'a', enum: ['admin'] }] };
  assert.deepEqual(validateCsv('a\nAdmin', s).errors, [E(2, 'a', 'ENUM')]);
  const n = { columns: [{ name: 'a', type: 'int', enum: ['5'] }] };
  assert.deepEqual(validateCsv('a\n05', n).errors, [E(2, 'a', 'ENUM')]);
  const p = { columns: [{ name: 'a', pattern: 'b' }] };
  assert.deepEqual(validateCsv('a\nabc\nxyz', p).errors, [E(3, 'a', 'PATTERN')]);
  const l = { columns: [{ name: 'a', minLength: 2, maxLength: 2 }] };
  assert.deepEqual(validateCsv('a\n😀😀\n😀\n😀😀😀', l).errors, [E(3, 'a', 'MIN_LENGTH'), E(4, 'a', 'MAX_LENGTH')]);
  const li = { columns: [{ name: 'a', type: 'int', maxLength: 2 }] };
  assert.deepEqual(validateCsv('a\n007', li).errors, [E(2, 'a', 'MAX_LENGTH')]); // văn bản gốc
});

test('validate: min/max bao gồm biên; áp cho int/number/date, bỏ qua string/bool', () => {
  const s = { columns: [{ name: 'n', type: 'number', min: 1.5, max: 3 },
    { name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' },
    { name: 's', min: 100, max: 1 }, { name: 'b', type: 'bool', min: 5 }] };
  assert.deepEqual(validateCsv('n,d,s,b\n1.5,2024-01-01,5,true\n3,2024-12-31,5,true', s).errors, []);
  assert.deepEqual(validateCsv('n,d,s,b\n1.4,2023-12-31,5,true\n3.1,2025-01-01,5,true', s).errors,
    [E(2, 'n', 'MIN'), E(2, 'd', 'MIN'), E(3, 'n', 'MAX'), E(3, 'd', 'MAX')]);
});

test('validate: lỗi lược đồ ném CSV_INVALID_SCHEMA trước khi phân tích', () => {
  const bads = [undefined, null, {}, { columns: [] }, { columns: 'x' }, { columns: [1] },
    { columns: [{}] }, { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'uuid' }] }, { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] }, { columns: [{ name: 'a', enum: [1] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'int', max: NaN }] },
    { columns: [{ name: 'a', type: 'date', min: '2023-02-29' }] },
    { columns: [{ name: 'a', type: 'date', max: 5 }] },
    { columns: [{ name: 'a', minLength: -1 }] }, { columns: [{ name: 'a', maxLength: 1.5 }] }];
  for (const b of bads) {
    // văn bản lỗi phân tích: lược đồ vẫn được kiểm trước
    const e = codeOf(() => validateCsv('a"b', b));
    assert.equal(e && e.code, 'CSV_INVALID_SCHEMA', JSON.stringify(b));
  }
});

test('validate: mỗi lỗi có đúng 3 khóa; mã ném có tiền tố CSV_, mã trong mảng thì không', () => {
  const r = validateCsv('a\n"x', { columns: [{ name: 'a' }] });
  assert.deepEqual(Object.keys(r.errors[0]).sort(), ['code', 'column', 'row']);
  assert.equal(r.errors[0].code, 'UNTERMINATED_QUOTE');
});
