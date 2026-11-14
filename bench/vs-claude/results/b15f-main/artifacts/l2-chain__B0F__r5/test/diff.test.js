import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePointer, unescapePointer, parsePointer, formatPointer,
  diff, applyDiff, formatText, formatJson, summarize,
} from '../src/diff.js';

const code = (c) => (e) => e.code === c;

test('pointer: escape/unescape/parse/format', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~1b~0c'), 'a/b~c');
  assert.equal(unescapePointer('~01'), '~1');
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['x/y', 0, '']), '/x~1y/0/');
});

test('pointer: lỗi DIFF_BAD_POINTER', () => {
  assert.throws(() => unescapePointer('a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => unescapePointer('~2'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('a/b'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~'), code('DIFF_BAD_POINTER'));
  assert.throws(() => parsePointer('/a~9'), code('DIFF_BAD_POINTER'));
});

test('diff: ví dụ mục 9 (kể cả thứ tự khóa)', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepStrictEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(Object.keys(ops[1]), ['op', 'path', 'oldValue']);
  assert.deepEqual(Object.keys(ops[2]), ['op', 'path', 'value']);
});

test('diff: mảng add tăng dần, remove giảm dần', () => {
  assert.deepStrictEqual(diff([1], [1, 2, 3]), [
    { op: 'add', path: '/1', value: 2 },
    { op: 'add', path: '/2', value: 3 },
  ]);
  assert.deepStrictEqual(diff([1, 2, 3, 4], [1]), [
    { op: 'remove', path: '/3', oldValue: 4 },
    { op: 'remove', path: '/2', oldValue: 3 },
    { op: 'remove', path: '/1', oldValue: 2 },
  ]);
});

test('diff: khác loại, null, gốc vô hướng, bằng nhau', () => {
  assert.deepStrictEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepStrictEqual(diff([], {}), [{ op: 'replace', path: '', oldValue: [], value: {} }]);
  assert.deepStrictEqual(diff({ a: 1 }, { a: '1' }), [{ op: 'replace', path: '/a', oldValue: 1, value: '1' }]);
  assert.deepStrictEqual(diff(1, 2), [{ op: 'replace', path: '', oldValue: 1, value: 2 }]);
  assert.deepStrictEqual(diff({ a: [1, { b: null }] }, { a: [1, { b: null }] }), []);
  assert.deepStrictEqual(diff('x', 'x'), []);
});

test('diff: khóa sắp theo sort() mặc định', () => {
  const ops = diff({}, { b: 1, a: 1, B: 1, '': 1 });
  assert.deepEqual(ops.map((o) => o.path), ['/', '/B', '/a', '/b']);
});

test('diff: bản sao sâu độc lập', () => {
  const a = { k: { n: [1] } };
  const b = { z: { m: [2] } };
  const ops = diff(a, b);
  ops[0].oldValue.n.push(99);
  ops[1].value.m.push(99);
  assert.deepStrictEqual(a, { k: { n: [1] } });
  assert.deepStrictEqual(b, { z: { m: [2] } });
});

test('applyDiff: bất biến applyDiff(a, diff(a, b)) = b', () => {
  const pairs = [
    [{ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null }],
    [[1, 2], [1, 2, 3, 4, 5]],
    [[1, 2, 3, 4, 5], [9]],
    [{ a: 1 }, [1]],
    [{ a: [1, [2, 3]] }, { a: [1, [2, 3, 4]], '~': { '/': 1 } }],
    [1, 'x'],
    [null, { a: 1 }],
    ['s', 's'],
    [[{ a: 1 }, { b: 2 }], [{ a: 1, c: 3 }]],
    [{}, []],
  ];
  for (const [a, b] of pairs) {
    const before = JSON.stringify(a);
    assert.deepStrictEqual(applyDiff(a, diff(a, b)), b);
    assert.equal(JSON.stringify(a), before);
  }
});

test('applyDiff: add vào mảng là chèn; path "" thay gốc; không đổi doc', () => {
  const doc = { l: [1, 3] };
  assert.deepStrictEqual(applyDiff(doc, [{ op: 'add', path: '/l/1', value: 2 }]), { l: [1, 2, 3] });
  assert.deepStrictEqual(doc, { l: [1, 3] });
  assert.deepStrictEqual(applyDiff(doc, [{ op: 'replace', path: '', oldValue: doc, value: 5 }]), 5);
  assert.deepStrictEqual(applyDiff(1, [{ op: 'add', path: '', value: [1] }]), [1]);
  assert.deepStrictEqual(applyDiff(doc, []), doc);
});

test('applyDiff: bản sao độc lập với ops và doc', () => {
  const val = { q: [1] };
  const res = applyDiff({}, [{ op: 'add', path: '/v', value: val }]);
  res.v.q.push(2);
  assert.deepStrictEqual(val, { q: [1] });
  const doc = { v: { q: [1] } };
  const res2 = applyDiff(doc, []);
  res2.v.q.push(2);
  assert.deepStrictEqual(doc, { v: { q: [1] } });
});

test('applyDiff: lỗi DIFF_APPLY_FAILED', () => {
  const bad = (doc, op) => assert.throws(() => applyDiff(doc, [op]), code('DIFF_APPLY_FAILED'));
  bad({ a: 1 }, { op: 'add', path: '/a', value: 2 });
  bad({ a: 1 }, { op: 'remove', path: '/b', oldValue: 1 });
  bad({ a: 1 }, { op: 'replace', path: '/b', oldValue: 1, value: 2 });
  bad([1], { op: 'add', path: '/3', value: 2 });
  bad([1], { op: 'add', path: '/-', value: 2 });
  bad([1], { op: 'remove', path: '/1', oldValue: 2 });
  bad([1], { op: 'replace', path: '/x', oldValue: 1, value: 2 });
  bad({ a: 1 }, { op: 'add', path: '/a/b/c', value: 2 });
  bad(1, { op: 'add', path: '/a', value: 2 });
  bad({ a: 1 }, { op: 'remove', path: '', oldValue: {} });
  bad({ a: 1 }, { op: 'add', path: 'a', value: 2 });
  bad({ a: 1 }, { op: 'add', path: '/a~', value: 2 });
});

test('formatText / formatJson / summarize', () => {
  const ops = diff({ a: 1, b: 2 }, { a: 2, c: [1, 2] });
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n- /b = 2\n+ /c = [1,2]');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepStrictEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepStrictEqual(summarize([]), { add: 0, remove: 0, replace: 0 });
});
