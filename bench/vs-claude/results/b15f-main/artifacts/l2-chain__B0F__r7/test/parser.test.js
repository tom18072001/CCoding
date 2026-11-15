import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false, `đợi lỗi cho ${JSON.stringify(src)}`);
  return [r.error.code, r.error.line, r.error.column];
};

test('deepStrictEqual toàn AST (bắt trường thừa)', () => {
  const src = 'const c = "x"\na = [1, [true], null]\nb {\n  s = "p${@c}q${a.0}"\n  include "f.cfg"\n}\n';
  const r = parse(src);
  assert.equal(r.ok, true);
  assert.deepStrictEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'c', value: { type: 'String', line: 1, column: 11, parts: [{ type: 'Text', value: 'x' }] } },
      {
        type: 'Assign', line: 2, column: 1, key: 'a',
        value: {
          type: 'Array', line: 2, column: 5,
          items: [
            { type: 'Number', line: 2, column: 6, value: 1 },
            { type: 'Array', line: 2, column: 9, items: [{ type: 'Bool', line: 2, column: 10, value: true }] },
            { type: 'Null', line: 2, column: 17 },
          ],
        },
      },
      {
        type: 'Block', line: 3, column: 1, key: 'b',
        body: [
          {
            type: 'Assign', line: 4, column: 3, key: 's',
            value: {
              type: 'String', line: 4, column: 7,
              parts: [
                { type: 'Text', value: 'p' },
                { type: 'Ref', path: ['c'], const: true, line: 4, column: 9 },
                { type: 'Text', value: 'q' },
                { type: 'Ref', path: ['a', '0'], const: false, line: 4, column: 15 },
              ],
            },
          },
          { type: 'Include', line: 5, column: 3, path: 'f.cfg' },
        ],
      },
    ],
  });
});

test('File rỗng luôn ở 1:1, kể cả sau BOM', () => {
  assert.deepStrictEqual(parse('﻿\r\n# x').ast, { type: 'File', line: 1, column: 1, body: [] });
});

test('BOM + CRLF: vị trí đúng', () => {
  const r = parse('﻿a = 1\r\nb = 2\rc = 3');
  assert.deepEqual(r.ast.body.map((s) => [s.line, s.column]), [[1, 1], [2, 1], [3, 1]]);
});

test('include: path nối Text; chuỗi rỗng được phép', () => {
  assert.equal(parse('include ""').ast.body[0].path, '');
  assert.equal(parse('include "a\\"b"').ast.body[0].path, 'a"b');
  assert.equal(parse('include "\\${x}"').ast.body[0].path, '${x}');
});

test('ví dụ mục 9: dấu phẩy thừa → 5:29', () => {
  const main = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }      # x\n';
  assert.deepEqual(perr(main), ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
  assert.equal(parse(main.replace(' , }', ' }')).ok, true);
});

test('mảng: [] [1,] hợp lệ; [,] [1,,2] lỗi', () => {
  assert.equal(parse('a = []').ok, true);
  assert.equal(parse('a = [1,]').ok, true);
  assert.equal(parse('a = [[1,],]').ok, true);
  assert.deepEqual(perr('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(perr('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(perr('a = [1 2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(perr('a = [b]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(perr('a = [{}]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
});

test('PARSE_UNEXPECTED_EOF tại token eof', () => {
  assert.deepEqual(perr('a = '), ['PARSE_UNEXPECTED_EOF', 1, 5]);
  assert.deepEqual(perr('a'), ['PARSE_UNEXPECTED_EOF', 1, 2]);
  assert.deepEqual(perr('a {\n b = 1\n'), ['PARSE_UNEXPECTED_EOF', 3, 1]);
  assert.deepEqual(perr('a = [1,'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(perr('a = [1'), ['PARSE_UNEXPECTED_EOF', 1, 7]);
  assert.deepEqual(perr('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(perr('const'), ['PARSE_UNEXPECTED_EOF', 1, 6]);
  assert.deepEqual(perr('const x'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(perr('﻿a = '), ['PARSE_UNEXPECTED_EOF', 1, 5]);
});

test('PARSE_UNEXPECTED_TOKEN các dạng', () => {
  assert.deepEqual(perr('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a = 1 }'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
  assert.deepEqual(perr('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('null { }'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(perr('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(perr('a = include'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(perr('a = 1 2'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
  assert.deepEqual(perr('include 5'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(perr('const 5 = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
  assert.deepEqual(perr('const true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
  assert.deepEqual(perr('const x 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(perr('a { = }'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(perr('a {\n}}'), ['PARSE_UNEXPECTED_TOKEN', 2, 2]);
  assert.deepEqual(perr('a = [1]]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
});

test('PARSE_BAD_INCLUDE tại chuỗi', () => {
  assert.deepEqual(perr('x = 1\ninclude "a${b}"'), ['PARSE_BAD_INCLUDE', 2, 9]);
  assert.deepEqual(perr('b {\n  include "${@c}"\n}'), ['PARSE_BAD_INCLUDE', 2, 11]);
});

test('PARSE_CONST_NOT_TOP tại từ khóa const', () => {
  assert.deepEqual(perr('a {\n  const x = 1\n}'), ['PARSE_CONST_NOT_TOP', 2, 3]);
  assert.deepEqual(perr('a { b { const'), ['PARSE_CONST_NOT_TOP', 1, 9]);
  assert.equal(parse('const x = 1\nconst y = [1]').ok, true);
});

test('parse chạy lexer trọn vẹn trước: lỗi lexer thắng lỗi cú pháp', () => {
  assert.deepEqual(perr('a = = \nb = 01'), ['LEX_BAD_NUMBER', 2, 5]);
  assert.deepEqual(perr('} \n"abc'), ['LEX_UNTERMINATED_STRING', 2, 1]);
  assert.deepEqual(perr('a {\n const x = 1\n} @'), ['LEX_UNEXPECTED_CHAR', 3, 3]);
});

test('parseProject: thứ tự tiền thứ tự, bỏ qua tệp thiếu và tệp không tới được', () => {
  const files = {
    main: 'include "a"\nblk { include "b" }\ninclude "missing"\ninclude "c"\n',
    a: 'include "d"\nx = 1',
    b: 'include "a"\ny = 1',
    c: 'include "main"',
    d: 'z = 1',
    orphan: 'this is not valid',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'a', 'd', 'b', 'c']);
  assert.equal(r.program.files.d.type, 'File');
});

test('parseProject: include trong khối theo thứ tự tài liệu', () => {
  const r = parseProject({ m: 'b { include "x" }\ninclude "y"', x: '', y: '' }, 'm');
  assert.deepEqual(Object.keys(r.program.files), ['m', 'x', 'y']);
});

test('parseProject: lỗi có file, dừng ở tệp gặp đầu tiên', () => {
  const files = { m: 'include "a"\ninclude "b"', a: 'x = ', b: 'y = 01' };
  assert.deepEqual(parseProject(files, 'm').error, {
    code: 'PARSE_UNEXPECTED_EOF', message: parseProject(files, 'm').error.message, file: 'a', line: 1, column: 5,
  });
  const r2 = parseProject({ m: 'include "b"', b: 'y = 01' }, 'm');
  assert.deepEqual([r2.error.code, r2.error.file, r2.error.line, r2.error.column], ['LEX_BAD_NUMBER', 'b', 1, 5]);
  const r3 = parseProject({ m: 'a = = 1' }, 'm');
  assert.deepEqual([r3.ok, r3.error.file, r3.error.code], [false, 'm', 'PARSE_UNEXPECTED_TOKEN']);
});

test('parseProject: tệp lỗi nhưng không tới được thì không ảnh hưởng', () => {
  assert.equal(parseProject({ m: 'a = 1', bad: '@@' }, 'm').ok, true);
});

test('parseProject: PARSE_ENTRY_NOT_FOUND', () => {
  const r = parseProject({ a: '' }, 'main');
  assert.deepEqual(r, {
    ok: false,
    error: { code: 'PARSE_ENTRY_NOT_FOUND', message: r.error.message, file: 'main', line: 1, column: 1 },
  });
  assert.equal(parseProject({}, 'toString').ok, false);
});
