// Hồi quy S6: các ca rủi ro cao khi đối chiếu SPEC.md ↔ code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parse, parseProject, compile, diff } from '../src/index.js';

const lexErr = (s) => {
  const r = tokenize(s);
  assert.equal(r.ok, false, JSON.stringify(s));
  return `${r.error.code}@${r.error.line}:${r.error.column}`;
};
const errs = (r) => (r.ok ? r.config : r.errors.map((e) => `${e.code}@${e.file}:${e.line}:${e.column}`));

test('eof sau BOM/CRLF/CR', () => {
  const eof = (s) => { const t = tokenize(s).tokens.at(-1); return [t.line, t.column]; };
  assert.deepEqual(eof('﻿a\r\nb\r\n'), [3, 1]);
  assert.deepEqual(eof('a\rb\r'), [3, 1]);
  assert.deepEqual(eof('﻿'), [1, 1]);
  assert.deepEqual(eof('﻿ab'), [1, 3]);
});

test('số: 1-2, 12abc, 1e999, 01, 1., -, 1e đều LEX_BAD_NUMBER; -0 là 0', () => {
  for (const s of ['1-2', '12abc', '1e999', '01', '1.', '-', '1e']) assert.equal(lexErr(s), 'LEX_BAD_NUMBER@1:1', s);
  assert.equal(lexErr('.5'), 'LEX_UNEXPECTED_CHAR@1:1');
  assert.equal(lexErr('+1'), 'LEX_UNEXPECTED_CHAR@1:1');
  assert.ok(Object.is(tokenize('-0').tokens[0].value, 0));
});

test('chuỗi chưa đóng kết hợp nội suy hỏng: lỗi gặp trước được báo', () => {
  assert.equal(lexErr('"ab ${x'), 'LEX_BAD_INTERPOLATION@1:5');
  assert.equal(lexErr('"${} abc'), 'LEX_BAD_INTERPOLATION@1:2');
  assert.equal(lexErr('"abc ${a}'), 'LEX_UNTERMINATED_STRING@1:1');
  assert.equal(lexErr('"abc\n${}"'), 'LEX_UNTERMINATED_STRING@1:1');
  assert.equal(lexErr('  "\\q ${'), 'LEX_BAD_ESCAPE@1:4');
});

test('include "" hợp lệ; include nội suy là PARSE_BAD_INCLUDE', () => {
  assert.equal(parse('include ""').ast.body[0].path, '');
  assert.equal(parse('include "a${b}"').error.code, 'PARSE_BAD_INCLUDE');
});

test('lỗi lexer ưu tiên hơn lỗi cú pháp đứng trước', () => {
  const r = parse('a = =\n"x');
  assert.equal(r.error.code, 'LEX_UNTERMINATED_STRING');
  assert.deepEqual([r.error.line, r.error.column], [2, 1]);
});

test('AST không có trường thừa', () => {
  const ast = parse('const c = 1\na = "x${a}y"\nb { n = null t = true }\ninclude "f"\nl = [1]').ast;
  const keys = (n) => Object.keys(n).sort().join(',');
  assert.equal(keys(ast), 'body,column,line,type');
  const [c, a, b, inc, l] = ast.body;
  assert.equal(keys(c), 'column,line,name,type,value');
  assert.equal(keys(a), 'column,key,line,type,value');
  assert.equal(keys(a.value), 'column,line,parts,type');
  assert.equal(keys(a.value.parts[0]), 'type,value');
  assert.equal(keys(a.value.parts[1]), 'column,const,line,path,type');
  assert.equal(keys(b), 'body,column,key,line,type');
  assert.equal(keys(b.body[0].value), 'column,line,type');
  assert.equal(keys(inc), 'column,line,path,type');
  assert.equal(keys(l.value), 'column,items,line,type');
});

test('parseProject: include trong khối theo thứ tự tài liệu, lỗi của tệp gặp đầu tiên', () => {
  const files = { m: 'a { include "x" }\ninclude "y"\n', x: 'include "z"', y: 'q=1', z: 'bad bad' };
  const r = parseProject(files, 'm');
  assert.equal(r.error.file, 'z');
  const ok = parseProject({ ...files, z: 'k=1' }, 'm');
  assert.deepEqual(Object.keys(ok.program.files), ['m', 'x', 'z', 'y']);
});

test('thứ tự lỗi pha A khi include nằm trong khối', () => {
  const r = compile({ m: 'a { include "x" }\nb { k = 1 k = 2 }\ninclude "nf"', x: 'k=1 k=2' }, 'm');
  assert.deepEqual(errs(r), ['SEM_DUPLICATE_KEY@m:2:11', 'SEM_INCLUDE_NOT_FOUND@m:3:1', 'SEM_DUPLICATE_KEY@x:1:5']);
});

test('REF_CYCLE với mảng và đối tượng hợp nhất', () => {
  assert.deepEqual(errs(compile({ m: 'a = ["${a}"]' }, 'm')), ['SEM_REF_CYCLE@m:1:7']);
  assert.deepEqual(errs(compile({ m: 'x { y = "${x}" }' }, 'm')), ['SEM_REF_CYCLE@m:1:10']);
  assert.deepEqual(errs(compile({ m: 'a = ["${b}"]\nb = "${a}"' }, 'm')), ['SEM_REF_CYCLE@m:1:7', 'SEM_REF_CYCLE@m:2:6']);
  assert.deepEqual(
    errs(compile({ m: 'include "x"\ns { k = "${t}" }', x: 't = "${s}"' }, 'm')),
    ['SEM_REF_CYCLE@m:2:10', 'SEM_REF_CYCLE@x:1:6'],
  );
});

test('Ref vào chuỗi bị ghi đè: chỉ tính định nghĩa thắng', () => {
  // a = "${b}" bị a = 1 ghi đè nên không còn vòng.
  assert.deepEqual(errs(compile({ m: 'include "x"\na = 1', x: 'a = "${b}"\nb = "${a}"' }, 'm')), { a: 1, b: 1 });
  assert.deepEqual(errs(compile({ m: 'include "x"\nb = "${a}"', x: 'a = "${a}"' }, 'm')), ['SEM_REF_CYCLE@x:1:6']);
  assert.deepEqual(errs(compile({ m: 'include "x"\na = 2\nb = "${a}"', x: 'a = "${b}"' }, 'm')), { a: 2, b: 2 });
});

test('vị trí đối tượng sau khi bị gán vô hướng rồi tạo khối lại', () => {
  const S = { fields: { s: { type: 'object', fields: { z: { required: true } } } } };
  const files = { m: 'include "x"\ninclude "y"\n\ns { b = 2 }', x: 's { a = 1 }', y: 's = 5' };
  assert.deepEqual(errs(compile(files, 'm', S)), ['SEM_MISSING_REQUIRED@m:4:1']);
  const merged = { m: 'include "x"\n\ns { b = 2 }', x: '\ns { a = 1 }' };
  assert.deepEqual(errs(compile(merged, 'm', S)), ['SEM_MISSING_REQUIRED@x:2:1']);
  assert.deepEqual(compile(files, 'm').config, { s: { b: 2 } });
});

test('đường dẫn không đi xuyên qua chuỗi; mảng lồng và nội suy mảng', () => {
  const r = compile({ m: 'a = [1,[2,3]]\nb = "${a.1.0}"\nd = "${a.2}"\ne = "${a.1}"\nf = "x${a.1}"' }, 'm');
  assert.deepEqual(errs(r), ['SEM_UNDEFINED_REF@m:3:6', 'SEM_BAD_INTERPOLATION@m:5:7']);
  assert.deepEqual(errs(compile({ m: 'a = "x"\nb = "${a.0}"' }, 'm')), ['SEM_UNDEFINED_REF@m:2:6']);
});

test('diff: thứ tự khóa thao tác và escape con trỏ', () => {
  const ops = diff({ 'a~': 1, 'b/': [1], z: 1 }, { 'a~': 2, 'b/': [], c: 0 });
  assert.deepEqual(ops.map((o) => Object.keys(o).join()), [
    'op,path,oldValue,value', 'op,path,oldValue', 'op,path,value', 'op,path,oldValue',
  ]);
  assert.deepEqual(ops.map((o) => o.path), ['/a~0', '/b~1/0', '/c', '/z']);
});
