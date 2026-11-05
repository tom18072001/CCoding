import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';
import { parse, parseProject } from '../src/parser.js';

const lexErr = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  return [r.error.code, r.error.line, r.error.column];
};
const parseErr = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  return [r.error.code, r.error.line, r.error.column];
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};
const ast = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};

test('lexer: dòng gán đơn giản và token eof · lexer: eof sau xuống dòng cuối nằm ở đầu dòng kế', () => {
  {
    assert.deepEqual(toks('a = 1'), [
      { type: 'ident', value: 'a', line: 1, column: 1 },
      { type: 'punct', value: '=', line: 1, column: 3 },
      { type: 'number', value: 1, line: 1, column: 5 },
      { type: 'eof', value: null, line: 1, column: 6 },
    ]);
  }
  {
    const t = toks('a\n');
    assert.deepEqual(t[t.length - 1], { type: 'eof', value: null, line: 2, column: 1 });
    assert.deepEqual(toks('')[0], { type: 'eof', value: null, line: 1, column: 1 });
  }
});

test('lexer: từ khóa và định danh · lexer: dấu câu', () => {
  {
    const t = toks('include const true false null foo _x my-key a1');
    assert.deepEqual(t.slice(0, -1).map((x) => [x.type, x.value]), [
      ['keyword', 'include'], ['keyword', 'const'], ['keyword', 'true'], ['keyword', 'false'], ['keyword', 'null'],
      ['ident', 'foo'], ['ident', '_x'], ['ident', 'my-key'], ['ident', 'a1'],
    ]);
    assert.equal(toks('nullable')[0].type, 'ident');
    assert.equal(toks('constant')[0].type, 'ident');
  }
  {
    const t = toks('= { } [ ] ,');
    assert.deepEqual(t.slice(0, -1).map((x) => [x.type, x.value]), [
      ['punct', '='], ['punct', '{'], ['punct', '}'], ['punct', '['], ['punct', ']'], ['punct', ','],
    ]);
  }
});

test('lexer: ba loại chú thích không sinh token và vị trí đúng sau chú thích khối nhiều dòng · lexer: chú thích khối không lồng nhau', () => {
  {
    const t = toks('# c1\n// c2\n/* c3\n  c4 */ x /**/ = // hết\n1');
    assert.deepEqual(t.map((x) => [x.type, x.line, x.column]), [
      ['ident', 4, 9], ['punct', 4, 16], ['number', 5, 1], ['eof', 5, 2],
    ]);
  }
  {
    assert.deepEqual(lexErr('/* a /* b */ c */'), ['LEX_UNEXPECTED_CHAR', 1, 16]);
  }
});

test('lexer: CRLF tính một lần xuống dòng, \\r đơn lẻ cũng xuống dòng · lexer: BOM đầu văn bản bị bỏ và không tính vào cột', () => {
  {
    const a = toks('a=1\r\nb=2');
    assert.deepEqual([a[3].line, a[3].column], [2, 1]);
    const b = toks('a=1\rb=2\n\r\nc=3');
    const lc = b.filter((x) => x.type === 'ident').map((x) => [x.line, x.column]);
    assert.deepEqual(lc, [[1, 1], [2, 1], [4, 1]]);
  }
  {
    const t = toks('﻿a = 1');
    assert.deepEqual([t[0].line, t[0].column], [1, 1]);
    assert.deepEqual(parse('﻿a = 1').ast.body[0].column, 1);
  }
});

test('lexer: số hợp lệ · lexer: -0 cho giá trị 0 (không phải -0)', () => {
  {
    const cases = [['0', 0], ['12', 12], ['-7', -7], ['1.5', 1.5], ['-1.5e2', -150], ['1E+3', 1000], ['0.5e-1', 0.05], ['10', 10], ['0e0', 0]];
    for (const [s, v] of cases) assert.equal(toks(s)[0].value, v, s);
  }
  {
    assert.ok(Object.is(toks('-0')[0].value, 0));
    assert.ok(Object.is(toks('-0.0')[0].value, 0));
  }
});

test('lexer: số sai → LEX_BAD_NUMBER tại ký tự đầu · lexer: .5 và +1 là ký tự lạ · lexer: ký tự lạ ngoài chuỗi', () => {
  {
    for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '1.2.3', '-a', '00', '1e+', '-01', '1_0']) {
      assert.deepEqual(lexErr(`x = ${s}`), ['LEX_BAD_NUMBER', 1, 5], s);
    }
    assert.deepEqual(lexErr('[1,\n  1-2]'), ['LEX_BAD_NUMBER', 2, 3]);
  }
  {
    assert.deepEqual(lexErr('x = .5'), ['LEX_UNEXPECTED_CHAR', 1, 5]);
    assert.deepEqual(lexErr('x = +1'), ['LEX_UNEXPECTED_CHAR', 1, 5]);
  }
  {
    assert.deepEqual(lexErr('a = 1;'), ['LEX_UNEXPECTED_CHAR', 1, 6]);
    assert.deepEqual(lexErr('a = /'), ['LEX_UNEXPECTED_CHAR', 1, 5]);
    assert.deepEqual(lexErr('a\n  é = 1'), ['LEX_UNEXPECTED_CHAR', 2, 3]);
    assert.deepEqual(lexErr("a = 'x'"), ['LEX_UNEXPECTED_CHAR', 1, 5]);
    assert.deepEqual(lexErr('a : 1'), ['LEX_UNEXPECTED_CHAR', 1, 3]);
  }
});

test('lexer: chuỗi và các escape hợp lệ · lexer: chuỗi rỗng có parts rỗng · lexer: ký tự $ không theo sau { là ký tự thường; \\$ chặn nội suy', () => {
  {
    const t = toks('"a\\nb\\tc\\rd\\"e\\\\f\\/g\\$h\\u0041\\u00e9"')[0];
    assert.equal(t.type, 'string');
    assert.deepEqual(t.value, [{ type: 'Text', value: 'a\nb\tc\rd"e\\f/g$hAé' }]);
  }
  {
    assert.deepEqual(toks('""')[0].value, []);
  }
  {
    assert.deepEqual(toks('"giá $5 và $"')[0].value, [{ type: 'Text', value: 'giá $5 và $' }]);
    assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
    assert.deepEqual(toks('"$$"')[0].value, [{ type: 'Text', value: '$$' }]);
  }
});

test('lexer: nội suy tạo Ref có vị trí tại ký tự $ · lexer: các Ref liền nhau, không có Text rỗng; Text liền kề được gộp', () => {
  {
    const t = toks('x = "a${b.c}d${@k.1}"')[2];
    assert.deepEqual(t.value, [
      { type: 'Text', value: 'a' },
      { type: 'Ref', path: ['b', 'c'], const: false, line: 1, column: 7 },
      { type: 'Text', value: 'd' },
      { type: 'Ref', path: ['k', '1'], const: true, line: 1, column: 14 },
    ]);
  }
  {
    const v = toks('"${a}${b}\\n\\tx"')[0].value;
    assert.deepEqual(v.map((p) => p.type), ['Ref', 'Ref', 'Text']);
    assert.equal(v[2].value, '\n\tx');
    assert.deepEqual(Object.keys(v[2]), ['type', 'value']);
  }
});

test('lexer: nội suy hợp lệ — dạng đường dẫn', () => {
  for (const [body, path, c] of [['a', ['a'], false], ['a-b.c_d', ['a-b', 'c_d'], false], ['a.0', ['a', '0'], false], ['a.10.b', ['a', '10', 'b'], false], ['@c', ['c'], true], ['@c.0.x', ['c', '0', 'x'], true], ['_1', ['_1'], false]]) {
    const r = toks(`"\${${body}}"`)[0].value[0];
    assert.deepEqual([r.path, r.const], [path, c], body);
  }
});

test('lexer: nội suy sai dạng → LEX_BAD_INTERPOLATION tại ký tự $', () => {
  for (const body of ['', ' ', 'a b', '1a', 'a.', '.a', '@', '@1', 'a..b', 'a.01', 'a.-1', '@@a', 'a b.c', 'é', 'a.b c', '0']) {
    assert.deepEqual(lexErr(`x = "ab\${${body}}"`), ['LEX_BAD_INTERPOLATION', 1, 8], JSON.stringify(body));
  }
});

test('lexer: nội suy không đóng · lexer: chuỗi chưa đóng báo tại dấu nháy mở', () => {
  {
    assert.deepEqual(lexErr('x = "${a'), ['LEX_BAD_INTERPOLATION', 1, 6]);
    assert.deepEqual(lexErr('x = "${a" '), ['LEX_BAD_INTERPOLATION', 1, 6]);
    assert.deepEqual(lexErr('x = "${a\n"'), ['LEX_BAD_INTERPOLATION', 1, 6]);
    assert.deepEqual(lexErr('x = "${'), ['LEX_BAD_INTERPOLATION', 1, 6]);
  }
  {
    assert.deepEqual(lexErr('x = "abc'), ['LEX_UNTERMINATED_STRING', 1, 5]);
    assert.deepEqual(lexErr('x = "abc\ny = 1'), ['LEX_UNTERMINATED_STRING', 1, 5]);
    assert.deepEqual(lexErr('x = "abc\r\ny = 1'), ['LEX_UNTERMINATED_STRING', 1, 5]);
    assert.deepEqual(lexErr('\n\n  "'), ['LEX_UNTERMINATED_STRING', 3, 3]);
  }
});

test('lexer: escape sai → LEX_BAD_ESCAPE tại dấu \\ · lexer: chú thích khối chưa đóng', () => {
  {
    assert.deepEqual(lexErr('x = "ab\\q"'), ['LEX_BAD_ESCAPE', 1, 8]);
    assert.deepEqual(lexErr('x = "\\u12G4"'), ['LEX_BAD_ESCAPE', 1, 6]);
    assert.deepEqual(lexErr('x = "\\u12"'), ['LEX_BAD_ESCAPE', 1, 6]);
    assert.deepEqual(lexErr('x = "a\\\nb"'), ['LEX_BAD_ESCAPE', 1, 7]);
    assert.deepEqual(lexErr('x = "\\U0041"'), ['LEX_BAD_ESCAPE', 1, 6]);
    assert.deepEqual(lexErr('x = "\\\'"'), ['LEX_BAD_ESCAPE', 1, 6]);
  }
  {
    assert.deepEqual(lexErr('a = 1\n  /* mở mãi'), ['LEX_UNTERMINATED_COMMENT', 2, 3]);
    assert.deepEqual(lexErr('/*/'), ['LEX_UNTERMINATED_COMMENT', 1, 1]);
  }
});

test('lexer: dừng ở lỗi đầu tiên theo thứ tự đọc', () => {
  assert.deepEqual(lexErr('x = "a\\q ${"'), ['LEX_BAD_ESCAPE', 1, 7]);
  assert.deepEqual(lexErr('x = "${a b} \\q"'), ['LEX_BAD_INTERPOLATION', 1, 6]);
  assert.deepEqual(lexErr('x = 01 "'), ['LEX_BAD_NUMBER', 1, 5]);
  assert.deepEqual(lexErr('; 01'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.deepEqual(lexErr('"abc\n/* x'), ['LEX_UNTERMINATED_STRING', 1, 1]);
});

test('lexer: cột đếm theo đơn vị UTF-16 · lexer: không bao giờ ném với đầu vào lạ', () => {
  {
    assert.deepEqual(lexErr('a = "é😀" @'), ['LEX_UNEXPECTED_CHAR', 1, 11]);
    const t = toks('a = "😀"\nb = 1');
    assert.deepEqual([t[3].line, t[3].column], [2, 1]);
  }
  {
    for (const s of ['', '\0', '"', '\\', '${', '"${', '/*', '-', '﻿', '﻿﻿', '"\\u', '\r', '[[[[', '}}}', '😀', '"\ud800"']) {
      assert.doesNotThrow(() => tokenize(s), JSON.stringify(s));
      assert.equal(typeof tokenize(s).ok, 'boolean');
    }
  }
});

test('parse: AST gán số đúng hình dạng cam kết · parse: File luôn ở 1:1; tệp rỗng hoặc chỉ chú thích', () => {
  {
    assert.deepEqual(ast('a = 1'), {
      type: 'File', line: 1, column: 1,
      body: [{ type: 'Assign', key: 'a', value: { type: 'Number', value: 1, line: 1, column: 5 }, line: 1, column: 1 }],
    });
  }
  {
    const a = ast('\n\n   a = 1');
    assert.deepEqual([a.type, a.line, a.column, a.body[0].line, a.body[0].column], ['File', 1, 1, 3, 4]);
    assert.deepEqual(ast('').body, []);
    assert.deepEqual(ast('# chỉ chú thích\n/* x */').body, []);
  }
});

test('parse: khối lồng nhau và vị trí', () => {
  const a = ast('a {\n  b {\n    c = true\n  }\n  d {}\n}');
  const A = a.body[0];
  assert.deepEqual([A.type, A.key, A.line, A.column], ['Block', 'a', 1, 1]);
  const [B, D] = A.body;
  assert.deepEqual([B.type, B.key, B.line, B.column], ['Block', 'b', 2, 3]);
  assert.deepEqual([D.type, D.key, D.body], ['Block', 'd', []]);
  assert.deepEqual(B.body[0], { type: 'Assign', key: 'c', value: { type: 'Bool', value: true, line: 3, column: 9 }, line: 3, column: 5 });
});

test('parse: nhiều câu lệnh cùng dòng, không cần dấu phân cách · parse: bool và null, nút Null không có trường thừa', () => {
  {
    const a = ast('a { b = 1 c = 2 } d = 3 e { }');
    assert.deepEqual(a.body.map((s) => s.key), ['a', 'd', 'e']);
    assert.deepEqual(a.body[0].body.map((s) => s.key), ['b', 'c']);
  }
  {
    const a = ast('x = false\ny = null');
    assert.deepEqual(a.body[0].value, { type: 'Bool', value: false, line: 1, column: 5 });
    assert.deepEqual(a.body[1].value, { type: 'Null', line: 2, column: 5 });
  }
});

test('parse: mảng lồng, dấu phẩy cuối, rỗng', () => {
  const v = ast('a = [1, "x", [true, [null]], [],]').body[0].value;
  assert.equal(v.type, 'Array');
  assert.deepEqual([v.line, v.column], [1, 5]);
  assert.deepEqual(v.items.map((i) => i.type), ['Number', 'String', 'Array', 'Array']);
  assert.deepEqual(v.items[2].items.map((i) => i.type), ['Bool', 'Array']);
  assert.deepEqual(v.items[3], { type: 'Array', items: [], line: 1, column: 30 });
  assert.equal(ast('a = []').body[0].value.items.length, 0);
  assert.equal(ast('a = [1,]').body[0].value.items.length, 1);
  assert.equal(ast('a = [\n 1\n ,\n 2 ]').body[0].value.items[1].line, 4);
});

test('parse: mảng sai', () => {
  assert.deepEqual(parseErr('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(parseErr('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(parseErr('a = [1 2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(parseErr('a = [1'), ['PARSE_UNEXPECTED_EOF', 1, 7]);
  assert.deepEqual(parseErr('a = [1,'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(parseErr('a = [{}]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(parseErr('a = [x]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
});

test('parse: chuỗi có parts, vị trí String là dấu nháy mở', () => {
  const s = ast('k = "id-${x.y}!"').body[0].value;
  assert.deepEqual([s.type, s.line, s.column], ['String', 1, 5]);
  assert.deepEqual(s.parts, [
    { type: 'Text', value: 'id-' },
    { type: 'Ref', path: ['x', 'y'], const: false, line: 1, column: 9 },
    { type: 'Text', value: '!' },
  ]);
});

test('parse: include, đường dẫn rỗng và vị trí · parse: include lỗi', () => {
  {
    const a = ast('x = 1\n  include "a/b.cfg"\ninclude ""\nblk { include "z" }');
    assert.deepEqual(a.body[1], { type: 'Include', path: 'a/b.cfg', line: 2, column: 3 });
    assert.equal(a.body[2].path, '');
    assert.deepEqual(a.body[3].body[0], { type: 'Include', path: 'z', line: 4, column: 7 });
    assert.equal(ast('include "a\\u0062\\/c"').body[0].path, 'ab/c');
  }
  {
    assert.deepEqual(parseErr('include "a${b}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
    assert.deepEqual(parseErr('x = 1\ninclude "${b}"'), ['PARSE_BAD_INCLUDE', 2, 9]);
    assert.deepEqual(parseErr('include 5'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
    assert.deepEqual(parseErr('include a'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
    assert.deepEqual(parseErr('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  }
});

test('parse: const ở cấp cao nhất · parse: const trong khối → PARSE_CONST_NOT_TOP tại từ khóa const', () => {
  {
    const c = ast('  const region = "hn"').body[0];
    assert.deepEqual([c.type, c.name, c.line, c.column], ['Const', 'region', 1, 3]);
    assert.deepEqual(c.value, { type: 'String', parts: [{ type: 'Text', value: 'hn' }], line: 1, column: 18 });
    assert.equal(ast('const l = [1,2]').body[0].value.type, 'Array');
  }
  {
    assert.deepEqual(parseErr('a {\n  const x = 1\n}'), ['PARSE_CONST_NOT_TOP', 2, 3]);
    assert.deepEqual(parseErr('a { b { const x = 1 } }'), ['PARSE_CONST_NOT_TOP', 1, 9]);
    assert.deepEqual(parseErr('a { const'), ['PARSE_CONST_NOT_TOP', 1, 5]);
  }
});

test('parse: mã lỗi cú pháp và vị trí', () => {
  const cases = [
    ['a', 'PARSE_UNEXPECTED_EOF', 1, 2],
    ['a =', 'PARSE_UNEXPECTED_EOF', 1, 4],
    ['a = ', 'PARSE_UNEXPECTED_EOF', 1, 5],
    ['a {', 'PARSE_UNEXPECTED_EOF', 1, 4],
    ['a { b = 1', 'PARSE_UNEXPECTED_EOF', 1, 10],
    ['a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3],
    ['a = 1 }', 'PARSE_UNEXPECTED_TOKEN', 1, 7],
    ['}', 'PARSE_UNEXPECTED_TOKEN', 1, 1],
    ['a {} }', 'PARSE_UNEXPECTED_TOKEN', 1, 6],
    ['include = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 9],
    ['true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1],
    ['a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5],
    ['a = {}', 'PARSE_UNEXPECTED_TOKEN', 1, 5],
    ['a = = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 5],
    ['= 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1],
    ['1 = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1],
    ['"a" = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1],
    ['const = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 7],
    ['const a 1', 'PARSE_UNEXPECTED_TOKEN', 1, 9],
    ['const a', 'PARSE_UNEXPECTED_EOF', 1, 8],
    ['a = 1,', 'PARSE_UNEXPECTED_TOKEN', 1, 6],
    ['a {\n  b = \n}', 'PARSE_UNEXPECTED_TOKEN', 3, 1],
  ];
  for (const [src, code, line, col] of cases) assert.deepEqual(parseErr(src), [code, line, col], JSON.stringify(src));
});

test('parse: lỗi lexer được báo trước lỗi cú pháp xuất hiện sớm hơn · parse: lỗi cú pháp đầu tiên theo thứ tự đọc; lỗi không có trường file', () => {
  {
    assert.deepEqual(parseErr('a = = 1\nb = "x'), ['LEX_UNTERMINATED_STRING', 2, 5]);
    assert.deepEqual(parseErr('a b c\n@'), ['LEX_UNEXPECTED_CHAR', 2, 1]);
  }
  {
    assert.deepEqual(parseErr('a = b\nc = d'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
    const r = parse('a = ');
    assert.equal('file' in r.error, false);
    assert.equal(typeof r.error.message, 'string');
  }
});

test('parse: không ném với đầu vào lạ; khối lồng sâu', () => {
  for (const s of ['', '{', '}', '[', 'a = [[[[', 'include', 'const', '"', '{{{{}}}}', 'a {'.repeat(50)]) {
    assert.doesNotThrow(() => parse(s), JSON.stringify(s));
  }
  const depth = 200;
  let n = parse('a {'.repeat(depth) + ' x = 1 ' + '}'.repeat(depth)).ast.body[0];
  let d = 1;
  while (n.body[0].type === 'Block') { n = n.body[0]; d++; }
  assert.equal(d, depth);
});

test('parseProject: tệp một mình, program có entry và files', () => {
  const r = parseProject({ main: 'a = 1' }, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main']);
  assert.deepEqual(r.program.files.main, parse('a = 1').ast);
});

test('parseProject: khóa files theo thứ tự tiền thứ tự (kể cả include trong khối)', () => {
  const files = {
    z: '',
    a: 'x = 1',
    c: 'q = 1',
    b: 'include "c"',
    main: 'blk { include "b" }\ninclude "a"\ninclude "b"',
    unused: 'zzz',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'c', 'a']);
});

test('parseProject: tệp không tới được không bị phân tích; include thiếu bị bỏ qua', () => {
  const r = parseProject({ main: 'include "nope"\na = 1', bad: 'a = = =' }, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main']);
});

test('parseProject: entry không có trong files', () => {
  const r = parseProject({ a: '' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_ENTRY_NOT_FOUND');
  assert.deepEqual([r.error.file, r.error.line, r.error.column], ['main', 1, 1]);
});

test('parseProject: lỗi mang file và vị trí (cả lỗi lexer)', () => {
  const r = parseProject({ main: 'a = 1\ninclude "sub"', sub: 'x = 1\n  y = ' }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual([r.error.code, r.error.file, r.error.line, r.error.column], ['PARSE_UNEXPECTED_EOF', 'sub', 2, 7]);
  const l = parseProject({ main: 'include "s"', s: 'a = "x' }, 'main');
  assert.deepEqual([l.error.code, l.error.file, l.error.line, l.error.column], ['LEX_UNTERMINATED_STRING', 's', 1, 5]);
});

test('parseProject: lỗi của tệp gặp đầu tiên theo tiền thứ tự', () => {
  const files = { main: 'include "a"\ninclude "b"', a: 'include "c"', b: '= 1', c: '} ' };
  const r = parseProject(files, 'main');
  assert.equal(r.error.file, 'c');
  assert.equal(r.error.code, 'PARSE_UNEXPECTED_TOKEN');
  const r2 = parseProject({ main: 'a = = 1\ninclude "x"', x: '}' }, 'main');
  assert.equal(r2.error.file, 'main');
});

test('parseProject: mỗi tệp phân tích một lần; vòng include không lặp vô hạn; không đổi files', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"\ninclude "b"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
  const self = parseProject({ a: 'include "a"' }, 'a');
  assert.deepEqual(Object.keys(self.program.files), ['a']);
  const files = { main: 'include "a"', a: 'x = 1' };
  const copy = structuredClone(files);
  parseProject(files, 'main');
  assert.deepEqual(files, copy);
});
