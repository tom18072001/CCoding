import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';
import { parse, parseProject } from '../src/parser.js';
import { check } from '../src/check.js';
import { evaluate } from '../src/evaluate.js';
import { diff, formatText } from '../src/diff.js';
import { compile } from '../src/index.js';

test('tầng 1: tách từ một dòng gán', () => {
  const r = tokenize('port = 80');
  assert.equal(r.ok, true);
  assert.deepEqual(r.tokens.map((t) => t.type), ['ident', 'punct', 'number', 'eof']);
});

test('tầng 1: parse khối lồng nhau có vị trí', () => {
  const r = parse('a {\n  b = 1\n}');
  assert.equal(r.ok, true);
  assert.equal(r.ast.body[0].type, 'Block');
  assert.equal(r.ast.body[0].body[0].line, 2);
  assert.equal(r.ast.body[0].body[0].column, 3);
});

test('tầng 1: lỗi cú pháp có mã và vị trí', () => {
  const r = parse('a = ');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_UNEXPECTED_EOF');
});

test('tầng 2: tham chiếu không tồn tại', () => {
  const p = parseProject({ main: 'a = "${b}"' }, 'main');
  const errs = check(p.program);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].code, 'SEM_UNDEFINED_REF');
});

test('tầng 3: nội suy và giữ kiểu', () => {
  const p = parseProject({ main: 'n = 5\nm = "${n}"\ns = "n=${n}"' }, 'main');
  assert.deepEqual(evaluate(p.program), { n: 5, m: 5, s: 'n=5' });
});

test('tầng 4: diff và định dạng văn bản', () => {
  const ops = diff({ a: 1 }, { a: 2, b: 3 });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a', oldValue: 1, value: 2 },
    { op: 'add', path: '/b', value: 3 },
  ]);
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n+ /b = 3');
});

test('đầu cuối: compile', () => {
  const r = compile({ main: 'x = 1' }, 'main');
  assert.deepEqual(r, { ok: true, config: { x: 1 } });
});
