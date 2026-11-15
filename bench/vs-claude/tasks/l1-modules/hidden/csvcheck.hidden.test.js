import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const col = (name, extra = {}) => ({ name, ...extra });
const schemaOf = (...columns) => ({ columns });
const flat = (r) => r.errors.map((e) => `${e.row}:${e.column}:${e.code}`);
const codeOf = (code) => (e) => e.code === code;

// ---------- parseCsv ----------

test('parse: bản ghi và ô đơn giản', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('parse: CRLF, LF, CR đơn lẻ và lẫn lộn', () => {
  assert.deepEqual(parseCsv('a\r\nb\r\nc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a\nb\nc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a\rb\rc'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a,1\r\nb,2\nc,3\rd,4'), [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4']]);
  assert.deepEqual(parseCsv('a,b\n1,2\n'), parseCsv('a,b\n1,2'));
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('parse: chuỗi rỗng và chỉ có BOM cho mảng rỗng', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('﻿'), []);
  assert.deepEqual(parseCsv('\n\r\n'), []);
  assert.deepEqual(parseCsv('﻿a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
  assert.deepEqual(parseCsv('a,﻿b'), [['a', '﻿b']]);
});

test('parse: ô có nháy chứa dấu phẩy', () => {
  assert.deepEqual(parseCsv('"a,b",c\n"d",e'), [['a,b', 'c'], ['d', 'e']]);
  assert.deepEqual(parseCsv('"he said ""hi""",x'), [['he said "hi"', 'x']]);
  assert.deepEqual(parseCsv('""""'), [['"']]);
  assert.deepEqual(parseCsv('"a""",b'), [['a"', 'b']]);
});

test('parse: xuống dòng trong ô giữ nguyên văn (kể cả CRLF)', () => {
  assert.deepEqual(parseCsv('"l1\nl2",x\r\n"m1\r\nm2",y'), [['l1\nl2', 'x'], ['m1\r\nm2', 'y']]);
  assert.deepEqual(parseCsv('"a\rb"'), [['a\rb']]);
});

test('parse: ô rỗng, ô rỗng có nháy và dấu phân cách cuối bản ghi', () => {
  assert.deepEqual(parseCsv(',,\n'), [['', '', '']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv('a,\nb,'), [['a', ''], ['b', '']]);
  assert.deepEqual(parseCsv('a,"",c'), [['a', '', 'c']]);
  assert.deepEqual(parseCsv('a\n\nb\r\n\r\nc\n\n'), [['a'], ['b'], ['c']]);
  assert.deepEqual(parseCsv('a\n""\nb'), [['a'], [''], ['b']]);
  assert.deepEqual(parseCsv('a\n  \nb'), [['a'], ['  '], ['b']]);
});

test('parse: không cắt khoảng trắng; số ô mỗi bản ghi tự do', () => {
  assert.deepEqual(parseCsv(' a , b \nx'), [[' a ', ' b '], ['x']]);
  assert.deepEqual(parseCsv('a,b,c\n1\n1,2,3,4'), [['a', 'b', 'c'], ['1'], ['1', '2', '3', '4']]);
});

test('parse: delimiter tùy chọn', () => {
  assert.deepEqual(parseCsv('a;b\n"c;d";e', { delimiter: ';' }), [['a', 'b'], ['c;d', 'e']]);
  assert.deepEqual(parseCsv('a,b\tc', { delimiter: '\t' }), [['a,b', 'c']]);
  assert.deepEqual(parseCsv('a;b', { delimiter: ',' }), [['a;b']]);
  assert.deepEqual(parseCsv('"Nguyễn Văn Ạ",😀\nđ,ê'), [['Nguyễn Văn Ạ', '😀'], ['đ', 'ê']]);
});

test('parse: nháy không đóng ném CSV_UNTERMINATED_QUOTE kèm row', () => {
  assert.throws(() => parseCsv('a\n"b,c\nd'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"abc'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('"ab""'), codeOf('CSV_UNTERMINATED_QUOTE'));
});

test('parse: nháy lạc ném CSV_BAD_QUOTE kèm row', () => {
  assert.throws(() => parseCsv('a,b\nx,ab"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 2);
  assert.throws(() => parseCsv('"ab"c,d'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 1);
  assert.throws(() => parseCsv('a, "b"'), codeOf('CSV_BAD_QUOTE'));
  assert.throws(() => parseCsv('"a" ,b'), codeOf('CSV_BAD_QUOTE'));
  assert.throws(() => parseCsv('a\n\n"x\ny"\n\nb"c'), (e) => e.code === 'CSV_BAD_QUOTE' && e.row === 3);
});

test('parse: đầu vào sai kiểu ném CSV_INVALID_INPUT', () => {
  assert.throws(() => parseCsv(null), codeOf('CSV_INVALID_INPUT'));
  assert.throws(() => parseCsv(123), codeOf('CSV_INVALID_INPUT'));
  assert.throws(() => parseCsv('a', { delimiter: '' }), codeOf('CSV_INVALID_INPUT'));
  assert.throws(() => parseCsv('a', { delimiter: ';;' }), codeOf('CSV_INVALID_INPUT'));
  assert.throws(() => parseCsv('a', { delimiter: '"' }), codeOf('CSV_INVALID_INPUT'));
  assert.throws(() => parseCsv('a', { delimiter: '\n' }), codeOf('CSV_INVALID_INPUT'));
});

// ---------- validateCsv ----------

test('validate: hợp lệ trả ok, rowCount và mảng lỗi rỗng', () => {
  const r = validateCsv('id,name\n1,An\n2,Bình\n', schemaOf(col('id', { type: 'int' }), col('name')));
  assert.deepEqual(r, { ok: true, rowCount: 2, errors: [] });
  assert.deepEqual(validateCsv('id,name\n', schemaOf(col('id'), col('name'))), { ok: true, rowCount: 0, errors: [] });
  assert.deepEqual(validateCsv('', schemaOf(col('id'))), {
    ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }],
  });
  assert.deepEqual(validateCsv('﻿\r\n', schemaOf(col('id'))).errors, [{ row: 1, column: null, code: 'EMPTY_INPUT' }]);
});

test('validate: ví dụ trong SPEC', () => {
  const schema = schemaOf(col('id', { type: 'int', required: true, unique: true, min: 1 }), col('name', { maxLength: 5 }));
  const r = validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema);
  assert.equal(r.rowCount, 4);
  assert.deepEqual(r.errors, [
    { row: 3, column: 'id', code: 'UNIQUE' },
    { row: 3, column: 'name', code: 'MAX_LENGTH' },
    { row: 4, column: 'id', code: 'TYPE' },
    { row: 5, column: 'id', code: 'REQUIRED' },
  ]);
});

test('validate: cột lược đồ khác thứ tự tiêu đề, cột thừa bị bỏ qua', () => {
  const schema = schemaOf(col('b', { type: 'int' }), col('a', { type: 'int' }));
  assert.equal(validateCsv('a,extra,b\n1,zzz,2\n', schema).ok, true);
  assert.deepEqual(flat(validateCsv('a,extra,b\nx,zzz,y\n', schema)), ['2:b:TYPE', '2:a:TYPE']);
});

test('validate: MISSING_COLUMN ở hàng 1, cột còn lại vẫn kiểm, không sinh REQUIRED', () => {
  const schema = schemaOf(col('id', { required: true }), col('name', { required: true }), col('age', { type: 'int' }));
  const r = validateCsv('id,age\n1,x\n,2\n', schema);
  assert.deepEqual(flat(r), ['1:name:MISSING_COLUMN', '2:age:TYPE', '3:id:REQUIRED']);
  assert.deepEqual(flat(validateCsv('ID,name\n1,a\n', schemaOf(col('id'), col('name')))), ['1:id:MISSING_COLUMN']);
  assert.deepEqual(flat(validateCsv('id, name\n1,a\n', schemaOf(col('id'), col('name')))), ['1:name:MISSING_COLUMN']);
});

test('validate: ROW_LENGTH cho hàng thiếu/thừa, không kiểm ô, không vào UNIQUE', () => {
  const schema = schemaOf(col('id', { type: 'int', required: true, unique: true }), col('v', { required: true }));
  const r = validateCsv('id,v\n1\n2,a,b\n1,ok\n3,\n', schema);
  assert.deepEqual(r.errors, [
    { row: 2, column: null, code: 'ROW_LENGTH' },
    { row: 3, column: null, code: 'ROW_LENGTH' },
    { row: 5, column: 'v', code: 'REQUIRED' },
  ]);
  assert.equal(r.rowCount, 4);
});

test('validate: ô rỗng không bắt buộc bỏ qua mọi ràng buộc và UNIQUE', () => {
  const schema = schemaOf(col('n', { type: 'int', min: 5, pattern: '^9', minLength: 3, enum: ['900'], unique: true }));
  assert.deepEqual(validateCsv('n\n\n""\n900\n', schema).errors, []);
  assert.deepEqual(flat(validateCsv('n\n""\n', schemaOf(col('n', { required: true })))), ['2:n:REQUIRED']);
});

test('validate: kiểu int', () => {
  const schema = schemaOf(col('n', { type: 'int' }));
  const good = ['0', '7', '007', '-12', '+5', '-0', '9007199254740991'];
  const badv = ['1.0', '1e3', ' 1', '1 ', 'a', '--1', '9007199254740993', '1,5', '0x10'];
  for (const v of good) assert.equal(validateCsv(`n\n${v}\n`, schema).ok, true, `phải đúng: ${v}`);
  for (const v of badv) {
    assert.deepEqual(flat(validateCsv(`n\n"${v}"\n`, schema)), ['2:n:TYPE'], `phải sai: ${v}`);
  }
});

test('validate: kiểu number', () => {
  const schema = schemaOf(col('n', { type: 'number' }));
  for (const v of ['0', '3.14', '-2.50', '+0.5', '10']) assert.equal(validateCsv(`n\n${v}\n`, schema).ok, true, v);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity', '1,5', '1.2.3', '- 1']) {
    assert.deepEqual(flat(validateCsv(`n\n"${v}"\n`, schema)), ['2:n:TYPE'], v);
  }
});

test('validate: kiểu bool không phân biệt hoa thường', () => {
  const schema = schemaOf(col('b', { type: 'bool' }));
  for (const v of ['true', 'false', 'TRUE', 'False']) assert.equal(validateCsv(`b\n${v}\n`, schema).ok, true, v);
  for (const v of ['1', '0', 'yes', 'no', 't', 'truee']) {
    assert.deepEqual(flat(validateCsv(`b\n${v}\n`, schema)), ['2:b:TYPE'], v);
  }
});

test('validate: kiểu date là ngày có thật', () => {
  const schema = schemaOf(col('d', { type: 'date' }));
  for (const v of ['2024-02-29', '2000-02-29', '2023-12-31', '0001-01-01']) assert.equal(validateCsv(`d\n${v}\n`, schema).ok, true, v);
  for (const v of ['2023-02-29', '1900-02-29', '2024-13-01', '2024-00-10', '2024-04-31', '2024-1-5', '24-01-01', '2024/01/01', '0000-01-01', '2024-01-01T00:00']) {
    assert.deepEqual(flat(validateCsv(`d\n${v}\n`, schema)), ['2:d:TYPE'], v);
  }
});

test('validate: ô sai kiểu thì dừng, không báo min/pattern/độ dài/enum', () => {
  const schema = schemaOf(col('n', { type: 'int', min: 10, max: 20, pattern: '^[0-9]+$', minLength: 5, enum: ['15'] }));
  assert.deepEqual(flat(validateCsv('n\nabc\n', schema)), ['2:n:TYPE']);
});

test('validate: ô sai kiểu không vào tập UNIQUE', () => {
  const schema = schemaOf(col('n', { type: 'int', unique: true }));
  assert.deepEqual(flat(validateCsv('n\nx\nx\n1\n1\n', schema)), ['2:n:TYPE', '3:n:TYPE', '5:n:UNIQUE']);
});

test('validate: ENUM phân biệt hoa thường, áp cho mọi kiểu', () => {
  const schema = schemaOf(col('role', { enum: ['admin', 'user'] }), col('n', { type: 'int', enum: ['1', '2'] }));
  assert.deepEqual(flat(validateCsv('role,n\nadmin,1\nAdmin,2\nuser,3\n', schema)), ['3:role:ENUM', '4:n:ENUM']);
});

test('validate: PATTERN không neo; dùng ^$ để neo', () => {
  const loose = schemaOf(col('c', { pattern: '[0-9]{3}' }));
  assert.deepEqual(flat(validateCsv('c\nab123cd\n12\n', loose)), ['3:c:PATTERN']);
  const anchored = schemaOf(col('c', { pattern: '^[0-9]{3}$' }));
  assert.deepEqual(flat(validateCsv('c\n123\nab123\n1234\n', anchored)), ['3:c:PATTERN', '4:c:PATTERN']);
});

test('validate: minLength/maxLength bao gồm biên, tính theo điểm mã Unicode', () => {
  const schema = schemaOf(col('s', { minLength: 2, maxLength: 3 }));
  assert.deepEqual(flat(validateCsv('s\na\nab\nabc\nabcd\n', schema)), ['2:s:MIN_LENGTH', '5:s:MAX_LENGTH']);
  // "😀😀😀" là 3 điểm mã (6 đơn vị UTF-16): không vượt maxLength 3.
  assert.equal(validateCsv('s\n😀😀😀\n', schema).ok, true);
  assert.deepEqual(flat(validateCsv('s\n😀😀😀😀\n', schema)), ['2:s:MAX_LENGTH']);
  // Ô có nháy: độ dài tính trên giá trị đã bỏ nháy, "" bên trong là 1 ký tự.
  assert.equal(validateCsv('s\n"a""b"\n', schema).ok, true);
});

test('validate: MIN/MAX cho int và number bao gồm biên', () => {
  const schema = schemaOf(col('i', { type: 'int', min: 1, max: 10 }), col('x', { type: 'number', min: 0.5, max: 2.5 }));
  const r = validateCsv('i,x\n1,0.5\n10,2.5\n0,0.4\n11,2.6\n', schema);
  assert.deepEqual(flat(r), ['4:i:MIN', '4:x:MIN', '5:i:MAX', '5:x:MAX']);
});

test('validate: MIN/MAX cho date so sánh theo ngày, bỏ qua với string và bool', () => {
  const schema = schemaOf(
    col('d', { type: 'date', min: '2024-01-01', max: '2024-12-31' }),
    col('s', { min: 100, max: 1 }),
    col('b', { type: 'bool', min: 5 }),
  );
  const r = validateCsv('d,s,b\n2024-01-01,zzz,true\n2023-12-31,5,false\n2025-01-01,0,TRUE\n2024-12-31,9,true\n', schema);
  assert.deepEqual(flat(r), ['3:d:MIN', '4:d:MAX']);
});

test('validate: nhiều lỗi trong một ô theo thứ tự ENUM, PATTERN, MIN_LENGTH, MAX_LENGTH, MIN, MAX, UNIQUE', () => {
  const s1 = schemaOf(col('s', { enum: ['aaa'], pattern: '^z', minLength: 5 }));
  assert.deepEqual(flat(validateCsv('s\nab\n', s1)), ['2:s:ENUM', '2:s:PATTERN', '2:s:MIN_LENGTH']);
  const s2 = schemaOf(col('n', { type: 'int', maxLength: 1, max: 5, unique: true }));
  assert.deepEqual(flat(validateCsv('n\n10\n10\n', s2)), ['2:n:MAX_LENGTH', '2:n:MAX', '3:n:MAX_LENGTH', '3:n:MAX', '3:n:UNIQUE']);
  const s3 = schemaOf(col('m', { type: 'int', min: 100, minLength: 5 }));
  assert.deepEqual(flat(validateCsv('m\n7\n', s3)), ['2:m:MIN_LENGTH', '2:m:MIN']);
});

test('validate: UNIQUE — lần đầu hợp lệ, các lần sau báo lỗi; so nguyên văn', () => {
  const schema = schemaOf(col('k', { unique: true }));
  assert.deepEqual(flat(validateCsv('k\na\nb\na\nA\na\n', schema)), ['4:k:UNIQUE', '6:k:UNIQUE']);
  const num = schemaOf(col('k', { type: 'int', unique: true }));
  assert.equal(validateCsv('k\n1\n01\n+1\n', num).ok, true);
});

test('validate: thứ tự lỗi theo hàng, rồi theo cột lược đồ (không theo tiêu đề)', () => {
  const schema = schemaOf(col('c', { type: 'int' }), col('a', { type: 'int' }), col('b', { type: 'int' }));
  const r = validateCsv('a,b,c\nx,y,z\n1,y,2\nx,1,z\n', schema);
  assert.deepEqual(flat(r), ['2:c:TYPE', '2:a:TYPE', '2:b:TYPE', '3:b:TYPE', '4:c:TYPE', '4:a:TYPE']);
});

test('validate: ô nhiều dòng là một bản ghi, số hàng đếm bản ghi', () => {
  const schema = schemaOf(col('note', { maxLength: 5 }), col('n', { type: 'int' }));
  const r = validateCsv('note,n\r\n"dòng 1\r\ndòng 2",1\r\n\r\nok,x\r\n', schema);
  assert.deepEqual(flat(r), ['2:note:MAX_LENGTH', '3:n:TYPE']);
  assert.equal(r.rowCount, 2);
});

test('validate: BOM + CRLF + ô có nháy + thiếu xuống dòng cuối', () => {
  const schema = schemaOf(col('name', { required: true }), col('age', { type: 'int', min: 0 }));
  const r = validateCsv('﻿name,age\r\n"Lê, Văn",30\r\n"Trần ""T""",-1', schema);
  assert.deepEqual(r, { ok: false, rowCount: 2, errors: [{ row: 3, column: 'age', code: 'MIN' }] });
});

test('validate: lỗi phân tích trả đúng một lỗi, không ném', () => {
  const schema = schemaOf(col('a', { required: true }), col('b'));
  assert.deepEqual(validateCsv('a,b\n,x\n1,"y\n', schema), {
    ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }],
  });
  assert.deepEqual(validateCsv('a,b\n,x\n1,y"z\n', schema).errors, [{ row: 3, column: null, code: 'BAD_QUOTE' }]);
});

test('validate: tùy chọn delimiter được chuyển cho bộ phân tích', () => {
  const schema = schemaOf(col('a', { type: 'int' }), col('b'));
  assert.equal(validateCsv('a;b\n1;"x;y"\n', schema, { delimiter: ';' }).ok, true);
  assert.deepEqual(flat(validateCsv('a;b\nx;y\n', schema, { delimiter: ';' })), ['2:a:TYPE']);
});

test('validate: đầu vào sai kiểu ném CSV_INVALID_INPUT', () => {
  assert.throws(() => validateCsv(undefined, schemaOf(col('a'))), codeOf('CSV_INVALID_INPUT'));
});

test('validate: lược đồ sai ném CSV_INVALID_SCHEMA', () => {
  const bad = [
    undefined,
    {},
    { columns: [] },
    { columns: [{ type: 'int' }] },
    { columns: [{ name: 'a' }, { name: 'a' }] },
    { columns: [{ name: 'a', type: 'float' }] },
    { columns: [{ name: 'a', pattern: '(' }] },
    { columns: [{ name: 'a', enum: [] }] },
    { columns: [{ name: 'a', enum: [1, 2] }] },
    { columns: [{ name: 'a', type: 'int', min: '1' }] },
    { columns: [{ name: 'a', type: 'date', max: '2024-02-30' }] },
    { columns: [{ name: 'a', minLength: -1 }] },
    { columns: [{ name: 'a', maxLength: 1.5 }] },
  ];
  for (const s of bad) assert.throws(() => validateCsv('a\n1\n', s), codeOf('CSV_INVALID_SCHEMA'), JSON.stringify(s));
});

test('validate: lỗi có đúng ba khóa row, column, code', () => {
  const r = validateCsv('a,b\nx\n', schemaOf(col('a', { type: 'int' })));
  assert.deepEqual(Object.keys(r.errors[0]).sort(), ['code', 'column', 'row']);
  assert.deepEqual(Object.keys(r).sort(), ['errors', 'ok', 'rowCount']);
});
