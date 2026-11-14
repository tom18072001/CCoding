import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const ok = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};
const bad = (src, code, line, column) => {
  const r = parse(src);
  assert.equal(r.ok, false, `mong lỗi cho ${JSON.stringify(src)}`);
  assert.deepEqual({ code: r.error.code, line: r.error.line, column: r.error.column }, { code, line, column });
};

test('AST đầy đủ các loại nút, đúng trường', () => {
  const ast = ok('const c = 1\na = "x"\nb { d = [true, null] }\ninclude "f"');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'c', value: { type: 'Number', value: 1, line: 1, column: 11 }, line: 1, column: 1 },
      { type: 'Assign', key: 'a', value: { type: 'String', parts: [{ type: 'Text', value: 'x' }], line: 2, column: 5 }, line: 2, column: 1 },
      {
        type: 'Block', key: 'b', line: 3, column: 1,
        body: [{
          type: 'Assign', key: 'd', line: 3, column: 5,
          value: {
            type: 'Array', line: 3, column: 9,
            items: [{ type: 'Bool', value: true, line: 3, column: 10 }, { type: 'Null', line: 3, column: 16 }],
          },
        }],
      },
      { type: 'Include', path: 'f', line: 4, column: 1 },
    ],
  });
});

test('File luôn 1:1 kể cả khi có BOM/chú thích/rỗng', () => {
  assert.deepEqual(ok(''), { type: 'File', body: [], line: 1, column: 1 });
  const a = ok('﻿\n# c\nx = 1');
  assert.deepEqual([a.line, a.column], [1, 1]);
  assert.deepEqual([a.body[0].line, a.body[0].column], [3, 1]);
});

test('chuỗi rỗng và Ref trong AST', () => {
  const ast = ok('a = ""\nb = "x${@k.1}"');
  assert.deepEqual(ast.body[0].value.parts, []);
  assert.deepEqual(ast.body[1].value.parts[1], { type: 'Ref', path: ['k', '1'], const: true, line: 2, column: 7 });
});

test('mảng: dấu phẩy cuối, lồng, rỗng', () => {
  const a = ok('a = []\nb = [1,]\nc = [[1, 2],[],]');
  assert.equal(a.body[0].value.items.length, 0);
  assert.equal(a.body[1].value.items.length, 1);
  assert.equal(a.body[2].value.items.length, 2);
  bad('a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  bad('a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  bad('a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
});

test('mảng không chứa khối', () => {
  bad('a = [b { }]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
});

test('khối lồng, khối rỗng, câu lệnh cách nhau bằng khoảng trắng', () => {
  const a = ok('a { b { } c = 1 d = 2 }');
  assert.equal(a.body[0].body.length, 3);
});

test('ví dụ mục 9: dấu phẩy thừa → UNEXPECTED_TOKEN tại 5:29', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }      # lỗi\n';
  bad(src, 'PARSE_UNEXPECTED_TOKEN', 5, 29);
  assert.equal(parse(src.replace(' ,', '')).ok, true);
});

test('PARSE_UNEXPECTED_EOF tại token eof', () => {
  bad('a = ', 'PARSE_UNEXPECTED_EOF', 1, 5);
  bad('a', 'PARSE_UNEXPECTED_EOF', 1, 2);
  bad('a {\n  b = 1\n', 'PARSE_UNEXPECTED_EOF', 3, 1);
  bad('a = [1,', 'PARSE_UNEXPECTED_EOF', 1, 8);
  bad('a = [1', 'PARSE_UNEXPECTED_EOF', 1, 7);
  bad('include', 'PARSE_UNEXPECTED_EOF', 1, 8);
  bad('const', 'PARSE_UNEXPECTED_EOF', 1, 6);
  bad('const a', 'PARSE_UNEXPECTED_EOF', 1, 8);
  bad('const a =', 'PARSE_UNEXPECTED_EOF', 1, 10);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  bad('}', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  bad('a { } }', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  bad('a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  bad('true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  bad('null { }', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  bad('a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  bad('a = include', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  bad('a = =', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  bad('1 = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  bad('"a" = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  bad('include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  bad('include a', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  bad('const 1 = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  bad('const true = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  bad('const a 2', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  bad('a { = }', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  bad('a = 1 ,', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
});

test('include: chuỗi thuần, rỗng, có nội suy', () => {
  assert.equal(ok('include "a"').body[0].path, 'a');
  assert.equal(ok('include "a\\"b"').body[0].path, 'a"b');
  assert.equal(ok('include ""').body[0].path, '');
  assert.equal(ok('x { include "m.cfg" }').body[0].body[0].type, 'Include');
  bad('include "a${b}"', 'PARSE_BAD_INCLUDE', 1, 9);
  bad('x {\n include "${@c}"\n}', 'PARSE_BAD_INCLUDE', 2, 10);
});

test('PARSE_CONST_NOT_TOP', () => {
  bad('a {\n  const x = 1\n}', 'PARSE_CONST_NOT_TOP', 2, 3);
  bad('a { b { const x = 1 } }', 'PARSE_CONST_NOT_TOP', 1, 9);
  bad('a { const }', 'PARSE_CONST_NOT_TOP', 1, 5);
  assert.equal(ok('const x = 1\nconst y = [1]').body.length, 2);
});

test('lỗi lexer ưu tiên hơn lỗi cú pháp trước đó', () => {
  bad('a b\nc = 01', 'LEX_BAD_NUMBER', 2, 5);
  bad('} \n"abc', 'LEX_UNTERMINATED_STRING', 2, 1);
});

test('lỗi cú pháp đầu tiên được báo', () => {
  bad('a = \n} b', 'PARSE_UNEXPECTED_TOKEN', 2, 1);
});

test('parse không ném với đầu vào lạ', () => {
  for (const s of ['', '{', '[', '"', '﻿', 'a = [', 'const a = [', 'a { b {']) {
    assert.doesNotThrow(() => parse(s));
  }
});

// --- parseProject ---

test('parseProject: thứ tự tiền thứ tự, include trong khối, bỏ qua tệp thiếu', () => {
  const files = {
    z: 'include "b"\nblk { include "c" }\ninclude "missing"\ninclude "d"',
    b: 'include "e"',
    e: 'x = 1',
    c: 'include "e"\ninclude "b"',
    d: 'y = 2',
    unused: 'a = 1',
  };
  const r = parseProject(files, 'z');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'z');
  assert.deepEqual(Object.keys(r.program.files), ['z', 'b', 'e', 'c', 'd']);
  assert.equal(r.program.files.z.type, 'File');
});

test('parseProject: chu trình include không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"\ninclude "b"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi kèm file, dừng ở tệp gặp đầu tiên', () => {
  const r = parseProject({ m: 'include "p"\ninclude "q"', p: 'a = ', q: 'b = 01' }, 'm');
  assert.equal(r.ok, false);
  assert.deepEqual(r.error, { code: 'PARSE_UNEXPECTED_EOF', message: r.error.message, file: 'p', line: 1, column: 5 });
  const r2 = parseProject({ m: 'x = = 1' }, 'm');
  assert.deepEqual([r2.error.file, r2.error.code, r2.error.line, r2.error.column], ['m', 'PARSE_UNEXPECTED_TOKEN', 1, 5]);
  const r3 = parseProject({ m: 'include "q"', q: '"' }, 'm');
  assert.deepEqual([r3.error.file, r3.error.code], ['q', 'LEX_UNTERMINATED_STRING']);
});

test('parseProject: tệp không tới được không bị phân tích', () => {
  const r = parseProject({ m: 'a = 1', junk: '}}}' }, 'm');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['m']);
});

test('parseProject: PARSE_ENTRY_NOT_FOUND', () => {
  const r = parseProject({ a: '' }, 'nope');
  assert.deepEqual(r, { ok: false, error: { code: 'PARSE_ENTRY_NOT_FOUND', message: r.error.message, file: 'nope', line: 1, column: 1 } });
  assert.equal(parseProject({}, 'toString').ok, false);
});
