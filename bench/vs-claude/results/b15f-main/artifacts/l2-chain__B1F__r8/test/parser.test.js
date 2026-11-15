import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const ok = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};
const at = (src, code, line, column) => {
  const r = parse(src);
  assert.equal(r.ok, false, JSON.stringify(src));
  assert.deepEqual([r.error.code, r.error.line, r.error.column], [code, line, column], JSON.stringify(src));
};

test('AST đầy đủ: đúng các trường, không thêm trường', () => {
  const ast = ok('const c = 1\na = "x${a}"\nb { n = null\n t = true }\ninclude "f"\nl = [1, false]');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'c', value: { type: 'Number', line: 1, column: 11, value: 1 } },
      { type: 'Assign', line: 2, column: 1, key: 'a', value: {
        type: 'String', line: 2, column: 5,
        parts: [{ type: 'Text', value: 'x' }, { type: 'Ref', path: ['a'], const: false, line: 2, column: 7 }] } },
      { type: 'Block', line: 3, column: 1, key: 'b', body: [
        { type: 'Assign', line: 3, column: 5, key: 'n', value: { type: 'Null', line: 3, column: 9 } },
        { type: 'Assign', line: 4, column: 2, key: 't', value: { type: 'Bool', line: 4, column: 6, value: true } },
      ] },
      { type: 'Include', line: 5, column: 1, path: 'f' },
      { type: 'Assign', line: 6, column: 1, key: 'l', value: {
        type: 'Array', line: 6, column: 5, items: [
          { type: 'Number', line: 6, column: 6, value: 1 },
          { type: 'Bool', line: 6, column: 9, value: false }] } },
    ],
  });
});

test('tệp rỗng, chỉ chú thích', () => {
  assert.deepEqual(ok(''), { type: 'File', line: 1, column: 1, body: [] });
  assert.deepEqual(ok('\n  # x\n').body, []);
});

test('chuỗi rỗng có parts []', () => {
  assert.deepEqual(ok('a = ""').body[0].value.parts, []);
});

test('mảng: [] [1,] lồng nhau hợp lệ; [,] [1,,2] lỗi', () => {
  assert.equal(ok('a = []').body[0].value.items.length, 0);
  assert.equal(ok('a = [1,]').body[0].value.items.length, 1);
  assert.equal(ok('a = [[1, 2],[],]').body[0].value.items.length, 2);
  at('a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at('a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('a = [1,', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('a = [1', 'PARSE_UNEXPECTED_EOF', 1, 7);
  at('a = [', 'PARSE_UNEXPECTED_EOF', 1, 6);
  at('a = [b {}]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
});

test('PARSE_UNEXPECTED_EOF', () => {
  at('a =', 'PARSE_UNEXPECTED_EOF', 1, 4);
  at('a', 'PARSE_UNEXPECTED_EOF', 1, 2);
  at('a {\n b = 1\n', 'PARSE_UNEXPECTED_EOF', 3, 1);
  at('const', 'PARSE_UNEXPECTED_EOF', 1, 6);
  at('const a', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('const a =', 'PARSE_UNEXPECTED_EOF', 1, 10);
  at('include', 'PARSE_UNEXPECTED_EOF', 1, 8);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  at('}', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a {} }', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at('true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at('a = = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('= 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('1 = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a = 1,', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at('include a', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('const 1 = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at('const include = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at('const a 2', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('a = true false', 'PARSE_UNEXPECTED_TOKEN', 1, 10);
  at('a = {', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
});

test('ví dụ mục 9: dấu phẩy thừa → 5:29', () => {
  const main = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }\n';
  at(main, 'PARSE_UNEXPECTED_TOKEN', 5, 29);
  assert.equal(parse(main.replace(' , }', ' }')).ok, true);
});

test('include: path, chuỗi rỗng, nội suy → BAD_INCLUDE', () => {
  assert.equal(ok('include "a\\u0062c\\"d"').body[0].path, 'abc"d');
  assert.equal(ok('include ""').body[0].path, '');
  assert.equal(ok('x { include "a" }').body[0].body[0].type, 'Include');
  at('include "a${b}"', 'PARSE_BAD_INCLUDE', 1, 9);
  at('x {\n include "${@c}"\n}', 'PARSE_BAD_INCLUDE', 2, 10);
  assert.equal(ok('include "\\${b}"').body[0].path, '${b}');
});

test('const chỉ ở cấp cao nhất', () => {
  at('a { const x = 1 }', 'PARSE_CONST_NOT_TOP', 1, 5);
  at('a {\n b {\n  const x = 1\n }\n}', 'PARSE_CONST_NOT_TOP', 3, 3);
  at('a { const }', 'PARSE_CONST_NOT_TOP', 1, 5);
});

test('lỗi lexer được ưu tiên hơn lỗi cú pháp', () => {
  at('a = = \n b = 01', 'LEX_BAD_NUMBER', 2, 6);
  at('} "abc', 'LEX_UNTERMINATED_STRING', 1, 3);
  const r = parse('a = ');
  assert.deepEqual(Object.keys(r.error).sort(), ['code', 'column', 'line', 'message']);
});

test('lỗi cú pháp đầu tiên theo thứ tự đọc', () => {
  at('a = ,\n}\n', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('x { const a = 1 \n } }', 'PARSE_CONST_NOT_TOP', 1, 5);
});

// ---------------- parseProject ----------------

test('parseProject: tiền thứ tự, include trong khối, bỏ qua tệp thiếu', () => {
  const files = {
    main: 'include "a"\nblk { include "missing"\n include "c" }\ninclude "b"',
    a: 'include "d"',
    b: 'x = 1',
    c: 'include "a"',
    d: 'y = 1',
    unused: 'x = = =',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'a', 'd', 'c', 'b']);
  assert.equal(r.program.files.main.type, 'File');
});

test('parseProject: tự include và vòng không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"\ninclude "b"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi có file, dừng ở tệp gặp đầu tiên', () => {
  const files = { main: 'include "b"\ninclude "c"', b: 'x = 1\ny = ', c: 'z = 01' };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_UNEXPECTED_EOF', 'b', 2, 5],
  );
  const l = parseProject({ main: 'a = 1 }', other: 'x' }, 'main');
  assert.deepEqual([l.error.code, l.error.file], ['PARSE_UNEXPECTED_TOKEN', 'main']);
  const e2 = parseProject({ main: 'include "c"', c: '@' }, 'main');
  assert.deepEqual([e2.error.code, e2.error.file, e2.error.line, e2.error.column], ['LEX_UNEXPECTED_CHAR', 'c', 1, 1]);
});

test('parseProject: tệp lỗi nhưng không tới được thì bỏ qua', () => {
  const r = parseProject({ main: 'a = 1', bad: '@@' }, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main']);
});

test('parseProject: PARSE_ENTRY_NOT_FOUND', () => {
  const r = parseProject({ a: '' }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_ENTRY_NOT_FOUND', 'main', 1, 1],
  );
  assert.equal(parseProject({}, 'toString').ok, false);
});
