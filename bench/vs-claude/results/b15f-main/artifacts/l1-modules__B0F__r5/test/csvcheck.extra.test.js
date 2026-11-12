import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, validateCsv } from '../src/csvcheck/index.js';

const throwsCode = (fn, code, row) =>
  assert.throws(fn, (e) => {
    assert.equal(e.code, code);
    if (row === undefined) assert.equal('row' in e, false);
    else assert.equal(e.row, row);
    return true;
  });
const S = (...columns) => ({ columns });
const codes = (r) => r.errors.map((e) => `${e.row}:${e.column}:${e.code}`);

// ---------- parseCsv ----------
test('parse: ví dụ SPEC', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('x,"y,""z"""\n"l1\nl2",'), [['x', 'y,"z"'], ['l1\nl2', '']]);
  assert.deepEqual(parseCsv('﻿a;b', { delimiter: ';' }), [['a', 'b']]);
});

test('parse: rỗng, BOM đúng một ký tự', () => {
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('﻿'), []);
  assert.deepEqual(parseCsv('﻿﻿a'), [['﻿a']]);
});

test('parse: kết thúc dòng lẫn lộn, \\r đơn, không bản ghi thừa', () => {
  assert.deepEqual(parseCsv('a\rb\r\nc\nd'), [['a'], ['b'], ['c'], ['d']]);
  assert.deepEqual(parseCsv('a\n'), [['a']]);
});

test('parse: dòng trống bỏ qua; dòng dấu cách và "" thì không', () => {
  assert.deepEqual(parseCsv('a\n\n\r\nb\n\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('  \n'), [['  ']]);
  assert.deepEqual(parseCsv('""\n'), [['']]);
});

test('parse: delimiter cuối sinh ô rỗng; không cắt khoảng trắng', () => {
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
  assert.deepEqual(parseCsv(',\n'), [['', '']]);
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('parse: nháy giữ nguyên CRLF và delimiter bên trong', () => {
  assert.deepEqual(parseCsv('"a\r\nb,c"'), [['a\r\nb,c']]);
  assert.deepEqual(parseCsv('"a""b"'), [['a"b']]);
  assert.deepEqual(parseCsv('""""'), [['"']]);
});

test('parse: số cột không đều không ném', () => {
  assert.deepEqual(parseCsv('a,b\n1\n1,2,3'), [['a', 'b'], ['1'], ['1', '2', '3']]);
});

test('parse: delimiter tùy chọn (tab)', () => {
  assert.deepEqual(parseCsv('a\tb,c', { delimiter: '\t' }), [['a', 'b,c']]);
});

test('parse: CSV_INVALID_INPUT không có row', () => {
  for (const bad of [null, undefined, 1, {}, []]) throwsCode(() => parseCsv(bad), 'CSV_INVALID_INPUT');
  for (const d of ['"', '\r', '\n', '', ';;', 5]) {
    throwsCode(() => parseCsv('a', { delimiter: d }), 'CSV_INVALID_INPUT');
  }
});

test('parse: CSV_UNTERMINATED_QUOTE kèm row', () => {
  throwsCode(() => parseCsv('"abc'), 'CSV_UNTERMINATED_QUOTE', 1);
  throwsCode(() => parseCsv('a\n\n"b\nc'), 'CSV_UNTERMINATED_QUOTE', 2);
  throwsCode(() => parseCsv('"a""'), 'CSV_UNTERMINATED_QUOTE', 1);
});

test('parse: CSV_BAD_QUOTE kèm row (dòng trống và nhiều dòng trong ô không chiếm số hàng)', () => {
  throwsCode(() => parseCsv('ab"c'), 'CSV_BAD_QUOTE', 1);
  throwsCode(() => parseCsv('"ab"c'), 'CSV_BAD_QUOTE', 1);
  throwsCode(() => parseCsv('a\n\n"x\ny"\nb"'), 'CSV_BAD_QUOTE', 3);
  throwsCode(() => parseCsv('a,b"'), 'CSV_BAD_QUOTE', 1);
  assert.deepEqual(parseCsv('"ab" '.slice(0, 4)), [['ab']]);
  throwsCode(() => parseCsv('"ab" '), 'CSV_BAD_QUOTE', 1);
});

// ---------- validateCsv: lược đồ ----------
test('schema: từng lý do sai → CSV_INVALID_SCHEMA, kiểm trước khi phân tích', () => {
  const bads = [
    undefined, null, {}, { columns: [] }, { columns: 'x' },
    S(null), S(1), S([]),
    S({}), S({ name: 1 }), S({ name: 'a' }, { name: 'a' }),
    S({ name: 'a', type: 'foo' }),
    S({ name: 'a', pattern: '(' }), S({ name: 'a', pattern: 5 }),
    S({ name: 'a', enum: [] }), S({ name: 'a', enum: 'x' }), S({ name: 'a', enum: ['x', 1] }),
    S({ name: 'a', type: 'int', min: '1' }), S({ name: 'a', type: 'number', max: Infinity }),
    S({ name: 'a', type: 'int', min: NaN }),
    S({ name: 'a', type: 'date', min: 5 }), S({ name: 'a', type: 'date', max: '2023-02-29' }),
    S({ name: 'a', minLength: -1 }), S({ name: 'a', minLength: 1.5 }), S({ name: 'a', maxLength: '3' }),
  ];
  for (const b of bads) {
    // text sai cú pháp quote: nếu schema không được kiểm trước thì sẽ ra lỗi khác
    throwsCode(() => validateCsv('"unterminated', b), 'CSV_INVALID_SCHEMA');
  }
});

test('schema: hợp lệ biên (min/max string/bool bị bỏ qua, date hợp lệ)', () => {
  const r = validateCsv('a\nx', S({ name: 'a', min: 'abc' }));
  assert.equal(r.ok, true);
  const r2 = validateCsv('d\n2024-02-29', S({ name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' }));
  assert.equal(r2.ok, true);
});

test('validate: CSV_INVALID_INPUT được ném', () => {
  throwsCode(() => validateCsv(5, S({ name: 'a' })), 'CSV_INVALID_INPUT');
  throwsCode(() => validateCsv('a', S({ name: 'a' }), { delimiter: '"' }), 'CSV_INVALID_INPUT');
});

// ---------- validateCsv: lỗi cấp tệp ----------
test('validate: EMPTY_INPUT', () => {
  const s = S({ name: 'a' });
  for (const t of ['', '﻿', '\n\r\n']) {
    assert.deepEqual(validateCsv(t, s), {
      ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }],
    });
  }
});

test('validate: chỉ có tiêu đề → hợp lệ rowCount 0', () => {
  assert.deepEqual(validateCsv('a,b\n', S({ name: 'a', required: true })), { ok: true, rowCount: 0, errors: [] });
});

test('validate: lỗi quote → đúng một lỗi, rowCount 0, không tiền tố', () => {
  const s = S({ name: 'a', required: true });
  assert.deepEqual(validateCsv('a\n1\n"x', s), {
    ok: false, rowCount: 0, errors: [{ row: 3, column: null, code: 'UNTERMINATED_QUOTE' }],
  });
  assert.deepEqual(validateCsv('a\nx"y\n', s), {
    ok: false, rowCount: 0, errors: [{ row: 2, column: null, code: 'BAD_QUOTE' }],
  });
});

test('validate: MISSING_COLUMN theo thứ tự lược đồ, không sinh REQUIRED, cột khác vẫn kiểm', () => {
  const s = S({ name: 'z', required: true }, { name: 'a', type: 'int' }, { name: 'y', required: true });
  const r = validateCsv('a,extra\nx,1\n', s);
  assert.deepEqual(codes(r), ['1:z:MISSING_COLUMN', '1:y:MISSING_COLUMN', '2:a:TYPE']);
  assert.equal(r.rowCount, 1);
});

test('validate: header chính xác (hoa thường, khoảng trắng), tên lặp lấy cột đầu', () => {
  const s = S({ name: 'a', type: 'int' });
  assert.deepEqual(codes(validateCsv('A\n1', s)), ['1:a:MISSING_COLUMN']);
  assert.deepEqual(codes(validateCsv(' a\n1', s)), ['1:a:MISSING_COLUMN']);
  assert.deepEqual(codes(validateCsv('a,a\nx,1', s)), ['2:a:TYPE']);
  assert.deepEqual(codes(validateCsv('a,a\n1,x', s)), []);
});

test('validate: ROW_LENGTH đứng một mình, không kiểm ô, không ghi UNIQUE', () => {
  const s = S({ name: 'id', type: 'int', required: true, unique: true });
  const r = validateCsv('id,b\n1\nx,y,z\n1,q\n1,q\n', s);
  assert.deepEqual(codes(r), ['2:null:ROW_LENGTH', '3:null:ROW_LENGTH', '5:id:UNIQUE']);
  assert.equal(r.rowCount, 4);
  for (const e of r.errors) assert.deepEqual(Object.keys(e).sort(), ['code', 'column', 'row']);
});

// ---------- validateCsv: từng mã ô ----------
test('validate: ví dụ SPEC', () => {
  const schema = S(
    { name: 'id', type: 'int', required: true, unique: true, min: 1 },
    { name: 'name', maxLength: 5 },
  );
  assert.deepEqual(validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema), {
    ok: false,
    rowCount: 4,
    errors: [
      { row: 3, column: 'id', code: 'UNIQUE' },
      { row: 3, column: 'name', code: 'MAX_LENGTH' },
      { row: 4, column: 'id', code: 'TYPE' },
      { row: 5, column: 'id', code: 'REQUIRED' },
    ],
  });
});

test('validate: ô rỗng không bắt buộc bỏ qua mọi ràng buộc và UNIQUE', () => {
  const s = S({ name: 'a', type: 'int', min: 5, minLength: 3, pattern: 'x', enum: ['q'], unique: true });
  assert.deepEqual(validateCsv('a\n\n""\n', s).errors, []);
  assert.deepEqual(validateCsv('a,b\n,1\n,2', s).errors, []);
});

test('validate: REQUIRED chỉ với ô rỗng "" (dấu cách không phải rỗng)', () => {
  const s = S({ name: 'a', required: true });
  assert.deepEqual(codes(validateCsv('a,b\n,1\n ,1', s)), ['2:a:REQUIRED']);
});

test('validate: kiểu int', () => {
  const s = S({ name: 'a', type: 'int' });
  const ok = ['007', '+5', '-0', '123'];
  const bad = ['1.0', '1e3', ' 1', '9007199254740993', 'x'];
  for (const v of ok) assert.equal(validateCsv(`a,b\n${v},1`, s).ok, true, v);
  for (const v of bad) assert.deepEqual(codes(validateCsv(`a,b\n${v},1`, s)), ['2:a:TYPE'], v);
});

test('validate: kiểu number', () => {
  const s = S({ name: 'a', type: 'number' });
  for (const v of ['1', '-1.5', '+0.25', '007.10']) assert.equal(validateCsv(`a,b\n${v},1`, s).ok, true, v);
  for (const v of ['5.', '.5', '1e3', 'NaN', 'Infinity', '1,5'.replace(',', ' ')]) {
    assert.deepEqual(codes(validateCsv(`a,b\n${v},1`, s)), ['2:a:TYPE'], v);
  }
  assert.deepEqual(codes(validateCsv(`a,b\n${'9'.repeat(400)},1`, s)), ['2:a:TYPE']);
});

test('validate: kiểu bool', () => {
  const s = S({ name: 'a', type: 'bool' });
  for (const v of ['true', 'FALSE', 'True']) assert.equal(validateCsv(`a,b\n${v},1`, s).ok, true, v);
  for (const v of ['1', 'yes', 'tru']) assert.deepEqual(codes(validateCsv(`a,b\n${v},1`, s)), ['2:a:TYPE'], v);
});

test('validate: kiểu date', () => {
  const s = S({ name: 'a', type: 'date' });
  for (const v of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.equal(validateCsv(`a,b\n${v},1`, s).ok, true, v);
  for (const v of ['2023-02-29', '1900-02-29', '2024-13-01', '2024-00-10', '2024-04-31', '0000-01-01', '2024-1-01', '2024/01/01']) {
    assert.deepEqual(codes(validateCsv(`a,b\n${v},1`, s)), ['2:a:TYPE'], v);
  }
});

test('validate: ENUM nguyên văn, mọi kiểu', () => {
  const s = S({ name: 'r', enum: ['admin', 'user'] });
  assert.deepEqual(codes(validateCsv('r\nadmin\nAdmin\n user', s)), ['3:r:ENUM', '4:r:ENUM']);
  const s2 = S({ name: 'n', type: 'int', enum: ['1'] });
  assert.deepEqual(codes(validateCsv('n\n1\n01', s2)), ['3:n:ENUM']);
});

test('validate: PATTERN không neo', () => {
  const s = S({ name: 'a', pattern: 'ab' });
  assert.deepEqual(codes(validateCsv('a\nxaby\nxay', s)), ['3:a:PATTERN']);
  const s2 = S({ name: 'a', pattern: '^ab$' });
  assert.deepEqual(codes(validateCsv('a\nab\nxaby', s2)), ['3:a:PATTERN']);
});

test('validate: MIN_LENGTH/MAX_LENGTH bao gồm biên, tính theo điểm mã', () => {
  const s = S({ name: 'a', minLength: 2, maxLength: 3 });
  assert.deepEqual(codes(validateCsv('a\nx\nxy\nxyz\nxyzw', s)), ['2:a:MIN_LENGTH', '5:a:MAX_LENGTH']);
  // emoji = 1 điểm mã (2 code unit)
  assert.deepEqual(codes(validateCsv('a\n😀😀😀\n😀😀😀😀', s)), ['3:a:MAX_LENGTH']);
  const s2 = S({ name: 'n', type: 'int', maxLength: 2 });
  assert.deepEqual(codes(validateCsv('n\n99\n100', s2)), ['3:n:MAX_LENGTH']);
});

test('validate: MIN/MAX bao gồm biên; int, number, date', () => {
  const s = S({ name: 'a', type: 'int', min: 1, max: 5 });
  assert.deepEqual(codes(validateCsv('a\n0\n1\n5\n6', s)), ['2:a:MIN', '5:a:MAX']);
  const s2 = S({ name: 'a', type: 'number', min: 0.5, max: 1.5 });
  assert.deepEqual(codes(validateCsv('a\n0.49\n0.5\n1.5\n1.51', s2)), ['2:a:MIN', '5:a:MAX']);
  const s3 = S({ name: 'd', type: 'date', min: '2024-01-01', max: '2024-12-31' });
  assert.deepEqual(codes(validateCsv('d\n2023-12-31\n2024-01-01\n2024-12-31\n2025-01-01', s3)), ['2:d:MIN', '5:d:MAX']);
});

test('validate: min/max bỏ qua với string và bool', () => {
  const s = S({ name: 'a', min: 5, max: 1 }, { name: 'b', type: 'bool', min: 5 });
  assert.equal(validateCsv('a,b\n3,true', s).ok, true);
});

test('validate: UNIQUE nguyên văn, lần đầu hợp lệ; ô TYPE sai không vào tập', () => {
  const s = S({ name: 'a', unique: true });
  assert.deepEqual(codes(validateCsv('a\n1\n01\n1\n1', s)), ['4:a:UNIQUE', '5:a:UNIQUE']);
  const s2 = S({ name: 'a', type: 'int', unique: true });
  assert.deepEqual(codes(validateCsv('a\nx\nx\n1\n1', s2)), ['2:a:TYPE', '3:a:TYPE', '5:a:UNIQUE']);
});

test('validate: UNIQUE vẫn ghi giá trị dù ô có lỗi ENUM/PATTERN/MIN', () => {
  const s = S({ name: 'a', type: 'int', min: 5, unique: true });
  assert.deepEqual(codes(validateCsv('a\n1\n1', s)), ['2:a:MIN', '3:a:MIN', '3:a:UNIQUE']);
});

// ---------- thứ tự lỗi ----------
test('validate: thứ tự trong một ô: ENUM→PATTERN→MIN_LENGTH→MAX_LENGTH→MIN→MAX→UNIQUE', () => {
  // minLength/maxLength không thể cùng sai; dùng hai ô để phủ cả hai
  const s = S({
    name: 'a', type: 'int', enum: ['x'], pattern: '^9$', minLength: 5, min: 100, unique: true,
  });
  assert.deepEqual(
    codes(validateCsv('a\n12\n12', s)),
    ['2:a:ENUM', '2:a:PATTERN', '2:a:MIN_LENGTH', '2:a:MIN',
     '3:a:ENUM', '3:a:PATTERN', '3:a:MIN_LENGTH', '3:a:MIN', '3:a:UNIQUE'],
  );
  const s2 = S({ name: 'a', type: 'int', maxLength: 1, max: 5, unique: true });
  assert.deepEqual(codes(validateCsv('a\n10\n10', s2)), ['2:a:MAX_LENGTH', '2:a:MAX', '3:a:MAX_LENGTH', '3:a:MAX', '3:a:UNIQUE']);
});

test('validate: trong hàng theo thứ tự lược đồ, không theo thứ tự cột tệp; giữa các hàng tăng dần', () => {
  const s = S({ name: 'b', type: 'int' }, { name: 'a', type: 'int' });
  const r = validateCsv('a,b\nx,y\n1,z\nq,2', s);
  assert.deepEqual(codes(r), ['2:b:TYPE', '2:a:TYPE', '3:b:TYPE', '4:a:TYPE']);
});

test('validate: số hàng đếm bản ghi, không đếm dòng; dòng trống không chiếm hàng', () => {
  const s = S({ name: 'a', type: 'int' }, { name: 'b' });
  const r = validateCsv('a,b\n\n"l1\nl2",x\n\n\nz,y\n', s);
  assert.equal(r.rowCount, 2);
  assert.deepEqual(codes(r), ['2:a:TYPE', '3:a:TYPE']);
});

test('validate: delimiter được chuyển cho parser', () => {
  const s = S({ name: 'b', type: 'int' });
  assert.deepEqual(codes(validateCsv('a;b\n1;x', s, { delimiter: ';' })), ['2:b:TYPE']);
});

test('validate: kết quả đủ khóa, ok = errors rỗng', () => {
  const r = validateCsv('a\n1', S({ name: 'a' }));
  assert.deepEqual(r, { ok: true, rowCount: 1, errors: [] });
});
