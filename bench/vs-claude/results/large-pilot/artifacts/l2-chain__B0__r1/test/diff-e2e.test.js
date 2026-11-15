import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compile, diff, applyDiff, formatText, formatJson, summarize,
  escapePointer, unescapePointer, parsePointer, formatPointer,
} from '../src/index.js';

const rejects = (fn, code) => assert.throws(fn, (e) => e.code === code);

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(unescapePointer('a~1b~0'), 'a/b~');
  rejects(() => unescapePointer('a~'), 'DIFF_BAD_POINTER');
  rejects(() => unescapePointer('~2'), 'DIFF_BAD_POINTER');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/~0'), ['a/b', '~']);
  rejects(() => parsePointer('a'), 'DIFF_BAD_POINTER');
  rejects(() => parsePointer('/a~x'), 'DIFF_BAD_POINTER');
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0, '']), '/a~1b/0/');
});

test('diff: ví dụ SPEC mục 9 với đúng thứ tự khóa và thao tác', () => {
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
  assert.deepEqual(Object.keys(ops[1]), ['op', 'path', 'oldValue']);
  assert.deepEqual(Object.keys(ops[2]), ['op', 'path', 'value']);
});

test('diff: mảng thêm tăng dần, xóa giảm dần; loại khác nhau là replace', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3], [1]).map((o) => o.path), ['/2', '/1']);
  assert.deepEqual(diff([], {}), [{ op: 'replace', path: '', oldValue: [], value: {} }]);
  assert.equal(diff(null, {}).length, 1);
  assert.equal(diff(null, null).length, 0);
  assert.equal(diff(1, '1').length, 1);
  assert.deepEqual(diff({ a: 1 }, { a: 1 }), []);
});

test('diff: khóa sắp theo UTF-16 và giá trị là bản sao sâu', () => {
  const ops = diff({ b: 1, B: 1 }, {});
  assert.deepEqual(ops.map((o) => o.path), ['/B', '/b']);
  const nested = { k: [1] };
  const [op] = diff({}, { n: nested });
  op.value.k.push(2);
  assert.deepEqual(nested, { k: [1] });
});

test('applyDiff: bất biến apply(diff(a,b),a) = b và không đổi đầu vào', () => {
  const cases = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1, '~': 0 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [[1, 2], [1, 2, 3, 4]],
    [[1, 2, 3, 4], [9]],
    [1, { a: 1 }],
    [{ a: [{ b: 1 }] }, { a: [{ b: 2 }, { c: [] }] }],
  ];
  for (const [a, b] of cases) {
    const before = structuredClone(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.deepEqual(a, before);
  }
});

test('applyDiff: lỗi DIFF_APPLY_FAILED', () => {
  rejects(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }]), 'DIFF_APPLY_FAILED');
  rejects(() => applyDiff({}, [{ op: 'remove', path: '/a' }]), 'DIFF_APPLY_FAILED');
  rejects(() => applyDiff({}, [{ op: 'replace', path: '/a', value: 1 }]), 'DIFF_APPLY_FAILED');
  rejects(() => applyDiff([1], [{ op: 'add', path: '/3', value: 1 }]), 'DIFF_APPLY_FAILED');
  rejects(() => applyDiff([1], [{ op: 'remove', path: '/1' }]), 'DIFF_APPLY_FAILED');
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.equal(applyDiff({ a: 1 }, [{ op: 'replace', path: '', value: 5 }]), 5);
});

test('formatText / formatJson / summarize', () => {
  const ops = diff({ a: 1, b: 2 }, { a: 3, c: [1] });
  assert.equal(formatText(ops), '~ /a: 1 -> 3\n- /b = 2\n+ /c = [1]');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});

test('compile: thành công, include và ghi đè', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  };
  const r = compile(files, 'main');
  assert.deepEqual(r, { ok: true, config: { server: { host: 'a', port: 2 }, mode: 'prod' } });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('compile: ví dụ SPEC mục 9 và lỗi parse', () => {
  const src = (tail) => `const env = "prod"\nname = "svc-\${@env}"\nports = [80, 443]\nhttp { port = "\${ports.0}" }\nhttps { port = "\${ports.1}" ${tail}}`;
  const bad = compile({ main: src(', ') }, 'main');
  assert.equal(bad.ok, false);
  assert.equal(bad.stage, 'parse');
  assert.equal(bad.errors.length, 1);
  assert.equal(bad.errors[0].code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(bad.errors[0].line, 5);
  const ok = compile({ main: src('') }, 'main');
  assert.deepEqual(ok.config, {
    name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 },
  });
});

test('compile: lỗi check có stage và mảng lỗi của check', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
  assert.deepEqual(Object.keys(r), ['ok', 'stage', 'errors']);
});

test('compile → diff đầu cuối', () => {
  const a = compile({ main: 'v = 1\nl = [1, 2]' }, 'main').config;
  const b = compile({ main: 'v = 2\nl = [1]\nn = "x"' }, 'main').config;
  const ops = diff(a, b);
  assert.equal(formatText(ops), '- /l/1 = 2\n+ /n = "x"\n~ /v: 1 -> 2');
  assert.deepEqual(applyDiff(a, ops), b);
});
