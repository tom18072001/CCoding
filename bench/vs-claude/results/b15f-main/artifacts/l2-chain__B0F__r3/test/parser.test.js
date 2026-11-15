import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  return r.error;
};
const pok = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};
const at = (e, code, line, column) => {
  assert.equal(e.code, code);
  assert.equal(e.line, line);
  assert.equal(e.column, column);
};

test('AST đủ các nút với vị trí', () => {
  const ast = pok('const c = 1\na = "x${b}"\nblk {\n  n = null\n  t = true\n}\ninclude "f"\nl = [1, [2],]');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1, body: [
      { type: 'Const', name: 'c', line: 1, column: 1, value: { type: 'Number', value: 1, line: 1, column: 11 } },
      { type: 'Assign', key: 'a', line: 2, column: 1, value: {
        type: 'String', line: 2, column: 5, parts: [
          { type: 'Text', value: 'x' },
          { type: 'Ref', path: ['b'], const: false, line: 2, column: 7 },
        ] } },
      { type: 'Block', key: 'blk', line: 3, column: 1, body: [
        { type: 'Assign', key: 'n', line: 4, column: 3, value: { type: 'Null', line: 4, column: 7 } },
        { type: 'Assign', key: 't', line: 5, column: 3, value: { type: 'Bool', value: true, line: 5, column: 7 } },
      ] },
      { type: 'Include', path: 'f', line: 7, column: 1 },
      { type: 'Assign', key: 'l', line: 8, column: 1, value: {
        type: 'Array', line: 8, column: 5, items: [
          { type: 'Number', value: 1, line: 8, column: 6 },
          { type: 'Array', line: 8, column: 9, items: [{ type: 'Number', value: 2, line: 8, column: 10 }] },
        ] } },
    ],
  });
});

test('File rỗng ở 1:1; include "" cho path ""', () => {
  assert.deepEqual(pok(''), { type: 'File', body: [], line: 1, column: 1 });
  assert.equal(pok('include ""').body[0].path, '');
  assert.equal(pok('\n\n  a = 1').line, 1);
});

test('mảng: [] và [1,] hợp lệ; [,] và [1,,2] lỗi', () => {
  assert.deepEqual(pok('a = []').body[0].value.items, []);
  assert.equal(pok('a = [1,]').body[0].value.items.length, 1);
  at(perr('a = [,]'), 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at(perr('a = [1,,2]'), 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at(perr('a = [1 2]'), 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at(perr('a = [{}]'), 'PARSE_UNEXPECTED_TOKEN', 1, 6);
});

test('ví dụ mục 9: dấu phẩy thừa tại 5:29', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }      # lỗi';
  at(perr(src), 'PARSE_UNEXPECTED_TOKEN', 5, 29);
  const fixed = src.replace(' , }', ' }');
  assert.equal(parse(fixed).ok, true);
});

test('PARSE_UNEXPECTED_EOF tại token eof', () => {
  at(perr('a = '), 'PARSE_UNEXPECTED_EOF', 1, 5);
  at(perr('a {\n b = 1\n'), 'PARSE_UNEXPECTED_EOF', 3, 1);
  at(perr('a = [1,'), 'PARSE_UNEXPECTED_EOF', 1, 8);
  at(perr('a'), 'PARSE_UNEXPECTED_EOF', 1, 2);
  at(perr('include'), 'PARSE_UNEXPECTED_EOF', 1, 8);
  at(perr('const x'), 'PARSE_UNEXPECTED_EOF', 1, 8);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  at(perr('}'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(perr('a b'), 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at(perr('true = 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(perr('a = b'), 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at(perr('a = 1 }'), 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at(perr('include 5'), 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at(perr('const 5 = 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at(perr('const a 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 9);
});

test('PARSE_BAD_INCLUDE tại chuỗi', () => {
  at(perr('x = 1\ninclude "a${b}"'), 'PARSE_BAD_INCLUDE', 2, 9);
});

test('PARSE_CONST_NOT_TOP tại const', () => {
  at(perr('a {\n  const x = 1\n}'), 'PARSE_CONST_NOT_TOP', 2, 3);
});

test('lỗi lexer được ưu tiên hơn lỗi cú pháp đứng trước', () => {
  at(perr('a = = \n b = 01'), 'LEX_BAD_NUMBER', 2, 6);
  at(perr('}\n"abc'), 'LEX_UNTERMINATED_STRING', 2, 1);
});

test('parse không ném', () => {
  assert.doesNotThrow(() => parse('\u0000'));
});

test('parseProject: thứ tự files tiền thứ tự, include trong khối', () => {
  const files = {
    main: 'a {\n include "x"\n}\ninclude "y"\ninclude "nope"\ninclude "x"',
    y: 'include "z"',
    x: 'include "w"',
    z: '',
    w: '',
    unused: 'a = = =',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'x', 'w', 'y', 'z']);
  assert.equal(r.program.files.main.type, 'File');
});

test('parseProject: vòng include không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi đầu tiên theo tiền thứ tự, có file', () => {
  const files = { main: 'include "a"\ninclude "b"', a: 'x = 1\ny = ,', b: 'z = 01' };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.error.file, 'a');
  at(r.error, 'PARSE_UNEXPECTED_TOKEN', 2, 5);
  // lỗi trong entry thắng
  const r2 = parseProject({ main: 'include "a"\n= ', a: 'y = ,' }, 'main');
  assert.equal(r2.error.file, 'main');
  // lỗi lexer có file
  const r3 = parseProject({ main: 'include "b"', b: 'z = 01' }, 'main');
  assert.equal(r3.error.file, 'b');
  at(r3.error, 'LEX_BAD_NUMBER', 1, 5);
});

test('parseProject: thiếu entry', () => {
  const r = parseProject({ a: '' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_ENTRY_NOT_FOUND');
  assert.equal(r.error.file, 'main');
  assert.equal(r.error.line, 1);
  assert.equal(r.error.column, 1);
});
