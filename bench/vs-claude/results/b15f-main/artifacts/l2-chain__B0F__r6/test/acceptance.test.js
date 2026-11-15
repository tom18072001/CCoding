// Nghiệm thu đầu cuối (S5): chỉ import từ src/index.js, đối chiếu SPEC.md mục 2–9.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import {
  tokenize, parse, parseProject, check, evaluate, compile,
  diff, applyDiff, formatText, formatJson, summarize,
  escapePointer, unescapePointer, parsePointer, formatPointer,
} from '../src/index.js';

const pos = (e) => [e.code, e.line, e.column];
const posF = (e) => [e.code, e.file, e.line, e.column];
const prog = (files, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.program;
};
const cfg = (files, entry = 'main', schema) => {
  const r = compile(typeof files === 'string' ? { main: files } : files, entry, schema);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.config;
};
const errs = (files, schema) => check(prog(typeof files === 'string' ? { main: files } : files), schema);

// ---------------------------------------------------------------- API công khai (D5, mục 8)
test('API: đúng tập tên công khai, không lộ merge.js hay hàm phụ của diff', () => {
  assert.deepEqual(Object.keys(api).sort(), [
    'applyDiff', 'check', 'compile', 'diff', 'escapePointer', 'evaluate', 'formatJson', 'formatPointer',
    'formatText', 'parse', 'parsePointer', 'parseProject', 'summarize', 'tokenize', 'unescapePointer',
  ]);
  for (const k of ['buildModel', 'resolveRef', 'evaluateTarget', 'constsOf', 'evaluateString', 'clone', 'walk']) {
    assert.equal(k in api, false);
  }
  assert.equal(typeof evaluate, 'function');
});

// ---------------------------------------------------------------- Mục 2: hình dạng AST
test('AST mục 2: deepEqual, không trường thừa, vị trí đúng', () => {
  const src = 'const r = "a${@q}b"\nx = [1, [null, true]]\nb { y = "" }\ninclude "f"';
  const r = parse(src);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'r', line: 1, column: 1,
        value: { type: 'String', line: 1, column: 11, parts: [
          { type: 'Text', value: 'a' },
          { type: 'Ref', path: ['q'], const: true, line: 1, column: 13 },
          { type: 'Text', value: 'b' }] } },
      { type: 'Assign', key: 'x', line: 2, column: 1,
        value: { type: 'Array', line: 2, column: 5, items: [
          { type: 'Number', value: 1, line: 2, column: 6 },
          { type: 'Array', line: 2, column: 9, items: [
            { type: 'Null', line: 2, column: 10 },
            { type: 'Bool', value: true, line: 2, column: 16 }] }] } },
      { type: 'Block', key: 'b', line: 3, column: 1, body: [
        { type: 'Assign', key: 'y', line: 3, column: 5,
          value: { type: 'String', parts: [], line: 3, column: 9 } }] },
      { type: 'Include', path: 'f', line: 4, column: 1 },
    ],
  });
});

test('AST: File luôn 1:1 kể cả khi tệp rỗng hoặc bắt đầu muộn; Ref path và const', () => {
  assert.deepEqual(parse('').ast, { type: 'File', body: [], line: 1, column: 1 });
  assert.deepEqual(parse('\n\n  # c\n').ast, { type: 'File', body: [], line: 1, column: 1 });
  const s = parse('a = "${a.b.0}${@l.1}"').ast.body[0].value;
  assert.deepEqual(s.parts, [
    { type: 'Ref', path: ['a', 'b', '0'], const: false, line: 1, column: 6 },
    { type: 'Ref', path: ['l', '1'], const: true, line: 1, column: 14 },
  ]);
});

test('AST: Text không kề nhau, không rỗng; \\$ là ký tự thường; $ lẻ là ký tự thường', () => {
  const parts = (s) => parse(`a = ${s}`).ast.body[0].value.parts;
  assert.deepEqual(parts('"x\\ny\\u0041"'), [{ type: 'Text', value: 'x\nyA' }]);
  assert.deepEqual(parts('"\\${a}"'), [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(parts('"$ $x"'), [{ type: 'Text', value: '$ $x' }]);
  assert.deepEqual(parts('"${a}${b}"').map((p) => p.type), ['Ref', 'Ref']);
  assert.deepEqual(parts('"\\/\\"\\\\\\t\\r"'), [{ type: 'Text', value: '/"\\\t\r' }]);
});

test('AST: include path là nối Text, "" được phép; include nhận chuỗi có \\$', () => {
  assert.equal(parse('include ""').ast.body[0].path, '');
  assert.equal(parse('include "a\\/b\\${x}"').ast.body[0].path, 'a/b${x}');
});

// ---------------------------------------------------------------- Mục 3: lexer
test('lexer: eof sau BOM, \\r\\n, \\r, \\n (D8)', () => {
  const eof = (s) => { const t = tokenize(s).tokens; return t[t.length - 1]; };
  const E = (line, column) => ({ type: 'eof', value: null, line, column });
  assert.deepEqual(eof(''), E(1, 1));
  assert.deepEqual(eof('\uFEFF'), E(1, 1));
  assert.deepEqual(eof('\uFEFFa=1'), E(1, 4));
  assert.deepEqual(eof('a=1\r\n'), E(2, 1));
  assert.deepEqual(eof('a=1\r'), E(2, 1));
  assert.deepEqual(eof('a=1\n'), E(2, 1));
  assert.deepEqual(eof('a=1\r\n\r\n'), E(3, 1));
  assert.deepEqual(eof('a=1\n\r'), E(3, 1));
  assert.deepEqual(eof('a=1  '), E(1, 6));
  assert.deepEqual(eof('a=1 // x'), E(1, 9));
  assert.deepEqual(eof('/* a\r\n b */'), E(2, 6));
});

test('lexer: vị trí token qua BOM, CRLF, CR, tab, ký tự astral', () => {
  const at = (s, i) => { const t = tokenize(s).tokens[i]; return [t.line, t.column]; };
  assert.deepEqual(at('\uFEFFa', 0), [1, 1]);
  assert.deepEqual(at('a=1\r\nb', 3), [2, 1]);
  assert.deepEqual(at('a=1\rb', 3), [2, 1]);
  assert.deepEqual(at('\ta', 0), [1, 2]);
  assert.deepEqual(at('"😀" b', 1), [1, 6]);
  assert.deepEqual(at('/* x\n y */ b', 0), [2, 7]);
  assert.deepEqual(pos(tokenize('a=\uFEFF1').error), ['LEX_UNEXPECTED_CHAR', 1, 3]);
});

test('lexer: hình dạng token và từ khóa', () => {
  assert.deepEqual(tokenize('a = "x"').tokens, [
    { type: 'ident', value: 'a', line: 1, column: 1 },
    { type: 'punct', value: '=', line: 1, column: 3 },
    { type: 'string', value: [{ type: 'Text', value: 'x' }], line: 1, column: 5 },
    { type: 'eof', value: null, line: 1, column: 8 },
  ]);
  const t = tokenize('include const true false null includes true1 a-b _x').tokens.map((x) => x.type);
  assert.deepEqual(t, ['keyword', 'keyword', 'keyword', 'keyword', 'keyword', 'ident', 'ident', 'ident', 'ident', 'eof']);
});

test('lexer: số hợp lệ; -0 thành 0', () => {
  const v = (s) => tokenize(s).tokens[0].value;
  assert.equal(v('0'), 0);
  assert.ok(Object.is(v('-0'), 0));
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.equal(v('0.5'), 0.5);
  assert.equal(tokenize('[1,2]').tokens.length, 6);
});

test('lexer: bảng lỗi (mã + vị trí)', () => {
  const T = [
    ['01', 'LEX_BAD_NUMBER', 1, 1], ['1.', 'LEX_BAD_NUMBER', 1, 1], ['-', 'LEX_BAD_NUMBER', 1, 1],
    ['1e', 'LEX_BAD_NUMBER', 1, 1], ['12abc', 'LEX_BAD_NUMBER', 1, 1], ['1-2', 'LEX_BAD_NUMBER', 1, 1],
    ['1e999', 'LEX_BAD_NUMBER', 1, 1], ['a = 1.5.2', 'LEX_BAD_NUMBER', 1, 5], ['a = -x', 'LEX_BAD_NUMBER', 1, 5],
    ['a = .5', 'LEX_UNEXPECTED_CHAR', 1, 5], ['+1', 'LEX_UNEXPECTED_CHAR', 1, 1],
    ['/', 'LEX_UNEXPECTED_CHAR', 1, 1], ['  é', 'LEX_UNEXPECTED_CHAR', 1, 3], ['a;', 'LEX_UNEXPECTED_CHAR', 1, 2],
    ['"abc', 'LEX_UNTERMINATED_STRING', 1, 1], ['x = "ab\ncd"', 'LEX_UNTERMINATED_STRING', 1, 5],
    ['\n\nx = "ab\r', 'LEX_UNTERMINATED_STRING', 3, 5],
    ['/* x\n y', 'LEX_UNTERMINATED_COMMENT', 1, 1], ['a=1\n  /* ', 'LEX_UNTERMINATED_COMMENT', 2, 3],
    ['/*/', 'LEX_UNTERMINATED_COMMENT', 1, 1],
    ['"\\q"', 'LEX_BAD_ESCAPE', 1, 2], ['"\\u12"', 'LEX_BAD_ESCAPE', 1, 2], ['"\\u12G4"', 'LEX_BAD_ESCAPE', 1, 2],
    ['"a\\\nb"', 'LEX_BAD_ESCAPE', 1, 3],
    ['"${}"', 'LEX_BAD_INTERPOLATION', 1, 2], ['"${a"', 'LEX_BAD_INTERPOLATION', 1, 2],
    ['"${a b}"', 'LEX_BAD_INTERPOLATION', 1, 2], ['"${1a}"', 'LEX_BAD_INTERPOLATION', 1, 2],
    ['"${a.01}"', 'LEX_BAD_INTERPOLATION', 1, 2], ['"${@}"', 'LEX_BAD_INTERPOLATION', 1, 2],
    ['"${a.}"', 'LEX_BAD_INTERPOLATION', 1, 2], ['"${@1}"', 'LEX_BAD_INTERPOLATION', 1, 2],
    ['"${ a}"', 'LEX_BAD_INTERPOLATION', 1, 2],
    ['"${a\n}"', 'LEX_BAD_INTERPOLATION', 1, 2], ['"${', 'LEX_BAD_INTERPOLATION', 1, 2],
  ];
  for (const [src, code, l, c] of T) {
    const r = tokenize(src);
    assert.equal(r.ok, false, src);
    assert.deepEqual(pos(r.error), [code, l, c], JSON.stringify(src));
    assert.equal(typeof r.error.message, 'string');
  }
});

test('lexer: dừng ở lỗi đầu tiên theo thứ tự đọc', () => {
  assert.equal(tokenize('"\\q${"').error.code, 'LEX_BAD_ESCAPE');
  assert.equal(tokenize('"${\\q"').error.code, 'LEX_BAD_INTERPOLATION');
  assert.deepEqual(pos(tokenize('"${a}${"').error), ['LEX_BAD_INTERPOLATION', 1, 6]);
  assert.equal(tokenize('"${a} \\u"').error.code, 'LEX_BAD_ESCAPE');
  assert.equal(tokenize('a = 01 /* ').error.code, 'LEX_BAD_NUMBER');
  assert.equal(tokenize('a = 1 /* ').error.code, 'LEX_UNTERMINATED_COMMENT');
});

test('lexer: không ném với đầu vào lạ; nội suy hợp lệ', () => {
  for (const s of ['', '\uFEFF', '"', '\\', '${', '\u0000', '"\\u', '/*', '-', '"${@a.b-c.0.d_e}"']) {
    assert.doesNotThrow(() => tokenize(s));
  }
  assert.equal(tokenize('"${@a.b-c.0.d_e}"').ok, true);
  assert.equal(tokenize('"${a.10}"').ok, true);
  assert.equal(tokenize('a=1 # x\n// y\n/* z\n */ b=2').tokens.length, 7);
});

// ---------------------------------------------------------------- Mục 4: parser
test('parse: bảng lỗi cú pháp (mã + vị trí)', () => {
  const T = [
    ['a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3], ['a =', 'PARSE_UNEXPECTED_EOF', 1, 4], ['a {', 'PARSE_UNEXPECTED_EOF', 1, 4],
    ['a', 'PARSE_UNEXPECTED_EOF', 1, 2], ['}', 'PARSE_UNEXPECTED_TOKEN', 1, 1], ['a { } }', 'PARSE_UNEXPECTED_TOKEN', 1, 7],
    ['const = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 7], ['const x', 'PARSE_UNEXPECTED_EOF', 1, 8],
    ['const x 1', 'PARSE_UNEXPECTED_TOKEN', 1, 9], ['include', 'PARSE_UNEXPECTED_EOF', 1, 8],
    ['include = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 9], ['include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9],
    ['include "a${b}"', 'PARSE_BAD_INCLUDE', 1, 9], ['a { const x = 1 }', 'PARSE_CONST_NOT_TOP', 1, 5],
    ['a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6], ['a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8],
    ['a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8], ['a = [1', 'PARSE_UNEXPECTED_EOF', 1, 7],
    ['a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5], ['null = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1],
    ['true { }', 'PARSE_UNEXPECTED_TOKEN', 1, 1], ['a = [b {]', 'PARSE_UNEXPECTED_TOKEN', 1, 6],
    ['a = {', 'PARSE_UNEXPECTED_TOKEN', 1, 5], ['a = = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 5],
    ['a = 1\n  b', 'PARSE_UNEXPECTED_EOF', 2, 4], ['a = 1,', 'PARSE_UNEXPECTED_TOKEN', 1, 6],
    ['a { const x = 1 }\nb = =', 'PARSE_CONST_NOT_TOP', 1, 5], ['a = =\nb { const x = 1 }', 'PARSE_UNEXPECTED_TOKEN', 1, 5],
    ['a = 1\r\nb = = 2', 'PARSE_UNEXPECTED_TOKEN', 2, 5],
    ['x = 1\ny = ["a",\n]\nz = [1 }', 'PARSE_UNEXPECTED_TOKEN', 4, 8],
  ];
  for (const [src, code, l, c] of T) {
    const r = parse(src);
    assert.equal(r.ok, false, src);
    assert.deepEqual(pos(r.error), [code, l, c], JSON.stringify(src));
  }
});

test('parse: lỗi lexer thắng lỗi cú pháp dù cú pháp sai trước', () => {
  const r = parse('a = =\nb = "\\q"');
  assert.deepEqual(pos(r.error), ['LEX_BAD_ESCAPE', 2, 6]);
  assert.deepEqual(pos(parse('}\n"abc').error), ['LEX_UNTERMINATED_STRING', 2, 1]);
  assert.deepEqual(pos(parse('a { const x = 1 }\n/*').error), ['LEX_UNTERMINATED_COMMENT', 2, 1]);
});

test('parse: văn bản hợp lệ biên', () => {
  for (const s of ['a = []', 'a = [1,]', 'a = [[],[1,[2,]],]', 'a {}', 'a { b { c = 1 } }', 'a{}b{}', 'include "x"\ninclude "y"',
    'a { include "x" }', 'const c = [1]\na = null', '\uFEFFa = 1', 'a = 1\r\nb = 2\rc = 3', 'a=1#x\nb=2//y\n/*z*/c=3']) {
    assert.equal(parse(s).ok, true, JSON.stringify(s));
  }
  assert.equal(parse('a=1\r\nb=2\rc=3').ast.body[2].line, 3);
});

test('parse: lỗi không ném, không có trường file', () => {
  const r = parse('a =');
  assert.deepEqual(Object.keys(r.error).sort(), ['code', 'column', 'line', 'message']);
  assert.deepEqual(Object.keys(parse('a = 1')), ['ok', 'ast']);
});

// ---------------------------------------------------------------- parseProject
test('parseProject: chỉ tệp tới được, khóa theo tiền thứ tự, include trong khối theo thứ tự tài liệu', () => {
  const files = {
    main: 'include "b"\nx { include "c" }\ninclude "d"\ninclude "missing"',
    z: 'junk junk',
    d: 'include "e"',
    c: 'include "e"',
    b: 'include "main"\ninclude "c"',
    e: 'v = 1',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'c', 'e', 'd']);
  assert.deepEqual(Object.keys(r), ['ok', 'program']);
});

test('parseProject: lỗi của tệp gặp đầu tiên; lỗi có file; tệp không tới được bị bỏ qua', () => {
  const files = { main: 'include "b"\ninclude "a"\n', a: 'x = =', b: 'y = =', zz: '= =' };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual(posF(r.error), ['PARSE_UNEXPECTED_TOKEN', 'b', 1, 5]);
  const l = parseProject({ main: 'include "a"', a: 'k = "\\q"' }, 'main');
  assert.deepEqual(posF(l.error), ['LEX_BAD_ESCAPE', 'a', 1, 6]);
  assert.deepEqual(posF(parseProject({ main: 'include "a"\n}', a: '=' }, 'main').error), ['PARSE_UNEXPECTED_TOKEN', 'main', 2, 1]);
  assert.equal(parseProject({ main: 'a = 1', zz: '= =' }, 'main').ok, true);
});

test('parseProject: entry không có', () => {
  const r = parseProject({ a: '' }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual(posF(r.error), ['PARSE_ENTRY_NOT_FOUND', 'main', 1, 1]);
});

// ---------------------------------------------------------------- Mục 5 pha A
test('pha A: SEM_DUPLICATE_KEY/CONST — mỗi lần lặp một lỗi; khối/tệp khác không trùng', () => {
  assert.deepEqual(errs('a = 1\na = 2\na {}\nb{}\nb = 1').map(pos), [
    ['SEM_DUPLICATE_KEY', 2, 1], ['SEM_DUPLICATE_KEY', 3, 1], ['SEM_DUPLICATE_KEY', 5, 1]]);
  assert.deepEqual(errs('const c = 1\nconst c = 2\nconst c = 3\nc = 1').map(pos), [
    ['SEM_DUPLICATE_CONST', 2, 1], ['SEM_DUPLICATE_CONST', 3, 1]]);
  assert.deepEqual(errs('a { x = 1\n x = 2 }').map(pos), [['SEM_DUPLICATE_KEY', 2, 2]]);
  assert.deepEqual(errs('a { x = 1 }\nb { x = 1 }\nx = 1'), []);
  assert.deepEqual(errs({ main: 'x = 1\ninclude "b"', b: 'x = 2' }), []);
  assert.deepEqual(errs({ main: 'x = 1\ninclude "b"\nx = 3', b: 'x = 2' }).map(pos), [['SEM_DUPLICATE_KEY', 3, 1]]);
  assert.deepEqual(errs('a { b = 1 }\na { b = 2 }').map(pos), [['SEM_DUPLICATE_KEY', 2, 1]]);
});

test('pha A: include không tìm thấy / vòng / hình thoi', () => {
  const nf = errs({ main: 'a { include "zz" }' });
  assert.deepEqual(nf.map(posF), [['SEM_INCLUDE_NOT_FOUND', 'main', 1, 5]]);
  assert.deepEqual(errs({ main: 'include "main"' }).map(posF), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  assert.deepEqual(errs({ main: 'include "b"', b: 'x=1\ninclude "main"' }).map(posF), [['SEM_INCLUDE_CYCLE', 'b', 2, 1]]);
  assert.deepEqual(errs({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'v = 1' }), []);
  assert.deepEqual(errs({ main: 'include ""' }).map(posF), [['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1]]);
});

test('pha A: lỗi gom theo tệp theo thứ tự thăm lần đầu (không theo vị trí giữa các tệp)', () => {
  const files = { main: 'include "b"\na = 1\na = 2', b: 'k = 1\nk = 2\ninclude "zz"' };
  assert.deepEqual(errs(files).map(posF), [
    ['SEM_DUPLICATE_KEY', 'main', 3, 1], ['SEM_DUPLICATE_KEY', 'b', 2, 1], ['SEM_INCLUDE_NOT_FOUND', 'b', 3, 1]]);
  const f2 = { main: 'x { include "c" }\ninclude "b"', b: 'q = 1\nq = 2', c: 'r = 1\nr = 2' };
  assert.deepEqual(errs(f2).map((e) => e.file), ['main', 'c', 'b'].filter((f) => f !== 'main'));
});

test('pha A thắng pha B: có lỗi A thì không có lỗi B', () => {
  assert.deepEqual(errs('a = 1\na = 2\nb = "${nope}"').map((e) => e.code), ['SEM_DUPLICATE_KEY']);
});

// ---------------------------------------------------------------- Mục 5 pha B
test('pha B: ưu tiên mã lỗi (D7) CONST_CONFIG_REF > UNDEFINED > CYCLE > BAD_INTERPOLATION', () => {
  assert.deepEqual(errs('const c = "${nope}"').map(pos), [['SEM_CONST_CONFIG_REF', 1, 12]]);
  assert.deepEqual(errs('x = 1\nconst c = "${x}"').map(pos), [['SEM_CONST_CONFIG_REF', 2, 12]]);
  assert.deepEqual(errs('a = "${a.b}"').map(pos), [['SEM_UNDEFINED_REF', 1, 6]]);
  assert.deepEqual(errs('a = "x${b}"\nb = ["${a}"]').map(pos), [['SEM_REF_CYCLE', 1, 7], ['SEM_REF_CYCLE', 2, 7]]);
  assert.deepEqual(errs('l = [1]\ns = "v=${l}"').map(pos), [['SEM_BAD_INTERPOLATION', 2, 8]]);
});

test('pha B: BAD_INTERPOLATION — đối tượng, hai Ref, chuỗi thuần tham chiếu dẫn tới mảng; vô hướng ok', () => {
  assert.deepEqual(errs('o { a = 1 }\ns = "${o}x"').map(pos), [['SEM_BAD_INTERPOLATION', 2, 6]]);
  assert.deepEqual(errs('l = [1]\ns = "${l}${l}"').map(pos), [['SEM_BAD_INTERPOLATION', 2, 6], ['SEM_BAD_INTERPOLATION', 2, 10]]);
  assert.deepEqual(errs('l = [1]\nm = "${l}"\ns = "x${m}"').map(pos), [['SEM_BAD_INTERPOLATION', 3, 7]]);
  assert.deepEqual(errs('l = [1]\nm = "${l}"'), []);
  assert.deepEqual(errs('n = null\nb = true\nf = 1.5\ns = "a${n}${b}${f}${s2}"\ns2 = "z"'), []);
});

test('pha B: tham chiếu không phân giải được', () => {
  const bad = (src) => assert.deepEqual(errs(src).map((e) => e.code), ['SEM_UNDEFINED_REF'], src);
  bad('x = "${y}"');
  bad('l = [1]\nx = "${l.1}"');
  bad('l = [1]\nx = "${l.length}"');
  bad('a = 1\nx = "${a.b}"');
  bad('x = "${constructor}"');
  bad('x = "${toString}"');
  bad('a { b = 1 }\nx = "${a.B}"');
  bad('x = "${@c}"');
  bad('const c = 1\nx = "${@c.0}"');
  bad('const c = [1]\nx = "${@c.1}"');
  bad('const c = [1]\nx = "${@c.k}"');
  assert.deepEqual(errs({ main: 'include "b"\nx = "${@c}"', b: 'const c = 1' }).map(posF), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  assert.deepEqual(errs({ main: 'include "b"', b: 'const c = 1\nx = "${@c}"' }), []);
});

test('pha B: hằng khai báo muộn vẫn dùng được; hằng chỉ mục; hằng tham chiếu hằng', () => {
  assert.deepEqual(cfg('x = "${@c.1}"\nconst c = [1, 2]'), { x: 2 });
  assert.deepEqual(cfg('const a = "${@b}!"\nconst b = "hi"\nx = "${@a}"'), { x: 'hi!' });
  assert.deepEqual(errs('const a = "${@a}"').map(pos), [['SEM_REF_CYCLE', 1, 12]]);
  assert.deepEqual(errs('const a = "${@b}"\nconst b = "${@a}"').map((e) => e.line), [1, 2]);
});

test('pha B: vòng tham chiếu — tự thân, đôi, tổ tiên; chuỗi ngoài vòng không bị báo', () => {
  assert.deepEqual(errs('a = "${a}"').map(pos), [['SEM_REF_CYCLE', 1, 6]]);
  assert.deepEqual(errs('a = "${b}"\nb = "${a}"').map(pos), [['SEM_REF_CYCLE', 1, 6], ['SEM_REF_CYCLE', 2, 6]]);
  assert.deepEqual(errs('x { y = "${x}" }').map(pos), [['SEM_REF_CYCLE', 1, 10]]);
  assert.deepEqual(errs('a = "${b}"\nb = "${c}"\nc = "${b}"').map(pos), [['SEM_REF_CYCLE', 2, 6], ['SEM_REF_CYCLE', 3, 6]]);
  assert.deepEqual(errs('o { p = "${q}" }\nq = "${o}"').map(pos), [['SEM_REF_CYCLE', 1, 10], ['SEM_REF_CYCLE', 2, 6]]);
  assert.deepEqual(errs('a = ["${a}"]').map(pos), [['SEM_REF_CYCLE', 1, 7]]);
  assert.deepEqual(errs('a = "${b}"\nb = "${c}"\nc = 1'), []);
  assert.deepEqual(errs('a { x = 1 }\nb = "${a.x}"\nc = "${a}"'), []);
});

test('pha B: định nghĩa bị ghi đè — Ref vẫn bị xét; vòng chỉ tính định nghĩa thắng', () => {
  const files = { main: 'include "base"\na = 1', base: 'a = "${a}"' };
  assert.deepEqual(errs(files), []);
  assert.deepEqual(cfg(files), { a: 1 });
  const f2 = { main: 'include "base"\ns = "ok"', base: 's = "${nope}"' };
  assert.deepEqual(errs(f2).map(posF), [['SEM_UNDEFINED_REF', 'base', 1, 6]]);
  const f3 = { main: 'include "base"\nl = [1]', base: 's = "x"\nt = "a${s}"\nl = "x"' };
  assert.deepEqual(errs(f3), []);
  const f4 = { main: 'include "base"\ns = [1]', base: 's = "x"\nt = "a${s}"' };
  assert.deepEqual(errs(f4).map(posF), [['SEM_BAD_INTERPOLATION', 'base', 2, 7]]);
});

test('pha B: lỗi gom theo tệp (tiền thứ tự), trong tệp sắp theo vị trí Ref; mảng, const đều được xét', () => {
  const files = { main: 'include "b"\nz = ["${n1}", ["${n2}"]]\ny = "${n3}${n4}"', b: 'const c = "${n5}"\nx = "${n6}"' };
  assert.deepEqual(errs(files).map((e) => [e.file, e.line, e.column, e.code]), [
    ['main', 2, 7, 'SEM_UNDEFINED_REF'], ['main', 2, 17, 'SEM_UNDEFINED_REF'],
    ['main', 3, 6, 'SEM_UNDEFINED_REF'], ['main', 3, 11, 'SEM_UNDEFINED_REF'],
    ['b', 1, 12, 'SEM_CONST_CONFIG_REF'], ['b', 2, 6, 'SEM_UNDEFINED_REF']]);
});

test('pha B thắng pha C: có lỗi B thì không chạy schema', () => {
  assert.deepEqual(errs('a = "${nope}"', { fields: { a: { type: 'number' } } }).map((e) => e.code), ['SEM_UNDEFINED_REF']);
});

// ---------------------------------------------------------------- Mục 5 pha C
test('pha C: kiểu — quy tắc từng kiểu', () => {
  const t = (type, src) => errs(`v = ${src}`, { fields: { v: { type } } }).map((e) => e.code);
  assert.deepEqual(t('number', '1'), []);
  assert.deepEqual(t('number', '1.5'), []);
  assert.deepEqual(t('integer', '1'), []);
  assert.deepEqual(t('integer', '1.5'), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(t('integer', '1e2'), []);
  assert.deepEqual(t('string', '1'), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(t('null', 'null'), []);
  assert.deepEqual(t('null', '0'), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(t('boolean', 'false'), []);
  assert.deepEqual(t('array', 'null'), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(t('object', '[]'), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(t('array', '[]'), []);
  assert.deepEqual(t('object', 'null'), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(t('any', 'null'), []);
  assert.deepEqual(errs('v { }', { fields: { v: { type: 'array' } } }).map((e) => e.code), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(errs('v { }', { fields: { v: { type: 'object' } } }), []);
  assert.deepEqual(errs('v = 1', { type: 'object', fields: { v: {} } }), []);
});

test('pha C: vị trí — Assign là nút giá trị, phần tử mảng, đối tượng là Block khởi tạo, gốc là entry 1:1', () => {
  const S = (f) => ({ fields: f });
  assert.deepEqual(errs('\n  n = 5', S({ n: { type: 'string' } })).map(posF), [['SEM_TYPE_MISMATCH', 'main', 2, 7]]);
  assert.deepEqual(errs('l = [1, "x"]', S({ l: { items: { type: 'number' } } })).map(posF), [['SEM_TYPE_MISMATCH', 'main', 1, 9]]);
  assert.deepEqual(errs('l = [[1], [2, "x"]]', S({ l: { items: { items: { type: 'number' } } } })).map((e) => [e.line, e.column]), [[1, 15]]);
  assert.deepEqual(errs('a = 1', { type: 'string' }).map(posF), [['SEM_TYPE_MISMATCH', 'main', 1, 1]]);
  assert.deepEqual(errs('\n\na = 1', { fields: { z: { required: true } } }).map(posF), [['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
  assert.deepEqual(errs({ main: 'include "b"', b: 'a = 1' }, { fields: { z: { required: true } } }).map(posF), [['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
  const f = { main: 'include "a"\n\ns { b = 2 }', a: '\n s { a = 1 }' };
  const sc = S({ s: { fields: { z: { required: true } } } });
  assert.deepEqual(errs(f, sc).map(posF), [['SEM_MISSING_REQUIRED', 'a', 2, 2]]);
  const g = { main: 'include "a"\ninclude "b"\ninclude "c"', a: 's { a = 1 }', b: 's = 3', c: '\n\n   s { b = 2 }' };
  assert.deepEqual(errs(g, sc).map(posF), [['SEM_MISSING_REQUIRED', 'c', 3, 4]]);
});

test('pha C: giá trị đến từ "${x}" — vị trí là chuỗi, cho cả giá trị và mọi thứ bên trong', () => {
  const S = (f) => ({ fields: f });
  assert.deepEqual(errs('p = 5\nq = "${p}"', S({ q: { type: 'string' } })).map(posF), [['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
  const sc = S({ r: { type: 'object', fields: { a: { type: 'string' }, b: { required: true } } } });
  assert.deepEqual(errs('o { a = 1 }\nr = "${o}"', sc).map(posF), [
    ['SEM_MISSING_REQUIRED', 'main', 2, 5], ['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
  assert.deepEqual(errs('l = [1, "x"]\nr = "${l}"', S({ r: { items: { type: 'number' } } })).map(posF), [['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
  assert.deepEqual(errs('p = 5\nm = "${p}"\n  q = "${m}"', S({ q: { type: 'string' } })).map(posF), [['SEM_TYPE_MISMATCH', 'main', 3, 7]]);
  assert.deepEqual(errs('p = 5\nq = "a${p}"', S({ q: { type: 'number' } })).map(posF), [['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
  assert.deepEqual(errs('o { a = 1 }\nr = "${o}"', S({ o: {}, r: { closed: true, fields: {} } })).map(posF), [['SEM_UNKNOWN_KEY', 'main', 1, 5]]);
});

test('pha C: thứ tự — missing trước, rồi theo thứ tự khóa của cấu hình (không theo schema); closed; type chặn sâu', () => {
  const sc = { closed: true, fields: { z: { required: true }, y: { required: true }, b: { type: 'string' }, a: { type: 'string' } } };
  assert.deepEqual(errs('a = 1\nq = 1\nb = 2', sc).map((e) => [e.code, e.line, e.column]), [
    ['SEM_MISSING_REQUIRED', 1, 1], ['SEM_MISSING_REQUIRED', 1, 1],
    ['SEM_TYPE_MISMATCH', 1, 5], ['SEM_UNKNOWN_KEY', 2, 1], ['SEM_TYPE_MISMATCH', 3, 5]]);
  assert.deepEqual(errs('o { x = 1 }', { fields: { o: { type: 'array', fields: { x: { type: 'string' } } } } }).map((e) => e.code), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(errs('o { }', { fields: { o: { required: true } } }), []);
  assert.deepEqual(errs('o = null', { fields: { o: { required: true } } }), []);
  assert.deepEqual(errs('o { b { x = 1 } }', { fields: { o: { fields: { b: { closed: true, fields: {} } } } } }).map(pos), [['SEM_UNKNOWN_KEY', 1, 9]]);
});

test('pha C: enum — vô hướng, ===, bỏ qua mảng/đối tượng, chặn kiểm sâu', () => {
  const e = (src, en, extra = {}) => errs(`v = ${src}`, { fields: { v: { enum: en, ...extra } } }).map((x) => x.code);
  assert.deepEqual(e('"a"', ['a', 'b']), []);
  assert.deepEqual(e('"c"', ['a', 'b']), ['SEM_NOT_IN_ENUM']);
  assert.deepEqual(e('1', ['1']), ['SEM_NOT_IN_ENUM']);
  assert.deepEqual(e('null', [null]), []);
  assert.deepEqual(e('[1]', ['x']), []);
  assert.deepEqual(e('"c"', ['a'], { type: 'string' }), ['SEM_NOT_IN_ENUM']);
  assert.deepEqual(e('1', ['a'], { type: 'string' }), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(errs('p = "a"\nv = "${p}"', { fields: { v: { enum: ['b'] } } }).map(pos), [['SEM_NOT_IN_ENUM', 2, 5]]);
});

test('pha C: chỉ chạy khi có schema; schema rỗng không lỗi', () => {
  assert.deepEqual(errs('a = 1'), []);
  assert.deepEqual(errs('a = 1', {}), []);
  assert.deepEqual(errs('a = 1', undefined), []);
});

// ---------------------------------------------------------------- Mục 6: evaluate
test('evaluate: ví dụ mục 9 (nhánh đã sửa) và include/ghi đè', () => {
  const main = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }';
  assert.deepEqual(cfg(main), { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  const bad = parse('const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }');
  assert.deepEqual(pos(bad.error), ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
  const files = { main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' };
  const c = cfg(files);
  assert.deepEqual(c, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(c), ['server', 'mode']);
});

test('evaluate: thứ tự khóa — lần đầu xuất hiện, ghi đè/include không đổi chỗ', () => {
  const files = { main: 'x = 0\ninclude "base"\nc = 3\na = 9\nb { n = 1 }', base: 'a = 1\nb = 2\nd { k = 1 }\nx = 5' };
  const c = cfg(files);
  assert.deepEqual(Object.keys(c), ['x', 'a', 'b', 'd', 'c']);
  assert.deepEqual(c, { x: 5, a: 9, b: { n: 1 }, d: { k: 1 }, c: 3 });
  const f2 = { main: 'include "a"\ninclude "b"', a: 'p = 1\nq = 2\ns { z = 1 y = 1 }', b: 'q = 3\nr = 4\ns { y = 2 w = 1 }\np = [1]' };
  const c2 = cfg(f2);
  assert.deepEqual(Object.keys(c2), ['p', 'q', 's', 'r']);
  assert.deepEqual(Object.keys(c2.s), ['z', 'y', 'w']);
  assert.deepEqual(c2, { p: [1], q: 3, s: { z: 1, y: 2, w: 1 }, r: 4 });
});

test('evaluate: Block thay giá trị vô hướng; Assign thay Block; mảng thay hẳn', () => {
  const f = { main: 'include "a"\ninclude "b"\ninclude "c"', a: 's { a = 1 }\nl = [1, 2]', b: 's = 3', c: 's { b = 2 }\nl = [9]' };
  assert.deepEqual(cfg(f), { s: { b: 2 }, l: [9] });
  assert.deepEqual(cfg({ main: 'include "a"\ns = 7', a: 's { a = 1 }' }), { s: 7 });
  assert.deepEqual(cfg({ main: 'include "a"\ns { z = 1 }', a: 's = 7' }), { s: { z: 1 } });
});

test('evaluate: tham chiếu thấy giá trị cuối (khai báo muộn, bị include ghi đè)', () => {
  assert.deepEqual(cfg('a = "${b}"\nb = 1'), { a: 1, b: 1 });
  assert.deepEqual(cfg({ main: 'a = "${b}"\ninclude "x"', x: 'b = 7' }), { a: 7, b: 7 });
  assert.deepEqual(cfg({ main: 'include "x"\nb = 8\na = "n${b}"', x: 'b = 7' }), { b: 8, a: 'n8' });
  assert.deepEqual(cfg('a = "${c.d}"\nc { d = "${e}" }\ne = "z"'), { a: 'z', c: { d: 'z' }, e: 'z' });
});

test('evaluate: giữ kiểu cho chuỗi thuần; nối chuỗi; số theo JSON.stringify', () => {
  const c = cfg('n = null\nt = true\nx = 1.50\nbig = 1e21\nneg = -0\nl = [1, [2]]\no { k = "v" }\n' +
    'pn = "${n}"\npt = "${t}"\npx = "${x}"\npl = "${l}"\npo = "${o}"\n' +
    'sn = "a${n}"\nst = "${t}!"\nsx = "${x}|${big}"\nsb = "${neg}x"\nsk = "${o.k}${l.1.0}"');
  assert.equal(c.pn, null);
  assert.equal(c.pt, true);
  assert.equal(c.px, 1.5);
  assert.deepEqual(c.pl, [1, [2]]);
  assert.deepEqual(c.po, { k: 'v' });
  assert.equal(c.sn, 'anull');
  assert.equal(c.st, 'true!');
  assert.equal(c.sx, '1.5|1e+21');
  assert.ok(Object.is(c.neg, 0));
  assert.equal(c.sb, '0x');
  assert.equal(c.sk, 'v2');
});

test('evaluate: chuỗi rỗng, \\${ } là văn bản, nội suy lồng, chuỗi thuần bắc cầu giữ kiểu', () => {
  const c = cfg('e = ""\nt = "\\${a}"\na = "${b}-1"\nb = "${c}-2"\nc = "z"\np = "${q}"\nq = "${r}"\nr = [1]\n');
  assert.equal(c.e, '');
  assert.equal(c.t, '${a}');
  assert.equal(c.a, 'z-2-1');
  assert.deepEqual(c.p, [1]);
  assert.deepEqual(cfg('v = "${@k.0}"\nconst k = ["${@j}"]\nconst j = 5'), { v: 5 });
});

test('evaluate: không chia sẻ tham chiếu; kết quả là JSON thuần', () => {
  const c = cfg('l = [1, [2]]\no { a = [3] }\nx = "${l}"\ny = "${l}"\nz = "${o}"\nw = "${o}"');
  assert.notEqual(c.x, c.y);
  assert.notEqual(c.x, c.l);
  assert.notEqual(c.x[1], c.l[1]);
  assert.notEqual(c.z, c.w);
  assert.notEqual(c.z.a, c.o.a);
  c.x[1].push(99);
  assert.deepEqual(c.l, [1, [2]]);
  assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
  assert.equal(Object.getPrototypeOf(c), Object.prototype);
});

test('evaluate: khóa đặc biệt (__proto__, constructor) là khóa thường', () => {
  const c = cfg('__proto__ = 1\nconstructor { a = 2 }\nx = "${__proto__}"');
  assert.deepEqual(Object.keys(c), ['__proto__', 'constructor', 'x']);
  assert.equal(Object.getPrototypeOf(c), Object.prototype);
  assert.equal(c.x, 1);
  assert.equal(Object.hasOwn(c, '__proto__'), true);
});

test('evaluate: tham chiếu qua mảng bằng chỉ số; null là đích hợp lệ', () => {
  assert.deepEqual(cfg('a = [[1, 2], ["x"]]\nb = "${a.0.1}${a.1.0}"\nn = null\nm = "${n}"'), { a: [[1, 2], ['x']], b: '2x', n: null, m: null });
  assert.equal(cfg('l = [0,1,2,3,4,5,6,7,8,9,10]\nx = "${l.10}"').x, 10);
});

// ---------------------------------------------------------------- Mục 7: diff
test('JSON Pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~b/c'), 'a~0b~1c');
  assert.equal(escapePointer('~1'), '~01');
  assert.equal(escapePointer(12), '12');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(unescapePointer('~1~0'), '/~');
  for (const bad of ['~', 'a~', '~2', '~x', 'a~~']) {
    assert.throws(() => unescapePointer(bad), { code: 'DIFF_BAD_POINTER' }, bad);
  }
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/~1/b~0'), ['a', '/', 'b~']);
  assert.deepEqual(parsePointer('//'), ['', '']);
  assert.throws(() => parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => parsePointer('/a~'), { code: 'DIFF_BAD_POINTER' });
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['']), '/');
  assert.equal(formatPointer(['a/b', 0, '~']), '/a~1b/0/~0');
});

test('diff: ví dụ mục 9, thứ tự khóa thao tác', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(ops.map((o) => Object.keys(o)), [
    ['op', 'path', 'oldValue', 'value'], ['op', 'path', 'oldValue'], ['op', 'path', 'value'], ['op', 'path', 'oldValue', 'value']]);
});

test('diff: luật loại — null, mảng/đối tượng, gốc, bằng nhau', () => {
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff({ a: [1, { b: null }] }, { a: [1, { b: null }] }), []);
  assert.deepEqual(diff(1, '1'), [{ op: 'replace', path: '', oldValue: 1, value: '1' }]);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: null }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: [] }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: [], value: {} }]);
  assert.deepEqual(diff({ a: {} }, { a: [] }), [{ op: 'replace', path: '/a', oldValue: {}, value: [] }]);
  assert.deepEqual(diff([], null), [{ op: 'replace', path: '', oldValue: [], value: null }]);
  assert.deepEqual(diff(true, false), [{ op: 'replace', path: '', oldValue: true, value: false }]);
});

test('diff: sắp khóa UTF-16, mảng add tăng dần rồi remove giảm dần', () => {
  assert.deepEqual(diff({ b: 1, B: 1, é: 1 }, {}).map((o) => o.path), ['/B', '/b', '/é']);
  assert.deepEqual(diff({ a: 1 }, { c: 1, a: 2 }).map((o) => o.path), ['/a', '/c']);
  assert.deepEqual(diff([1], [1, 2, 3, 4]).map((o) => [o.op, o.path]), [['add', '/1'], ['add', '/2'], ['add', '/3']]);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => [o.op, o.path]), [['remove', '/3'], ['remove', '/2'], ['remove', '/1']]);
  assert.deepEqual(diff({ k: [1, 9, 8] }, { k: [2] }).map((o) => [o.op, o.path]), [['replace', '/k/0'], ['remove', '/k/2'], ['remove', '/k/1']]);
  assert.deepEqual(diff({ a: 1 }, { '': 1, a: 1 }).map((o) => o.path), ['/']);
});

test('diff: value/oldValue là bản sao sâu', () => {
  const a = { k: { x: [1] } };
  const b = { n: { y: [2] } };
  const ops = diff(a, b);
  ops[0].oldValue.x.push(9);
  ops[1].value.y.push(9);
  assert.deepEqual(a, { k: { x: [1] } });
  assert.deepEqual(b, { n: { y: [2] } });
});

test('applyDiff: bất biến, không đổi doc, lỗi DIFF_APPLY_FAILED', () => {
  const pairs = [
    [{ a: [1, 2, 3], b: { c: 1 } }, { a: [1], b: { c: [2], d: null }, e: 'x' }],
    [[1, 2], [3, 4, 5, 6]], [1, { a: 1 }], [{}, []], [{ 'a/b': { '~': 1 } }, { 'a/b': { '~': 2 }, '': 3 }], [[], []],
  ];
  for (const [a, b] of pairs) {
    const snap = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), snap);
  }
  const doc = { a: [1] };
  const out = applyDiff(doc, [{ op: 'add', path: '/a/0', value: 0 }, { op: 'add', path: '/a/2', value: 9 }]);
  assert.deepEqual(out, { a: [0, 1, 9] });
  assert.deepEqual(doc, { a: [1] });
  assert.deepEqual(applyDiff(1, [{ op: 'replace', path: '', oldValue: 1, value: 2 }]), 2);
  assert.deepEqual(applyDiff(1, [{ op: 'add', path: '', value: [] }]), []);
  const fail = (d, ops) => assert.throws(() => applyDiff(d, ops), { code: 'DIFF_APPLY_FAILED' }, JSON.stringify(ops));
  fail({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]);
  fail({ a: 1 }, [{ op: 'remove', path: '/b' }]);
  fail({ a: 1 }, [{ op: 'replace', path: '/b', value: 1 }]);
  fail([1], [{ op: 'remove', path: '/1' }]);
  fail([1], [{ op: 'replace', path: '/1', value: 1 }]);
  fail([1], [{ op: 'add', path: '/2', value: 1 }]);
  fail({ a: 1 }, [{ op: 'add', path: '/x/y', value: 1 }]);
});

test('formatText / formatJson / summarize', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.equal(formatText(ops), '~ /a/b/1: 2 -> 5\n- /a/b/2 = 3\n+ /c = null\n~ /x~1y: 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff({ a: 1 }, [1])), '~ (root): {"a":1} -> [1]');
  assert.equal(formatText([{ op: 'add', path: '/k', value: { a: [1, 'x'] } }]), '+ /k = {"a":[1,"x"]}');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(diff(1, 2)), JSON.stringify(diff(1, 2), null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 2 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});

// ---------------------------------------------------------------- Mục 8 + đường ống
test('compile: stage parse / check / ok, hình dạng kết quả', () => {
  const p = compile({ main: 'a = =' }, 'main');
  assert.deepEqual(Object.keys(p), ['ok', 'stage', 'errors']);
  assert.equal(p.ok, false);
  assert.equal(p.stage, 'parse');
  assert.equal(p.errors.length, 1);
  assert.deepEqual(posF(p.errors[0]), ['PARSE_UNEXPECTED_TOKEN', 'main', 1, 5]);
  assert.deepEqual(compile({}, 'main').errors.map(posF), [['PARSE_ENTRY_NOT_FOUND', 'main', 1, 1]]);
  const src = { main: 'a = 1\na = 2\nb = "${x}"' };
  const c = compile(src, 'main');
  assert.equal(c.stage, 'check');
  assert.deepEqual(c.errors, check(prog(src)));
  assert.deepEqual(c.errors.map((e) => e.code), ['SEM_DUPLICATE_KEY']);
  const s = compile({ main: 'a = 1' }, 'main', { fields: { a: { type: 'string' } } });
  assert.equal(s.stage, 'check');
  assert.deepEqual(s.errors.map(posF), [['SEM_TYPE_MISMATCH', 'main', 1, 5]]);
  const ok = compile({ main: 'a = 1' }, 'main', { fields: { a: { type: 'integer' } } });
  assert.deepEqual(ok, { ok: true, config: { a: 1 } });
});

test('compile: lỗi lexer qua tệp include có file; không ném với tệp lạ', () => {
  const r = compile({ main: 'include "a"', a: '\n"\\q"' }, 'main');
  assert.equal(r.stage, 'parse');
  assert.deepEqual(posF(r.errors[0]), ['LEX_BAD_ESCAPE', 'a', 2, 2]);
  assert.deepEqual(compile({ main: '\uFEFF' }, 'main'), { ok: true, config: {} });
});

test('đường ống: compile → diff → formatText / applyDiff', () => {
  const base = { main: 'include "base"\nserver { port = 2 }\nmode = "prod"\ntags = ["a"]', base: 'server { host = "h" port = 1 }\nmode = "dev"' };
  const next = { main: 'include "base"\nserver { port = "${@p}" }\nmode = "prod"\ntags = ["a", "b"]\nextra { k = null }\nconst p = 3', base: base.base };
  const a = cfg(base);
  const b = cfg(next);
  assert.deepEqual(b.server, { host: 'h', port: 3 });
  const ops = diff(a, b);
  assert.equal(formatText(ops), '+ /extra = {"k":null}\n~ /server/port: 2 -> 3\n+ /tags/1 = "b"');
  assert.deepEqual(summarize(ops), { add: 2, remove: 0, replace: 1 });
  assert.deepEqual(applyDiff(a, ops), b);
  assert.equal(formatText(diff(a, a)), 'Không có thay đổi');
  assert.equal(formatJson(diff(a, a)), '[]');
  assert.equal(JSON.parse(formatJson(ops)).length, 3);
});
