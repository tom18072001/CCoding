import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~0~1b'), 'a~/b');
  assert.equal(unescapePointer('~01'), '~1');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/b~1c/0'), ['a', 'b/c', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a', 'x/y', 2]), '/a/x~1y/2');
});

test('pointer: lỗi DIFF_BAD_POINTER', () => {
  for (const f of [() => unescapePointer('a~'), () => unescapePointer('~2'), () => parsePointer('a/b'), () => parsePointer('/a~')]) {
    assert.throws(f, (e) => e.code === 'DIFF_BAD_POINTER');
  }
});

test('diff: ví dụ mục 9', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  const keyOrder = { replace: ['op', 'path', 'oldValue', 'value'], add: ['op', 'path', 'value'], remove: ['op', 'path', 'oldValue'] };
  for (const o of ops) assert.deepEqual(Object.keys(o), keyOrder[o.op]);
});

test('diff: mảng add tăng dần, remove giảm dần; gốc; loại', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3], [1]).map((o) => o.path), ['/2', '/1']);
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.equal(diff({ a: [] }, { a: {} }).length, 1);
  assert.deepEqual(diff({ a: 1, b: [1] }, { a: 1, b: [1] }), []);
  assert.deepEqual(diff({ b: 1, a: 1, B: 1 }, {}).map((o) => o.path), ['/B', '/a', '/b']);
});

test('diff: giá trị là bản sao sâu', () => {
  const b = { n: { x: [1] } };
  const [op] = diff({}, b);
  op.value.x.push(2);
  assert.deepEqual(b, { n: { x: [1] } });
});

test('bất biến applyDiff(a, diff(a,b)) = b', () => {
  const cases = [
    [{}, {}], [1, 2], [1, 'a'], [null, 0], [null, null], [[], [1, 2, 3]], [[1, 2, 3, 4], [1]],
    [[1, [2, 3]], [1, [2, 4, 5], 6]], [{ a: [1, { b: 2 }] }, { a: [1, { b: 3, c: [] }], d: null }],
    [{ a: 1 }, [1]], [[1], { a: 1 }], [{ 'x/y': 1, '~': 2 }, { '~': 3, '': 4 }], [{ a: { b: 1 } }, { a: null }],
    [{}, JSON.parse('{"__proto__":{"z":1}}')],
  ];
  for (const [a, b] of cases) {
    const before = JSON.stringify(a);
    assert.deepEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), before);
  }
});

test('applyDiff: chèn mảng, gốc, và lỗi DIFF_APPLY_FAILED', () => {
  assert.deepEqual(applyDiff([1, 2], [{ op: 'add', path: '/2', value: 3 }, { op: 'add', path: '/0', value: 0 }]), [0, 1, 2, 3]);
  assert.equal(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: 5 }]), 5);
  assert.equal(applyDiff(1, [{ op: 'add', path: '', value: 7 }]), 7);
  const bad = [
    [{ a: 1 }, { op: 'add', path: '/a', value: 2 }],
    [{ a: 1 }, { op: 'remove', path: '/b' }],
    [{ a: 1 }, { op: 'replace', path: '/b', value: 1 }],
    [[1], { op: 'add', path: '/2', value: 1 }],
    [[1], { op: 'remove', path: '/1' }],
    [[1], { op: 'replace', path: '/1', value: 1 }],
    [[1], { op: 'add', path: '/x', value: 1 }],
    [{ a: 1 }, { op: 'add', path: '/q/r', value: 1 }],
    [{ a: 1 }, { op: 'add', path: '/a/r', value: 1 }],
    [{ a: 1 }, { op: 'remove', path: '' }],
    [{ a: 1 }, { op: 'add', path: 'a', value: 1 }],
  ];
  for (const [doc, op] of bad) assert.throws(() => applyDiff(doc, [op]), (e) => e.code === 'DIFF_APPLY_FAILED');
});

test('định dạng', () => {
  const ops = diff({ a: 1, b: 2 }, { a: 2, c: [1, 'x'] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = 2\n+ /c = [1,"x"]');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
