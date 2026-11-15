import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize, parse, parseProject, check, evaluate, compile,
  diff, applyDiff, formatText, formatJson, summarize,
  escapePointer, unescapePointer, parsePointer, formatPointer,
} from '../src/index.js';

const prog = (files, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.program;
};
const codes = (errs) => errs.map((e) => [e.code, e.file, e.line, e.column]);
const lexErr = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false);
  return [r.error.code, r.error.line, r.error.column];
};

// ---------- tầng 1a ----------
test('lexer: token, vị trí, eof, BOM, xuống dòng', () => {
  const r = tokenize('﻿a = 1\r\nb = "x"\rc');
  assert.equal(r.ok, true);
  const t = r.tokens;
  assert.deepEqual(t.map((x) => [x.type, x.line, x.column]), [
    ['ident', 1, 1], ['punct', 1, 3], ['number', 1, 5],
    ['ident', 2, 1], ['punct', 2, 3], ['string', 2, 5],
    ['ident', 3, 1], ['eof', 3, 2],
  ]);
  assert.equal(t.at(-1).value, null);
});

test('lexer: chú thích và từ khóa', () => {
  const r = tokenize('# x\n// y\n/* a\nb */ const include true');
  assert.deepEqual(r.tokens.map((x) => x.type), ['keyword', 'keyword', 'keyword', 'eof']);
  assert.equal(r.tokens[0].line, 4);
  assert.equal(r.tokens[0].column, 6);
});

test('lexer: số', () => {
  const v = (s) => tokenize(s).tokens[0].value;
  assert.equal(v('-1.5e2'), -150);
  assert.ok(Object.is(v('-0'), 0));
  assert.equal(v('0'), 0);
  for (const bad of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '+1']) {
    assert.equal(tokenize(bad).ok, false, bad);
  }
  assert.deepEqual(lexErr('a = 12abc'), ['LEX_BAD_NUMBER', 1, 5]);
  assert.deepEqual(lexErr('.5'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.equal(tokenize('[1,2]').tokens.length, 6);
});

test('lexer: chuỗi, thoát, nội suy', () => {
  const p = (s) => tokenize(s).tokens[0].value;
  assert.deepEqual(p('"a${b.0}c$d\\$"'), [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['b', '0'], const: false, line: 1, column: 3 },
    { type: 'Text', value: 'c$d$' },
  ]);
  assert.deepEqual(p('"\\u0041\\n\\/"'), [{ type: 'Text', value: 'A\n/' }]);
  assert.deepEqual(p('"\\${a}"'), [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(p('""'), []);
  const r = p('"${@c.1}"')[0];
  assert.deepEqual([r.path, r.const], [['c', '1'], true]);
});

test('lexer: mã lỗi và vị trí', () => {
  assert.deepEqual(lexErr('a = "abc'), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(lexErr('a = "abc\n"'), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(lexErr('\n /* x'), ['LEX_UNTERMINATED_COMMENT', 2, 2]);
  assert.deepEqual(lexErr('a = "x\\q"'), ['LEX_BAD_ESCAPE', 1, 7]);
  assert.deepEqual(lexErr('"\\u12G4"'), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(lexErr('"\\\n"'), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(lexErr('a = "x${}"'), ['LEX_BAD_INTERPOLATION', 1, 7]);
  assert.deepEqual(lexErr('a = "x${a b}"'), ['LEX_BAD_INTERPOLATION', 1, 7]);
  assert.deepEqual(lexErr('"${1a}"'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(lexErr('"${a.01}"'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(lexErr('"${a'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(lexErr('a / b'), ['LEX_UNEXPECTED_CHAR', 1, 3]);
  assert.deepEqual(lexErr('é'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.deepEqual(lexErr('"\u{1F600}" @'), ['LEX_UNEXPECTED_CHAR', 1, 6]);
});

// ---------- tầng 1b ----------
test('parser: hình dạng AST', () => {
  const r = parse('const c = 1\na = [1, "x${@c}",]\nb { include "f" }');
  assert.equal(r.ok, true);
  const [c, a, b] = r.ast.body;
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'c', value: { type: 'Number', line: 1, column: 11, value: 1 } },
      {
        type: 'Assign', line: 2, column: 1, key: 'a',
        value: {
          type: 'Array', line: 2, column: 5,
          items: [
            { type: 'Number', line: 2, column: 6, value: 1 },
            {
              type: 'String', line: 2, column: 9,
              parts: [
                { type: 'Text', value: 'x' },
                { type: 'Ref', path: ['c'], const: true, line: 2, column: 11 },
              ],
            },
          ],
        },
      },
      { type: 'Block', line: 3, column: 1, key: 'b', body: [{ type: 'Include', line: 3, column: 5, path: 'f' }] },
    ],
  });
  assert.ok(c && a && b);
});

test('parser: lỗi cú pháp', () => {
  const e = (s) => { const r = parse(s); assert.equal(r.ok, false, s); return [r.error.code, r.error.line, r.error.column]; };
  assert.deepEqual(e('a = '), ['PARSE_UNEXPECTED_EOF', 1, 5]);
  assert.deepEqual(e('a {'), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(e('a = [1'), ['PARSE_UNEXPECTED_EOF', 1, 7]);
  assert.deepEqual(e('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(e('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(e('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(e('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(e('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(e('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(e('include "a${b}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(e('include 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(e('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(e('a {\n const x = 1\n}'), ['PARSE_CONST_NOT_TOP', 2, 2]);
  assert.deepEqual(e('a = 1 a = @'), ['LEX_UNEXPECTED_CHAR', 1, 11]);
  assert.equal(parse('a = []\nb = [1,]\ninclude ""').ok, true);
  assert.equal(parse('include ""').ast.body[0].path, '');
});

test('parseProject: duyệt tiền thứ tự, chỉ tệp tới được', () => {
  const r = parseProject({
    main: 'include "b"\na { include "c" }\ninclude "zz"',
    b: 'include "d"', c: 'x = 1', d: 'y = 1', unused: '@@@',
  }, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);
  assert.equal(r.program.entry, 'main');
});

test('parseProject: lỗi có tên tệp', () => {
  const r = parseProject({ main: 'include "b"\ninclude "c"', b: 'x = ', c: 'y = @' }, 'main');
  assert.deepEqual(r.error && [r.error.code, r.error.file, r.error.line, r.error.column], ['PARSE_UNEXPECTED_EOF', 'b', 1, 5]);
  const n = parseProject({}, 'm');
  assert.deepEqual(n.error && [n.error.code, n.error.file, n.error.line, n.error.column], ['PARSE_ENTRY_NOT_FOUND', 'm', 1, 1]);
  // vòng include không làm treo
  assert.equal(parseProject({ a: 'include "a"' }, 'a').ok, true);
});

// ---------- tầng 2 ----------
test('check pha A: trùng khóa, trùng hằng, include', () => {
  const p = prog({
    main: 'a = 1\na { }\na = 2\nconst k = 1\nconst k = 2\nx { y = 1 }\nx { y = 1 y = 2 }\ninclude "b"\ninclude "nope"\ninclude "main"',
    b: 'a = 1\ninclude "main"\nz = 1\nz = 2',
  });
  assert.deepEqual(codes(check(p)), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_CONST', 'main', 5, 1],
    ['SEM_DUPLICATE_KEY', 'main', 7, 1],
    ['SEM_DUPLICATE_KEY', 'main', 7, 11],
    ['SEM_INCLUDE_NOT_FOUND', 'main', 9, 1],
    ['SEM_INCLUDE_CYCLE', 'main', 10, 1],
    ['SEM_INCLUDE_CYCLE', 'b', 2, 1],
    ['SEM_DUPLICATE_KEY', 'b', 4, 1],
  ]);
});

test('check pha A: hình thoi không phải vòng, khóa trùng giữa tệp không lỗi', () => {
  const p = prog({
    main: 'include "b"\ninclude "c"\nk = 1', b: 'include "d"', c: 'include "d"\nk = 2', d: 'k = 3',
  });
  assert.deepEqual(check(p), []);
});

test('check pha B: tham chiếu', () => {
  const p = prog({
    main: [
      'const c = 1',
      'const d = "${x}"',
      'u = "${nope}"',
      'v = "${@missing}"',
      'a = "${a}"',
      'p = "${q}"',
      'q = "${p}"',
      'x { y = "${x}" }',
      'arr = [1]',
      'bad = "i${arr}"',
      'ok = "${arr}"',
      'obj { z = 1 }',
      'bad2 = "${obj}${@c}"',
      'bad3 = "${@c}${@c}"',
      'e = "${arr.5}"',
    ].join('\n'),
  });
  const got = codes(check(p));
  assert.deepEqual(got, [
    ['SEM_CONST_CONFIG_REF', 'main', 2, 12],
    ['SEM_UNDEFINED_REF', 'main', 3, 6],
    ['SEM_UNDEFINED_REF', 'main', 4, 6],
    ['SEM_REF_CYCLE', 'main', 5, 6],
    ['SEM_REF_CYCLE', 'main', 6, 6],
    ['SEM_REF_CYCLE', 'main', 7, 6],
    ['SEM_REF_CYCLE', 'main', 8, 10],
    ['SEM_BAD_INTERPOLATION', 'main', 10, 9],
    ['SEM_BAD_INTERPOLATION', 'main', 13, 9],
    ['SEM_UNDEFINED_REF', 'main', 15, 6],
  ]);
});

test('check pha B: hằng theo tệp, chuỗi không xuyên được', () => {
  const p = prog({
    main: 'include "b"\nconst c = [1, "s"]\na = "${@c.1}"\nb = "${@c.2}"\ns = "t"\nr = "${s.0}"\nu = "${@zz}"',
    b: 'w = "${@c}"',
  });
  assert.deepEqual(codes(check(p)), [
    ['SEM_UNDEFINED_REF', 'main', 4, 6],
    ['SEM_UNDEFINED_REF', 'main', 6, 6],
    ['SEM_UNDEFINED_REF', 'main', 7, 6],
    ['SEM_UNDEFINED_REF', 'b', 1, 6],
  ]);
});

test('check pha B: tham chiếu ghi đè vẫn được xét; thấy giá trị cuối', () => {
  const p = prog({ main: 'include "b"\na = 1', b: 'a = "${nope}"' });
  assert.deepEqual(codes(check(p)), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
  assert.deepEqual(codes(check(prog({ main: 'b = "${a}"\na = 1' }))), []);
});

const schema = {
  type: 'object',
  closed: true,
  fields: {
    name: { type: 'string', required: true },
    port: { type: 'integer' },
    mode: { enum: ['dev', 'prod'] },
    tags: { type: 'array', items: { type: 'string' } },
    srv: { type: 'object', fields: { host: { type: 'string', required: true } } },
  },
};

test('check pha C: lược đồ', () => {
  const p = prog({
    main: 'port = 1.5\nmode = "x"\ntags = ["a", 2]\nsrv {\n  other = 1\n}\nextra = 1',
  });
  assert.deepEqual(codes(check(p, schema)), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_NOT_IN_ENUM', 'main', 2, 8],
    ['SEM_TYPE_MISMATCH', 'main', 3, 14],
    ['SEM_MISSING_REQUIRED', 'main', 4, 1],
    ['SEM_UNKNOWN_KEY', 'main', 7, 1],
  ]);
});

test('check pha C: vị trí qua chuỗi thuần tham chiếu; pha C bị chặn bởi pha B', () => {
  const p = prog({ main: 'v = 1\nname = "${v}"' });
  assert.deepEqual(codes(check(p, { type: 'object', fields: { name: { type: 'string' } } })), [['SEM_TYPE_MISMATCH', 'main', 2, 8]]);
  const q = prog({ main: 'name = "${zz}"' });
  assert.deepEqual(codes(check(q, schema)), [['SEM_UNDEFINED_REF', 'main', 1, 9]]);
});

// ---------- tầng 3 ----------
test('evaluate: ví dụ mục 9', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }';
  assert.deepEqual(evaluate(prog({ main: src })), {
    name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 },
  });
});

test('evaluate: include, hợp nhất sâu, thứ tự khóa', () => {
  const out = evaluate(prog({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  }));
  assert.deepEqual(out, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(out), ['server', 'mode']);
});

test('evaluate: ghi đè, mảng thay hẳn, tham chiếu thấy giá trị cuối', () => {
  const out = evaluate(prog({
    main: 'a = 1\nb = "${a}"\nx { p = 1 }\nx = 5\nx { q = 2 }\nl = [1,2]\nl = [3]\na = 2\nz = "${l}"',
  }));
  assert.deepEqual(out, { a: 2, b: 2, x: { q: 2 }, l: [3], z: [3] });
  assert.deepEqual(Object.keys(out), ['a', 'b', 'x', 'l', 'z']);
});

test('evaluate: nội suy, kiểu, không chia sẻ tham chiếu', () => {
  const out = evaluate(prog({
    main: 'n = 1.50\nbig = 1e21\nt = true\nz = null\nl = [1]\ns = "${n}|${big}|${t}|${z}|${nested}"\nnested = "<${n}>"\ng = "${l}"\nh = "${l}"\ne = ""\nk = "${z}"',
  }));
  assert.equal(out.s, '1.5|1e+21|true|null|<1.5>');
  assert.equal(out.k, null);
  assert.equal(out.e, '');
  out.g.push(9);
  assert.deepEqual(out.h, [1]);
  assert.deepEqual(out.l, [1]);
  assert.notEqual(out.g, out.h);
});

test('evaluate: tham chiếu đối tượng, hằng với chỉ mục', () => {
  const out = evaluate(prog({
    main: 'const lst = ["a", "b"]\no { k = "v" }\ncopy = "${o}"\nsub = "${o.k}"\nsec = "${@lst.1}"\nwhole = "${@lst}"',
  }));
  assert.deepEqual(out, { o: { k: 'v' }, copy: { k: 'v' }, sub: 'v', sec: 'b', whole: ['a', 'b'], });
});

// ---------- tầng 4 ----------
test('diff: con trỏ JSON', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(unescapePointer('~1~0'), '/~');
  for (const bad of ['~', 'a~2', '~x']) {
    assert.throws(() => unescapePointer(bad), { code: 'DIFF_BAD_POINTER' });
  }
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.throws(() => parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => parsePointer('/a~'), { code: 'DIFF_BAD_POINTER' });
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0, '']), '/a~1b/0/');
});

test('diff: ví dụ mục 9 và quy tắc mảng', () => {
  const a = { a: { b: [1, 2, 3] }, 'x/y': 1 };
  const b = { a: { b: [1, 5] }, 'x/y': 2, c: null };
  const ops = diff(a, b);
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff([], {}).length, 1);
  assert.deepEqual(diff({ a: null }, { a: 0 }).length, 1);
});

test('diff: bản sao sâu và applyDiff', () => {
  const a = { k: [1, { z: 1 }], o: { p: 1 } };
  const b = { k: [1, { z: 2 }, 3], n: { deep: [1] } };
  const ops = diff(a, b);
  ops.find((o) => o.path === '/n').value.deep.push(9);
  assert.deepEqual(b.n.deep, [1]);
  const fresh = diff(a, b);
  const snap = structuredClone(a);
  assert.deepEqual(applyDiff(a, fresh), b);
  assert.deepEqual(a, snap);
  assert.deepEqual(applyDiff(1, [{ op: 'replace', path: '', oldValue: 1, value: { x: 1 } }]), { x: 1 });
  assert.deepEqual(applyDiff([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
  for (const op of [
    { op: 'add', path: '/a', value: 1 },
    { op: 'remove', path: '/zz' },
    { op: 'replace', path: '/zz', value: 1 },
    { op: 'add', path: '/l/5', value: 1 },
    { op: 'remove', path: '/l/9' },
  ]) {
    assert.throws(() => applyDiff({ a: 1, l: [1] }, [op]), { code: 'DIFF_APPLY_FAILED' });
  }
});

test('diff: định dạng', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = diff({ a: 1, b: 2 }, { a: [1], c: 'x' });
  assert.equal(formatText(ops), '~ /a: 1 -> [1]\n- /b = 2\n+ /c = "x"');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
});

// ---------- compile ----------
test('compile: đường ống đầu cuối', () => {
  assert.deepEqual(compile({ main: 'a = 1' }, 'main'), { ok: true, config: { a: 1 } });
  const p = compile({ main: 'a = ' }, 'main');
  assert.equal(p.ok, false);
  assert.equal(p.stage, 'parse');
  assert.equal(p.errors.length, 1);
  assert.equal(p.errors[0].file, 'main');
  const c = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(c.stage, 'check');
  assert.equal(c.errors[0].code, 'SEM_UNDEFINED_REF');
  const s = compile({ main: 'port = "x"' }, 'main', { type: 'object', fields: { port: { type: 'integer' } } });
  assert.equal(s.errors[0].code, 'SEM_TYPE_MISMATCH');
  assert.equal(compile({}, 'main').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});
