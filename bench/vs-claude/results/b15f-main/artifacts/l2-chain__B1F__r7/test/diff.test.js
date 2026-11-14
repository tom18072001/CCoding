import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (c) => (e) => e.code === c;

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~b/c'), 'a~0b~1c');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~0b~1c'), 'a~b/c');
  assert.equal(unescapePointer('~01'), '~1');
  assert.throws(() => unescapePointer('a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => unescapePointer('~2'), code('DIFF_BAD_POINTER'));
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a/b~1c/0'), ['a', 'b/c', '0']);
  assert.throws(() => parsePointer('a/b'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['x/y', 2, '~']), '/x~1y/2/~0');
  assert.equal(formatPointer(['']), '/');
});

test('diff: ví dụ mục 9', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
});

test('diff: bằng nhau, đổi loại, gốc', () => {
  assert.deepEqual(diff({ a: [1, { b: null }] }, { a: [1, { b: null }] }), []);
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.equal(diff(null, {}).length, 1);
  assert.equal(diff([], {}).length, 1);
  assert.equal(diff(null, 0).length, 1);
  assert.deepEqual(diff({ a: null }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: null, value: {} }]);
});

test('diff: mảng add tăng dần, remove giảm dần', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
});

test('diff: khóa sắp theo UTF-16 và thứ tự khóa của op', () => {
  const ops = diff({ b: 1, B: 1 }, { b: 2, a: 1, B: 2 });
  assert.deepEqual(ops.map((o) => o.path), ['/B', '/a', '/b']);
  const keys = Object.fromEntries(diff({ r: 1, d: 1 }, { r: 2, a: 1 }).map((o) => [o.op, Object.keys(o)]));
  assert.deepEqual(keys.add, ['op', 'path', 'value']);
  assert.deepEqual(keys.remove, ['op', 'path', 'oldValue']);
  assert.deepEqual(keys.replace, ['op', 'path', 'oldValue', 'value']);
});

test('diff: độc lập tham chiếu', () => {
  const a = { x: { k: [1] } };
  const b = { y: { k: [2] } };
  const ops = diff(a, b);
  ops[0].oldValue.k.push(9);
  ops[1].value.k.push(9);
  assert.deepEqual(a, { x: { k: [1] } });
  assert.deepEqual(b, { y: { k: [2] } });
});

const pairs = [
  [{}, {}],
  [{ a: 1 }, { a: 1, b: { c: [1, 2] } }],
  [{ a: { b: { c: 1 } } }, { a: { b: { c: [1] } } }],
  [{ a: [1, 2, 3, 4] }, { a: [1] }],
  [{ a: [1] }, { a: [1, { x: 1 }, [2]] }],
  [{ 'x/y': 1, 'a~b': { '/': 2 }, '': 3 }, { 'x/y': 2, 'a~b': { '/': 3, '~1': 1 }, '': null }],
  [[1, [2, 3]], [1, [2], 4]],
  [1, { a: 1 }],
  [{ a: 1 }, [1]],
  [null, { a: null }],
  [{ a: null }, { a: false }],
  [{ k: [{ a: 1 }, { b: 2 }] }, { k: [{ a: 2 }] }],
];

test('bất biến applyDiff(a, diff(a, b)) = b', () => {
  for (const [a, b] of pairs) {
    const snap = JSON.stringify(a);
    const out = applyDiff(a, diff(a, b));
    assert.deepEqual(out, b);
    assert.equal(JSON.stringify(a), snap, 'không đổi doc');
  }
});

test('applyDiff: lỗi DIFF_APPLY_FAILED', () => {
  const bad = (doc, op) => assert.throws(() => applyDiff(doc, [op]), code('DIFF_APPLY_FAILED'));
  bad({ a: 1 }, { op: 'add', path: '/a', value: 2 });
  bad({ a: 1 }, { op: 'remove', path: '/b', oldValue: 1 });
  bad({ a: 1 }, { op: 'replace', path: '/b', oldValue: 1, value: 2 });
  bad([1], { op: 'add', path: '/3', value: 2 });
  bad([1], { op: 'remove', path: '/1', oldValue: 2 });
  bad([1], { op: 'replace', path: '/1', oldValue: 1, value: 2 });
  bad({}, { op: 'add', path: '/x/y', value: 1 });
  bad({ a: 1 }, { op: 'add', path: '/a/b', value: 1 });
});

test('applyDiff: chèn mảng, thay gốc', () => {
  assert.deepEqual(applyDiff([1, 3], [{ op: 'add', path: '/1', value: 2 }]), [1, 2, 3]);
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.deepEqual(applyDiff({ a: 1 }, [{ op: 'replace', path: '', oldValue: {}, value: [1] }]), [1]);
  assert.deepEqual(applyDiff(1, [{ op: 'add', path: '', value: 5 }]), 5);
});

test('applyDiff: độc lập tham chiếu', () => {
  const v = { k: 1 };
  const out = applyDiff({}, [{ op: 'add', path: '/a', value: v }]);
  out.a.k = 2;
  assert.equal(v.k, 1);
});

test('formatText / formatJson / summarize', () => {
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(
    formatText([
      { op: 'replace', path: '', oldValue: 1, value: { a: [1, 'x'] } },
      { op: 'add', path: '/b', value: null },
      { op: 'remove', path: '/c', oldValue: 'z' },
    ]),
    '~ (root): 1 -> {"a":[1,"x"]}\n+ /b = null\n- /c = "z"',
  );
  assert.equal(formatJson([]), '[]');
  const ops = diff({ a: 1 }, { a: 2, b: 3 });
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(diff({ a: 1, c: 1 }, { a: 2, b: 3 })), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
