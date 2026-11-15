import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import {
  compile, diff, applyDiff, formatText, formatJson, summarize,
  escapePointer, unescapePointer, parsePointer, formatPointer,
} from '../src/index.js';

const ok = (files, entry = 'main', schema) => {
  const r = compile(files, entry, schema);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.config;
};

test('index: xuất đủ API', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile', 'diff', 'applyDiff',
    'formatText', 'formatJson', 'summarize', 'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof api[n], 'function', n);
  }
});

test('compile: ví dụ SPEC mục 9 (sau khi bỏ dấu phẩy thừa)', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }\n';
  const c = ok({ main: src });
  assert.deepEqual(c, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  assert.deepEqual(Object.keys(c), ['name', 'ports', 'http', 'https']);
});

test('compile: include, trộn sâu, ghi đè, thứ tự khóa', () => {
  const c = ok({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  });
  assert.deepEqual(c, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(c), ['server', 'mode']);
});

test('compile: ghi đè giữ vị trí khóa; mảng thay hẳn; Block/Assign thay nhau', () => {
  const c = ok({
    main: 'include "o"\na { y = 1 }\nb = [3]\nc = 5',
    o: 'a = 1\nb = [1,2]\nc { x = 1 }',
  });
  assert.deepEqual(c, { a: { y: 1 }, b: [3], c: 5 });
  assert.deepEqual(Object.keys(c), ['a', 'b', 'c']);
});

test('compile: Ref giữ kiểu, nội suy chuỗi hoá, không chia sẻ tham chiếu', () => {
  const c = ok({
    main: 'n = 1.50\nb = true\nz = null\nbig = 1e21\narr = [1, 2]\nobj { k = "v" }\n' +
      'pn = "${n}"\npz = "${z}"\ns = "n=${n} b=${b} z=${z} big=${big}"\nl = "${late}"\nlate = "x"\n' +
      'a1 = "${arr}"\na2 = "${arr}"\no1 = "${obj}"\nempty = ""\nlast = "${arr.1}"',
  });
  assert.equal(c.pn, 1.5);
  assert.equal(c.pz, null);
  assert.equal(c.s, 'n=1.5 b=true z=null big=1e+21');
  assert.equal(c.l, 'x');
  assert.deepEqual(c.a1, [1, 2]);
  assert.notEqual(c.a1, c.a2);
  assert.notEqual(c.a1, c.arr);
  c.a1.push(9);
  assert.deepEqual(c.arr, [1, 2]);
  assert.deepEqual(c.o1, { k: 'v' });
  assert.equal(c.empty, '');
  assert.equal(c.last, 2);
});

test('compile: Ref thấy giá trị cuối cùng (bị include ghi đè), nội suy lồng', () => {
  const c = ok({
    main: 'include "b"\nx = "${y}"\ny = "[${z}]"\nz = "q"',
    b: 'z = "old"\nw = "old"',
  });
  assert.deepEqual(c, { z: 'q', w: 'old', x: '[q]', y: '[q]' });
});

test('compile: const theo từng tệp, khai báo sau chỗ dùng', () => {
  const c = ok({ main: 'a = "${@k}-${@k2}"\nconst k = "1"\nconst k2 = "${@k}x"\ninclude "o"', o: 'const k = "9"\nb = "${@k}"' });
  assert.deepEqual(c, { a: '1-1x', b: '9' });
});

test('compile: lỗi parse / check có stage', () => {
  const p = compile({ main: 'a = = 1' }, 'main');
  assert.equal(p.ok, false);
  assert.equal(p.stage, 'parse');
  assert.equal(p.errors.length, 1);
  const e = compile({ main: 'a = 1' }, 'zzz');
  assert.equal(e.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
  const k = compile({ main: 'a = "${a}"' }, 'main');
  assert.equal(k.stage, 'check');
  assert.equal(k.errors[0].code, 'SEM_REF_CYCLE');
  const s = compile({ main: 'a = "x"' }, 'main', { type: 'object', fields: { a: { type: 'number' } } });
  assert.equal(s.stage, 'check');
  assert.equal(s.errors[0].code, 'SEM_TYPE_MISMATCH');
  assert.equal(compile({ main: 'a = 1' }, 'main', { type: 'object', fields: { a: { type: 'integer' } } }).ok, true);
});

test('pointer: escape / unescape / parse / format', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(unescapePointer('~1~0'), '/~');
  for (const bad of ['~', 'a~', '~2', '~x']) {
    assert.throws(() => unescapePointer(bad), { code: 'DIFF_BAD_POINTER' });
  }
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/~0'), ['a/b', '~']);
  assert.throws(() => parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => parsePointer('/a~'), { code: 'DIFF_BAD_POINTER' });
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['', 'a/b', 0]), '//a~1b/0');
});

test('diff: ví dụ SPEC, thứ tự khóa của thao tác', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(Object.keys(ops[1]), ['op', 'path', 'oldValue']);
  assert.deepEqual(Object.keys(ops[2]), ['op', 'path', 'value']);
});

test('diff: mảng thêm tăng dần, xoá giảm dần; khác loại; gốc', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.equal(diff(null, {}).length, 1);
  assert.equal(diff([], {})[0].op, 'replace');
  assert.equal(diff({ a: null }, { a: 0 })[0].op, 'replace');
  assert.equal(diff(1, 2)[0].path, '');
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff({ b: 1, B: 1, a: 1 }, {}).map((o) => o.path), ['/B', '/a', '/b']);
});

test('diff: bản sao sâu', () => {
  const a = { k: { z: 1 } };
  const ops = diff(a, {});
  ops[0].oldValue.z = 9;
  assert.equal(a.k.z, 1);
});

test('applyDiff: bất biến và lỗi', () => {
  const a = { a: { b: [1, 2, 3] }, 'x/y': 1, t: [1, 2, 3, 4] };
  const b = { a: { b: [1, 5] }, 'x/y': 2, c: null, t: [] };
  const copy = structuredClone(a);
  assert.deepEqual(applyDiff(a, diff(a, b)), b);
  assert.deepEqual(a, copy);
  assert.deepEqual(applyDiff(1, diff(1, [2])), [2]);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/0', value: 0 }]), [0, 1]);
  const f = (doc, op) => assert.throws(() => applyDiff(doc, [op]), { code: 'DIFF_APPLY_FAILED' });
  f({ a: 1 }, { op: 'add', path: '/a', value: 1 });
  f({ a: 1 }, { op: 'remove', path: '/b', oldValue: 1 });
  f({ a: 1 }, { op: 'replace', path: '/b', oldValue: 1, value: 2 });
  f([1], { op: 'add', path: '/3', value: 1 });
  f([1], { op: 'replace', path: '/1', oldValue: 1, value: 2 });
  f({}, { op: 'add', path: '/a/b', value: 1 });
});

test('format: text / json / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  const ops = [
    { op: 'add', path: '/c', value: null },
    { op: 'remove', path: '/b', oldValue: [1, 'x'] },
    { op: 'replace', path: '', oldValue: 1, value: { a: 1 } },
  ];
  assert.equal(formatText(ops), '+ /c = null\n- /b = [1,"x"]\n~ (root): 1 -> {"a":1}');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});

test('đầu cuối: compile hai cấu hình rồi diff', () => {
  const a = ok({ main: 'p = 1\nl = [1]' });
  const b = ok({ main: 'p = 2\nl = [1, 2]' });
  assert.equal(formatText(diff(a, b)), '+ /l/1 = 2\n~ /p: 1 -> 2');
  assert.deepEqual(applyDiff(a, diff(a, b)), b);
});
