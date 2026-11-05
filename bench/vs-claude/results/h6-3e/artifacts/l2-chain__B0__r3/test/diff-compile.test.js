import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize, compile,
} from '../src/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('JSON Pointer', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.equal(unescapePointer('~1~0'), '/~');
  assert.equal(code(() => unescapePointer('a~')), 'DIFF_BAD_POINTER');
  assert.equal(code(() => unescapePointer('~2')), 'DIFF_BAD_POINTER');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.equal(code(() => parsePointer('a')), 'DIFF_BAD_POINTER');
  assert.equal(code(() => parsePointer('/a~')), 'DIFF_BAD_POINTER');
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0, '']), '/a~1b/0/');
});

test('diff: ví dụ trong đặc tả và thứ tự khóa của thao tác', () => {
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

test('diff: mảng, loại khác nhau, gốc, bằng nhau, sao chép sâu', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff([], {}), [{ op: 'replace', path: '', oldValue: [], value: {} }]);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), []);
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff({ b: 1, B: 1, a: 1 }, {}).map((o) => o.path), ['/B', '/a', '/b']);
  const b = { k: { z: 1 } };
  const ops = diff({}, b);
  ops[0].value.z = 9;
  assert.deepEqual(b, { k: { z: 1 } });
});

test('applyDiff: round-trip và không đổi đầu vào', () => {
  const cases = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1, 'm~n': [] }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [[1, 2, 3, 4, 5], [1, 9]],
    [[1], [1, [2], { q: 1 }]],
    [{ a: 1 }, [1]],
    [1, { a: 1 }],
    [{ a: [{ x: 1 }, { y: 2 }] }, { a: [{ x: 2 }, { y: 2 }, 3], '': 0 }],
    [{ a: 1 }, { a: 1 }],
  ];
  for (const [a, b] of cases) {
    const before = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), before);
  }
});

test('applyDiff: lỗi DIFF_APPLY_FAILED và thay gốc', () => {
  assert.equal(code(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 2 }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff({}, [{ op: 'remove', path: '/a' }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff({}, [{ op: 'replace', path: '/a', value: 1 }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff([1], [{ op: 'remove', path: '/1' }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff([1], [{ op: 'add', path: '/3', value: 0 }])), 'DIFF_APPLY_FAILED');
  assert.equal(code(() => applyDiff({}, [{ op: 'add', path: '/a/b', value: 0 }])), 'DIFF_APPLY_FAILED');
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }, { op: 'add', path: '/0', value: 0 }]), [0, 1, 2]);
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', value: 5 }]), 5);
  assert.deepEqual(applyDiff(1, [{ op: 'add', path: '', value: [] }]), []);
});

test('formatText / formatJson / summarize', () => {
  const ops = diff({ a: 1, b: [1], 'x y': 'q' }, { a: 2, c: { d: 1 }, 'x y': 'q' });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = [1]\n+ /c = {"d":1}');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});

test('compile: thành công, gồm include và ghi đè', () => {
  const r = compile({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' }, 'main');
  assert.deepEqual(r, { ok: true, config: { server: { host: 'a', port: 2 }, mode: 'prod' } });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
  const ex = compile({ main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }' }, 'main');
  assert.deepEqual(ex.config, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
});

test('compile: lỗi từng tầng', () => {
  const ex = compile({ main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }' }, 'main');
  assert.equal(ex.ok, false);
  assert.equal(ex.stage, 'parse');
  assert.equal(ex.errors.length, 1);
  assert.equal(ex.errors[0].code, 'PARSE_UNEXPECTED_TOKEN');
  assert.deepEqual([ex.errors[0].line, ex.errors[0].column], [5, 29]);

  const nf = compile({}, 'main');
  assert.equal(nf.stage, 'parse');
  assert.equal(nf.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');

  const inc = compile({ main: 'include "zzz"\nx = 1' }, 'main');
  assert.equal(inc.ok, false);
  assert.equal(inc.stage, 'check');
  assert.ok(Array.isArray(inc.errors) && inc.errors.length > 0);
  assert.equal(inc.errors[0].code, 'SEM_INCLUDE_NOT_FOUND');
  assert.equal('config' in inc, false);
});
